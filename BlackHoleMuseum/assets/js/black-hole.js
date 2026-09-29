/* SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2026 Enigmatisms. Third-party notices: /lib/black-hole-LICENSE.txt.
 */
/* WebGL2 Schwarzschild null-geodesic renderer with procedural emitting dust.
 * Initial project reference: dgreenheck/webgpu-black-hole (MIT;
 * /lib/black-hole-LICENSE.txt). Camera and material presets are editable locally.
 */
(() => {
  'use strict';

  const canvas = document.getElementById('black-hole');
  if (!canvas) return;
  const Config = window.BlackHoleConfig;
  if (!Config) throw new Error('BlackHoleConfig must load before the renderer');
  const Shaders = window.BlackHoleShaders;
  if (!Shaders) throw new Error('BlackHoleShaders must load before the renderer');
  const Physics = window.BlackHolePhysics;
  if (!Physics) throw new Error('BlackHolePhysics must load before the renderer');
  const timePerSolarMass = 2 * Physics.constants.G * Physics.constants.SOLAR_MASS / Math.pow(Physics.constants.C, 3);
  const cameraFields = Object.create(null);
  for (const field of Config.fields.camera) cameraFields[field.key] = field;
  const stage = canvas.closest('.black-hole-stage');
  if (!stage) return;
  const hero = stage.closest('.horizon-hero') || stage;
  const header = document.querySelector('.site-header');
  const motionButton = document.getElementById('motion-toggle');
  const viewButton = document.getElementById('view-toggle');
  const viewSurface = document.getElementById('view-surface');
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const touch = !finePointer.matches;
  const qualities = [
    { pixels: 850000, steps: 160, fps: 30, dpr: 1.25 },
    { pixels: 1500000, steps: 208, fps: 30, dpr: 1.5 },
    { pixels: 2400000, steps: 256, fps: 30, dpr: 1.75 },
    { pixels: 2400000, steps: 256, fps: 60, dpr: 1.75 }
  ];
  let config = Config.clone(Config.defaults);
  let views = config.views;
  // Eight subpixel positions: image-plane sampling, never random ray-path offsets.
  const jitter = new Float32Array([
    0, -1 / 6, -1 / 4, 1 / 6, 1 / 4, -7 / 18, -3 / 8, -1 / 18,
    1 / 8, 5 / 18, -1 / 8, -5 / 18, 3 / 8, 1 / 18, -7 / 16, 7 / 18
  ]);

  let gl;
  try {
    gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance'
    });
  } catch (_) { return; }
  if (!gl) return;

  function makeNoiseVolume() {
    const count = 64 * 64 * 64;
    let source = new Uint8Array(count * 4), scratch = new Uint8Array(count * 4);
    let seed = 173;
    for (let i = 0; i < source.length; i += 1) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      source[i] = seed & 255;
    }
    // Separable periodic [1,2,1] filter. This is one-time preparation, not
    // per-frame work; it removes voxel corners before domain warping.
    for (const stride of [1, 64, 4096]) {
      for (let i = 0; i < count; i += 1) {
        const coordinate = Math.floor(i / stride) & 63;
        const previous = (i + (((coordinate + 63) & 63) - coordinate) * stride) * 4;
        const next = (i + (((coordinate + 1) & 63) - coordinate) * stride) * 4;
        const current = i * 4;
        for (let c = 0; c < 4; c += 1) {
          scratch[current + c] = (source[previous + c] + 2 * source[current + c] + source[next + c] + 2) >> 2;
        }
      }
      const swap = source; source = scratch; scratch = swap;
    }
    // Stretch B along the future angular axis before baking its ridges.
    // Eight (even) passes return to the original buffer, preserving R/G/A
    // without copying those channels or allocating another texture.
    for (let pass = 0; pass < 8; pass += 1) {
      for (let i = 0; i < count; i += 1) {
        const y = (i >> 6) & 63, current = i * 4 + 2;
        const previous = (i + (((y + 63) & 63) - y) * 64) * 4 + 2;
        const next = (i + (((y + 1) & 63) - y) * 64) * 4 + 2;
        scratch[current] = (source[previous] + 2 * source[current] + source[next] + 2) >> 2;
      }
      const swap = source; source = scratch; scratch = swap;
    }
    for (let i = 0; i < source.length; i += 4) {
      const r = Math.max(0, Math.min(1, 0.5 + (source[i] - 128) * 3.2 / 255));
      const g = Math.max(0, Math.min(1, 0.5 + (source[i + 1] - 128) * 3.2 / 255));
      const ridgeSource = Math.max(0, Math.min(1, 0.5 + (source[i + 2] - 128) * 3.2 / 255));
      const dustSource = Math.max(0, Math.min(1, 0.5 + (source[i + 3] - 128) * 3.0 / 255));
      const ridge = Math.pow(1 - Math.abs(2 * ridgeSource - 1), 4);
      const t = Math.max(0, Math.min(1, (dustSource - 0.60) / 0.25));
      const dust = t * t * (3 - 2 * t);
      source[i] = Math.round(r * 255);
      source[i + 1] = Math.round(g * 255);
      source[i + 2] = Math.round(ridge * 255);
      source[i + 3] = Math.round(dust * dust * 255);
    }
    return source;
  }
  const noiseBytes = makeNoiseVolume();
  const textures = [], framebuffers = [], programs = [];
  const queryPending = new Uint8Array(4);
  const queries = [];
  // Camera 0..6; disk 7..16 (14 emissivity index, 15 roughness);
  // appearance 17..19, RGB 20..28, clearance 29, sky 30..31;
  // gradient midpoint 32, Doppler/radiation/temperature 33..35, width 36, alpha 37.
  // Keep observer clocks and near-horizon distances in double precision.
  // Uniform uploads perform the single conversion required by WebGL.
  const pose = new Float64Array(38), targetPose = new Float64Array(38);
  const flowAngles = new Float32Array(64), flowHarmonics = new Uint32Array(64);
  // Integer harmonics share a long exact period: wrapping the clock never
  // resets a cloud. Frequency rounding is below 2.2e-8 rad per phase unit.
  for (let i = 0; i < flowHarmonics.length; i += 1) {
    const rho = Math.pow(2, i / 8);
    const omega = rho >= 3 ? Math.SQRT1_2 / Math.pow(rho, 1.5)
      : Math.sqrt(27 / 8) * (1 - 1 / rho) / (rho * rho);
    flowHarmonics[i] = Math.round(omega * Config.phasePeriod / (2 * Math.PI));
  }
  const cameraLag = new Float64Array(7);
  let sceneProgram, resolveProgram, compositeProgram, sceneUniforms, resolveUniforms, compositeUniforms;
  let noiseTexture, thermalTexture, vertexArray, timerExtension, hdr = false, maxTextureSize = 0;
  let thermalUploaded = false;
  let ready = false, lost = false, failed = false, visible = false, pageActive = true;
  let initialized = false, poseInitialized = false, sizeDirty = true;
  let windowActive = true, visibilityRatio = 0, suspended = true, occluded = false;
  let userPlaying = null, frame = 0, lastTick = 0, lastPaint = 0, elapsed = 0;
  let phaseRate = 0, phaseOrigin = 0, physicalClock = false, physicalScale = 0;
  let statisticsEnabled = false, earthSeconds = 0, localSeconds = 0, lastStatistics = 0;
  let cameraResponseMs = config.transitionMs;
  let width = 0, height = 0, cssWidth = 0, cssHeight = 0, stageLeft = 0, stageTop = 0;
  let displayWidth = 0, displayHeight = 0;
  let mobile = false, pointerX = 0, pointerY = 0, targetX = 0, targetY = 0;
  let quality = touch ? 1 : 3, qualityCeiling = touch ? 2 : 3;
  let costAverage = 0, cadenceAverage = 0, sampledFrames = 0, sampleStart = 0, lastQualityChange = 0;
  let viewIndex = 0, transitioning = false;
  let historyRead = 1, historyCount = 0, sampleIndex = 0, settleFrames = 8, queryCursor = 0;
  let pointerDownX = 0, pointerDownY = 0, dragged = false;
  let parallaxEnabled = true;

  function wantsMotion() {
    return userPlaying === null ? !motionPreference.matches && !(connection && connection.saveData) : userPlaying;
  }
  function animating() { return wantsMotion() && phaseRate !== 0; }
  function pointerMoving() { return Math.abs(targetX - pointerX) + Math.abs(targetY - pointerY) > 0.0001; }
  // A visible navigation may leave keyboard focus in the address bar. It must
  // still autoplay; actual window blur/focus events control window suspension.
  function active() { return visible && windowActive && pageActive && !document.hidden && !occluded; }
  function available() { return initialized && !lost && !failed && active(); }
  function needsFrame() { return available() && (animating() || transitioning || pointerMoving() || settleFrames > 0 || sizeDirty); }
  function fillCameraTarget() {
    const camera = views[viewIndex].camera[mobile ? 'mobile' : 'desktop'];
    const radians = Math.PI / 180;
    targetPose[0] = camera.x; targetPose[1] = 1 - camera.y;
    targetPose[2] = Math.tan(camera.fov * radians * 0.5);
    targetPose[3] = camera.elevation * radians; targetPose[4] = camera.roll * radians;
    targetPose[5] = camera.azimuth * radians; targetPose[6] = camera.distance;
  }
  function fillTarget() {
    const view = views[viewIndex];
    fillCameraTarget();
    const disk = view.disk;
    targetPose[7] = disk.horizon; targetPose[8] = disk.inner; targetPose[9] = disk.outer;
    targetPose[10] = disk.thickness; targetPose[11] = disk.density; targetPose[12] = disk.turbulence;
    targetPose[13] = disk.detail; targetPose[14] = disk.emissivityIndex; targetPose[15] = disk.roughness; targetPose[16] = disk.emission;
    phaseOrigin = disk.phase;
    targetPose[17] = view.appearance.exposure; targetPose[18] = view.appearance.bloom; targetPose[19] = view.appearance.temperature;
    targetPose[29] = view.appearance.clearance;
    targetPose[30] = view.background.density; targetPose[31] = view.background.brightness;
    const physics = view.physics;
    if (initialized && physics.radiation === 1) prepareThermalTexture();
    physicalClock = physics.physicalTime === 1;
    physicalScale = physics.timeScale * disk.speed;
    phaseRate = physicalClock ? physicalScale / (timePerSolarMass * physics.massSolar)
      : disk.speed * 8 / (Math.SQRT1_2 * Math.pow(disk.horizon, 1.5));
    targetPose[32] = view.appearance.gradientMidpoint;
    targetPose[33] = physics.doppler; targetPose[34] = physics.radiation; targetPose[35] = physics.temperatureK;
    targetPose[36] = view.appearance.gradientSoftness; targetPose[37] = physics.spectralIndex;
    let offset = 20;
    for (const key of ['cold', 'warm', 'hot']) {
      const value = Number.parseInt(view.colors[key].slice(1), 16);
      for (let shift = 16; shift >= 0; shift -= 8) {
        const channel = ((value >> shift) & 255) / 255;
        targetPose[offset++] = channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
      }
    }
  }
  function resetHistory() { historyCount = 0; sampleIndex = 0; settleFrames = 8; }
  function finishCamera() {
    const turn = Math.PI * 2;
    targetPose[5] = ((targetPose[5] + Math.PI) % turn + turn) % turn - Math.PI;
    for (let i = 0; i < 7; i += 1) pose[i] = cameraLag[i] = targetPose[i];
    for (let i = 7; i < pose.length; i += 1) pose[i] = targetPose[i];
    transitioning = false; poseInitialized = true;
    stage.dataset.transitioning = 'false';
  }
  function publicViewIndices() {
    return views.map((view, index) => view.id === 'view-1-blue' ? -1 : index).filter(index => index >= 0);
  }
  function updateControls() {
    const disabled = !ready || lost || failed;
    if (motionButton) {
      motionButton.hidden = disabled;
      motionButton.textContent = wantsMotion() ? '暂停动画' : '播放动画';
      motionButton.setAttribute('aria-label', wantsMotion() ? '暂停黑洞动画' : '播放黑洞动画');
      motionButton.setAttribute('aria-pressed', String(!wantsMotion()));
    }
    const publicIndices = publicViewIndices();
    const publicPosition = publicIndices.indexOf(viewIndex);
    const label = views[viewIndex].label;
    const nextIndex = publicIndices[(publicPosition + 1 + publicIndices.length) % publicIndices.length];
    const skipIndex = publicIndices[(publicPosition + 2 + publicIndices.length) % publicIndices.length];
    const next = views[nextIndex].label;
    const skip = views[skipIndex].label;
    const description = views.length > 2 ?
      `切换黑洞视角：当前${label}，下一视角${next}，再次点击可能进入隐藏彩蛋` :
      `切换黑洞视角：当前${label}，下一视角${next}`;
    if (viewButton) {
      viewButton.hidden = disabled || publicIndices.length < 2;
      const position = publicPosition >= 0 ? publicPosition + 1 : '彩蛋';
      viewButton.textContent = `${label} · ${position}/${publicIndices.length} ↻`;
      viewButton.setAttribute('aria-label', description);
    }
    if (viewSurface) {
      viewSurface.hidden = disabled || publicIndices.length < 2;
      viewSurface.setAttribute('aria-label', description);
    }
    stage.dataset.view = views[viewIndex].id;
  }
  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; lastTick = 0; lastPaint = 0;
    sampleStart = 0; sampledFrames = 0; costAverage = cadenceAverage = 0;
  }
  function sync() {
    const nextSuspended = !active(), changed = nextSuspended !== suspended;
    suspended = nextSuspended;
    if (changed && !suspended && (animating() || transitioning)) resetHistory();
    updateControls();
    if (!needsFrame()) stop();
    else if (!frame) frame = requestAnimationFrame(tick);
    if (changed) notify();
  }
  function fail() {
    failed = true; ready = initialized = false;
    stop();
    stage.classList.remove('is-rendered');
    delete stage.dataset.renderer;
    updateControls();
    notify();
  }
  function compile(type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Shader unavailable');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(error || 'Black hole shader compilation failed');
    }
    return shader;
  }
  function makeProgram(source) {
    const vertex = compile(gl.VERTEX_SHADER, Shaders.vertex);
    let fragment, result;
    try {
      fragment = compile(gl.FRAGMENT_SHADER, source);
      result = gl.createProgram();
      if (!result) throw new Error('Program unavailable');
      gl.attachShader(result, vertex); gl.attachShader(result, fragment); gl.linkProgram(result);
      if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
      programs.push(result);
      return result;
    } catch (error) {
      if (result) gl.deleteProgram(result);
      throw error;
    } finally {
      gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
    }
  }
  function release() {
    if (lost) return;
    for (const p of programs) gl.deleteProgram(p);
    for (const t of textures) gl.deleteTexture(t);
    for (const f of framebuffers) gl.deleteFramebuffer(f);
    for (const q of queries) if (q) gl.deleteQuery(q);
    if (noiseTexture) gl.deleteTexture(noiseTexture);
    if (thermalTexture) gl.deleteTexture(thermalTexture);
    if (vertexArray) gl.deleteVertexArray(vertexArray);
  }
  function prepareThermalTexture() {
    if (thermalUploaded) return;
    const table = Physics.blackbodyTable();
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, thermalTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, table.width, 1, 0, gl.RGBA, gl.FLOAT, table.data);
    thermalUploaded = true;
  }
  function initialize() {
    try {
      failed = false;
      programs.length = textures.length = framebuffers.length = queries.length = 0;
      hdr = Boolean(gl.getExtension('EXT_color_buffer_float'));
      maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      sceneProgram = makeProgram(Shaders.scene);
      resolveProgram = makeProgram(Shaders.resolve);
      compositeProgram = makeProgram(Shaders.composite);
      sceneUniforms = {
        resolution: gl.getUniformLocation(sceneProgram, 'uResolution'), jitter: gl.getUniformLocation(sceneProgram, 'uJitter'),
        pointer: gl.getUniformLocation(sceneProgram, 'uPointer'), view: gl.getUniformLocation(sceneProgram, 'uView'),
        roll: gl.getUniformLocation(sceneProgram, 'uRoll'), flowAngles: gl.getUniformLocation(sceneProgram, 'uFlowAngles[0]'),
        steps: gl.getUniformLocation(sceneProgram, 'uSteps'),
        orbit: gl.getUniformLocation(sceneProgram, 'uOrbit'), disk: gl.getUniformLocation(sceneProgram, 'uDisk'),
        material: gl.getUniformLocation(sceneProgram, 'uMaterial'), temperature: gl.getUniformLocation(sceneProgram, 'uTemperature'),
        background: gl.getUniformLocation(sceneProgram, 'uBackground'),
        physics: gl.getUniformLocation(sceneProgram, 'uPhysics'), detail: gl.getUniformLocation(sceneProgram, 'uDetail'),
        spectrum: gl.getUniformLocation(sceneProgram, 'uSpectrum'),
        cold: gl.getUniformLocation(sceneProgram, 'uCold'), warm: gl.getUniformLocation(sceneProgram, 'uWarm'), hot: gl.getUniformLocation(sceneProgram, 'uHot')
      };
      resolveUniforms = { resolution: gl.getUniformLocation(resolveProgram, 'uResolution'), weight: gl.getUniformLocation(resolveProgram, 'uWeight') };
      compositeUniforms = {
        resolution: gl.getUniformLocation(compositeProgram, 'uResolution'),
        exposure: gl.getUniformLocation(compositeProgram, 'uExposure'), bloom: gl.getUniformLocation(compositeProgram, 'uBloom'),
        clearance: gl.getUniformLocation(compositeProgram, 'uClearance'), mobile: gl.getUniformLocation(compositeProgram, 'uMobile')
      };
      vertexArray = gl.createVertexArray(); gl.bindVertexArray(vertexArray);
      noiseTexture = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, noiseTexture);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 64, 64, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, noiseBytes);
      gl.generateMipmap(gl.TEXTURE_3D);
      thermalTexture = gl.createTexture();
      if (!thermalTexture) throw new Error('Thermal spectrum texture unavailable');
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, thermalTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // Palette-only pages need a complete sampler, but no Planck integration.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
      thermalUploaded = false;
      for (let i = 0; i < 3; i += 1) {
        const texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
        if (!texture || !framebuffer) throw new Error('Render target unavailable');
        textures.push(texture); framebuffers.push(framebuffer);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      }
      gl.useProgram(sceneProgram); gl.uniform1i(gl.getUniformLocation(sceneProgram, 'uNoise'), 0);
      gl.uniform1i(gl.getUniformLocation(sceneProgram, 'uThermal'), 3);
      gl.useProgram(resolveProgram);
      gl.uniform1i(gl.getUniformLocation(resolveProgram, 'uScene'), 1);
      gl.uniform1i(gl.getUniformLocation(resolveProgram, 'uHistory'), 2);
      gl.useProgram(compositeProgram); gl.uniform1i(gl.getUniformLocation(compositeProgram, 'uImage'), 1);
      for (const p of programs) {
        gl.useProgram(p); gl.uniform1i(gl.getUniformLocation(p, 'uHDR'), hdr ? 1 : 0);
      }
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      timerExtension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      queryPending.fill(0); queryCursor = 0;
      if (timerExtension) {
        for (let i = 0; i < 4; i += 1) queries.push(gl.createQuery());
        if (queries.some(q => !q)) timerExtension = null;
      }
      width = height = 0; historyRead = 1; sizeDirty = true; resetHistory();
      initialized = true;
      if (views[viewIndex].physics.radiation === 1) prepareThermalTexture();
      resize();
    } catch (error) {
      console.warn('Black-hole GPU renderer unavailable:', error.message);
      release(); fail();
    }
  }
  function measure() {
    const rect = stage.getBoundingClientRect();
    cssWidth = stage.clientWidth || rect.width; cssHeight = stage.clientHeight || rect.height;
    displayWidth = rect.width; displayHeight = rect.height; stageLeft = rect.left; stageTop = rect.top;
    const viewport = window.visualViewport;
    const left = viewport ? viewport.offsetLeft : 0, top = viewport ? viewport.offsetTop : 0;
    const right = left + (viewport ? viewport.width : innerWidth);
    const bottom = top + (viewport ? viewport.height : innerHeight);
    const x0 = Math.max(rect.left, left), x1 = Math.min(rect.right, right);
    const y0 = Math.max(rect.top, top), y1 = Math.min(rect.bottom, bottom);
    let area = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    if (header && area > 0) {
      const cover = header.getBoundingClientRect();
      area -= Math.max(0, Math.min(x1, cover.right) - Math.max(x0, cover.left))
        * Math.max(0, Math.min(y1, cover.bottom) - Math.max(y0, cover.top));
    }
    visibilityRatio = rect.width > 0 && rect.height > 0 ?
      Math.max(0, Math.min(1, area / (rect.width * rect.height))) : 0;
    visible = visibilityRatio >= 0.05;
  }
  function allocate() {
    const tier = qualities[quality];
    const scale = Math.min(devicePixelRatio || 1, tier.dpr,
      Math.sqrt(tier.pixels / (cssWidth * cssHeight)), maxTextureSize / cssWidth, maxTextureSize / cssHeight);
    const nextWidth = Math.max(1, Math.round(cssWidth * scale)), nextHeight = Math.max(1, Math.round(cssHeight * scale));
    if (width === nextWidth && height === nextHeight) return false;
    width = nextWidth; height = nextHeight; canvas.width = width; canvas.height = height;
    for (let i = 0; i < 3; i += 1) {
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, textures[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, hdr ? gl.RGBA16F : gl.RGBA8, width, height, 0, gl.RGBA, hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[i]);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Framebuffer unavailable');
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    canvas.dataset.quality = String(quality);
    canvas.dataset.precision = hdr ? 'float16' : 'encoded8';
    resetHistory();
    return true;
  }
  function draw(transitioningFrame) {
    gl.bindVertexArray(vertexArray); gl.viewport(0, 0, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[0]); gl.useProgram(sceneProgram);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, noiseTexture);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, thermalTexture);
    gl.uniform2f(sceneUniforms.resolution, width, height);
    gl.uniform2f(sceneUniforms.jitter, jitter[sampleIndex * 2], jitter[sampleIndex * 2 + 1]);
    gl.uniform2f(sceneUniforms.pointer, pointerX, pointerY);
    gl.uniform4f(sceneUniforms.view, pose[0], pose[1], pose[2], pose[3]);
    gl.uniform1f(sceneUniforms.roll, pose[4]);
    const flowTime = getPhase() / Config.phasePeriod;
    for (let i = 0; i < flowAngles.length; i += 1) {
      const turns = flowTime * flowHarmonics[i];
      flowAngles[i] = (turns - Math.floor(turns)) * (2 * Math.PI);
    }
    gl.uniform1fv(sceneUniforms.flowAngles, flowAngles);
    gl.uniform2f(sceneUniforms.orbit, pose[5], pose[6]);
    gl.uniform4f(sceneUniforms.disk, pose[7], pose[8], pose[9], pose[10]);
    gl.uniform4f(sceneUniforms.material, pose[11], pose[12], pose[13], pose[16]);
    gl.uniform1f(sceneUniforms.temperature, pose[19]);
    gl.uniform2f(sceneUniforms.background, pose[30], pose[31]);
    gl.uniform3f(sceneUniforms.physics, pose[33], pose[34], pose[35]);
    gl.uniform4f(sceneUniforms.spectrum, pose[32], pose[36], pose[37], pose[14]);
    gl.uniform2f(sceneUniforms.detail, pose[15], Math.abs(phaseRate) / 60);
    gl.uniform3f(sceneUniforms.cold, pose[20], pose[21], pose[22]);
    gl.uniform3f(sceneUniforms.warm, pose[23], pose[24], pose[25]);
    gl.uniform3f(sceneUniforms.hot, pose[26], pose[27], pose[28]);
    gl.uniform1i(sceneUniforms.steps, qualities[quality].steps);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const writeIndex = historyRead === 1 ? 2 : 1;
    let weight = historyCount ? (animating() ? 0.62 : Math.min(0.875, historyCount / (historyCount + 1))) : 0;
    if (transitioningFrame) { weight = 0; historyCount = 0; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[writeIndex]); gl.useProgram(resolveProgram);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, textures[0]);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, textures[historyRead]);
    gl.uniform2f(resolveUniforms.resolution, width, height); gl.uniform1f(resolveUniforms.weight, weight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    historyRead = writeIndex; historyCount = Math.min(8, historyCount + 1); sampleIndex = (sampleIndex + 1) & 7;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.useProgram(compositeProgram);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, textures[historyRead]);
    gl.uniform2f(compositeUniforms.resolution, width, height);
    gl.uniform1f(compositeUniforms.exposure, pose[17]); gl.uniform1f(compositeUniforms.bloom, pose[18]);
    gl.uniform1f(compositeUniforms.clearance, pose[29]); gl.uniform1f(compositeUniforms.mobile, mobile ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!transitioningFrame && settleFrames > 0) settleFrames -= 1;
  }
  function resize() {
    if (lost || failed) return;
    const previousMobile = mobile;
    measure();
    if (!cssWidth || !cssHeight) { sync(); return; }
    mobile = cssWidth <= 640;
    if (!poseInitialized || mobile !== previousMobile) {
      const time = poseInitialized ? getState().time : null;
      fillTarget();
      for (let i = 7; i < pose.length; i += 1) pose[i] = targetPose[i];
      finishCamera();
      elapsed = time === null ? 0 : time - phaseOrigin;
      resetHistory();
    }
    // A hidden/unfocused resize must not upload targets or draw even one frame.
    // Allocation and the first paint happen only inside the active RAF path.
    sizeDirty = true;
    sync();
  }
  function adapt(time, cadence, gpuCost) {
    if (config.quality !== 'auto') return;
    if (gpuCost > 0) costAverage = costAverage ? costAverage + (gpuCost - costAverage) * 0.08 : gpuCost;
    if (cadence > 0) cadenceAverage = cadenceAverage ? cadenceAverage + (cadence - cadenceAverage) * 0.08 : cadence;
    sampledFrames += 1;
    if (!sampleStart) sampleStart = time;
    if (time - sampleStart < 1500 || sampledFrames < 8 || time - lastQualityChange < 1800) return;
    const tier = qualities[quality];
    const slow = costAverage > (tier.fps === 60 ? 16 : 30) || cadenceAverage > (tier.fps === 60 ? 25 : 48);
    let next = quality;
    if (quality > 0 && slow) {
      next -= 1; qualityCeiling = Math.min(qualityCeiling, next);
    } else if (quality < qualityCeiling && time - lastQualityChange > 15000 && costAverage > 0
      && costAverage < 8 && cadenceAverage < 40) {
      next += 1;
    }
    if (next !== quality) {
      quality = next; lastQualityChange = time; costAverage = cadenceAverage = 0;
      canvas.dataset.quality = String(quality); sizeDirty = true; resetHistory();
    }
    sampleStart = time; sampledFrames = 0;
  }
  function updateTransition(delta) {
    let changing = false;
    if (transitioning) {
      // Camera and scene uniforms share one critically damped response.
      const omega = 12000 / Math.max(1, cameraResponseMs);
      const step = omega * delta, decay = Math.exp(-step);
      let settled = true;
      for (let i = 0; i < 7; i += 1) {
        const offset = pose[i] - targetPose[i];
        const lag = cameraLag[i] - targetPose[i];
        pose[i] = targetPose[i] + (offset + step * lag) * decay;
        cameraLag[i] = targetPose[i] + lag * decay;
        const scale = Math.max(1, Math.abs(targetPose[i]));
        if (Math.abs(pose[i] - targetPose[i]) > 0.00001 * scale
          || Math.abs(omega * (cameraLag[i] - pose[i])) > 0.0001 * scale) settled = false;
      }
      const sceneGain = 1 - Math.exp(-step * 0.72);
      for (let i = 7; i < pose.length; i += 1) {
        const difference = targetPose[i] - pose[i];
        pose[i] += difference * sceneGain;
        if (Math.abs(difference) > 0.00001 * Math.max(1, Math.abs(targetPose[i]))) settled = false;
      }
      changing = true;
      if (settled) {
        finishCamera(); resetHistory(); notify();
      }
    }
    const damping = 1.0 - Math.exp(-delta * 4.5);
    const dx = (targetX - pointerX) * damping, dy = (targetY - pointerY) * damping;
    pointerX += dx; pointerY += dy;
    if (Math.abs(dx) + Math.abs(dy) > 0.0001) changing = true;
    return changing;
  }
  function tick(time) {
    frame = 0;
    if (!needsFrame()) { stop(); return; }
    // Loss is observable before its DOM event arrives. Do not advance either
    // clock during that gap, otherwise recovery skips an unpainted camera pose.
    if (gl.isContextLost()) { stop(); return; }
    const interval = 1000 / qualities[quality].fps;
    if (!lastPaint || time - lastPaint >= interval - 1.2) {
      const delta = lastTick ? Math.min((time - lastTick) / 1000, 0.10) : 0;
      const cadence = lastPaint ? time - lastPaint : 0;
      lastTick = lastPaint = time;
      const previousLapse = statisticsEnabled && physicalClock ? Math.sqrt(Math.max(0, 1 - pose[7] / pose[6])) : 0;
      const transitioningFrame = updateTransition(delta);
      elapsed = (elapsed + (wantsMotion() ? delta * phaseRate : 0)) % Config.phasePeriod;
      if (statisticsEnabled && physicalClock && wantsMotion()) {
        const dt = delta * physicalScale;
        earthSeconds += dt;
        localSeconds += dt * (previousLapse + Math.sqrt(Math.max(0, 1 - pose[7] / pose[6]))) * 0.5;
      }
      try {
        let gpuCost = 0, timing = false;
        if (timerExtension && queryPending[queryCursor] && gl.getQueryParameter(queries[queryCursor], gl.QUERY_RESULT_AVAILABLE)) {
          if (!gl.getParameter(timerExtension.GPU_DISJOINT_EXT)) gpuCost = gl.getQueryParameter(queries[queryCursor], gl.QUERY_RESULT) / 1000000;
          queryPending[queryCursor] = 0;
        }
        const previousQuality = quality;
        if (animating() && !transitioning) adapt(time, cadence, gpuCost);
        let statusChanged = !ready || quality !== previousQuality;
        if (sizeDirty) {
          statusChanged = allocate() || statusChanged; sizeDirty = false;
          if (gl.getError() !== gl.NO_ERROR || gl.isContextLost()) throw new Error('Renderer unavailable');
        }
        if (timerExtension && !queryPending[queryCursor]) { gl.beginQuery(timerExtension.TIME_ELAPSED_EXT, queries[queryCursor]); timing = true; }
        draw(transitioningFrame);
        if (timing) { gl.endQuery(timerExtension.TIME_ELAPSED_EXT); queryPending[queryCursor] = 1; }
        queryCursor = (queryCursor + 1) & 3;
        if (statusChanged) {
          ready = true; stage.dataset.renderer = 'webgl2'; stage.classList.add('is-rendered');
          updateControls(); notify();
        }
        if (statisticsEnabled && time - lastStatistics >= 200) {
          lastStatistics = time;
          dispatchEvent(new CustomEvent('blackhole:statistics', { detail: getStatistics() }));
        }
      } catch (error) { console.warn('Black-hole draw failed:', error.message); fail(); return; }
    }
    if (needsFrame()) frame = requestAnimationFrame(tick);
    else stop();
  }
  function getPhase() {
    const value = (elapsed + phaseOrigin) % Config.phasePeriod;
    return value < 0 ? value + Config.phasePeriod : value;
  }
  function getStatistics() {
    const view = views[viewIndex], camera = view.camera[mobile ? 'mobile' : 'desktop'];
    const radius = poseInitialized ? pose[6] : camera.distance;
    const horizon = poseInitialized ? pose[7] : view.disk.horizon;
    const radiusRs = radius / horizon;
    const lapse = Math.sqrt(1 - 1 / radiusRs);
    const horizonDistanceRs = radiusRs - 1;
    const horizonRadiusKm = timePerSolarMass * view.physics.massSolar * Physics.constants.C / 1000;
    const aspect = height > 0 ? width / height : 1;
    const lens = (poseInitialized ? pose[2] : Math.tan(camera.fov * Math.PI / 360)) / Math.min(1, aspect);
    const x = poseInitialized ? pose[0] : camera.x;
    const y = poseInitialized ? pose[1] : 1 - camera.y;
    const furthestRayAngle = Math.atan(2 * lens * Math.hypot(
      aspect * Math.max(Math.abs(x), Math.abs(1 - x)), Math.max(Math.abs(y), Math.abs(1 - y))
    ));
    const acuteShadowAngle = Math.asin(Math.min(1, 1.5 * Math.sqrt(3) * lapse / radiusRs));
    const shadowAngle = radiusRs >= 1.5 ? acuteShadowAngle : Math.PI - acuteShadowAngle;
    return {
      enabled: statisticsEnabled, earthSeconds, localSeconds, radiusRs, lapse,
      earthPerLocalSecond: 1 / lapse, horizonDistanceRs,
      horizonRadiusKm, radiusKm: radiusRs * horizonRadiusKm,
      horizonDistanceKm: horizonDistanceRs * horizonRadiusKm,
      shadowCoversView: shadowAngle >= furthestRayAngle
    };
  }
  function setStatistics(value) {
    statisticsEnabled = Boolean(value);
    lastStatistics = 0;
    dispatchEvent(new CustomEvent('blackhole:statistics', { detail: getStatistics() }));
  }
  function resetStatistics() {
    earthSeconds = localSeconds = 0;
    lastStatistics = 0;
    if (statisticsEnabled) dispatchEvent(new CustomEvent('blackhole:statistics', { detail: getStatistics() }));
  }
  function setOccluded(value) {
    const next = Boolean(value);
    if (next === occluded) return;
    occluded = next;
    sync();
  }
  function getState() {
    return {
      ready: ready && !failed && !lost, failed, contextLost: lost, viewIndex, viewId: views[viewIndex].id,
      layout: mobile ? 'mobile' : 'desktop', playing: wantsMotion(), transitioning,
      quality, width, height, hdr, samples: historyCount, suspended: !active(), visibilityRatio,
      refining: !animating() && !transitioning && (settleFrames > 0 || sizeDirty),
      time: getPhase(),
      effectiveTimeScale: physicalClock ? (animating() && available() ? physicalScale : 0) : null
    };
  }
  function notify() { dispatchEvent(new CustomEvent('blackhole:change', { detail: getState() })); }
  function prepareTransition(smooth, responseMs) {
    const turn = Math.PI * 2;
    const offset = ((targetPose[5] - pose[5] + Math.PI) % turn + turn) % turn - Math.PI;
    targetPose[5] = pose[5] + offset;
    let changed = false;
    for (let i = 0; i < 7; i += 1) {
      if (Math.abs(pose[i] - targetPose[i]) > 0.000001 || Math.abs(cameraLag[i] - pose[i]) > 0.000001) changed = true;
    }
    for (let i = 7; i < pose.length; i += 1) {
      if (Math.abs(pose[i] - targetPose[i]) > 0.000001) changed = true;
    }
    cameraResponseMs = responseMs;
    transitioning = Boolean(smooth && responseMs > 0 && poseInitialized && changed);
    if (!transitioning) finishCamera();
    poseInitialized = true;
    stage.dataset.transitioning = String(transitioning);
  }
  function applyTarget(transition, preserveTime = false) {
    const time = getState().time;
    fillTarget(); targetX = targetY = 0;
    // Scene values remain in pose and are eased by updateTransition. The clock
    // phase is preserved independently of the material transition.
    elapsed = preserveTime ? time - phaseOrigin : 0;
    // Scene changes may enlarge the horizon before a camera tween finishes.
    const minimum = views[viewIndex].disk.horizon * Config.minimumCameraRadiusRs;
    if (poseInitialized && pose[6] < minimum) pose[6] = cameraLag[6] = minimum;
    prepareTransition(transition, config.transitionMs);
    resetHistory(); costAverage = cadenceAverage = 0; sampledFrames = 0; sampleStart = 0;
    stage.dataset.transitioning = String(transitioning);
    sync(); notify();
  }
  function setView(index, options = {}) {
    if (!Number.isInteger(index) || index < 0 || index >= views.length) throw new Error(`视角编号应在 0–${views.length - 1} 之间`);
    const changed = viewIndex !== index;
    viewIndex = index;
    applyTarget(options.transition !== false, options.preserveTime !== false);
    if (changed) resetStatistics();
  }
  function getCamera() {
    if (!poseInitialized) return { ...views[viewIndex].camera[mobile ? 'mobile' : 'desktop'] };
    const degrees = 180 / Math.PI;
    const camera = {
      x: pose[0], y: 1 - pose[1], fov: 2 * Math.atan(pose[2]) * degrees,
      elevation: pose[3] * degrees, roll: pose[4] * degrees,
      azimuth: ((pose[5] * degrees + 180) % 360 + 360) % 360 - 180, distance: pose[6]
    };
    for (const key in camera) {
      const field = cameraFields[key];
      const minimum = key === 'distance' ? views[viewIndex].disk.horizon * Config.minimumCameraRadiusRs : field.min;
      camera[key] = Math.max(minimum, Math.min(field.max, camera[key]));
    }
    return camera;
  }
  function setCamera(patch, options = {}) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('相机更新必须是对象');
    const responseMs = options.responseMs === undefined ? 110 : options.responseMs;
    if (!Number.isFinite(responseMs) || responseMs < 0 || responseMs > 5000) throw new Error('相机响应时间应在 0–5000 ms 之间');
    for (const key in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
      const field = cameraFields[key], value = patch[key];
      if (!field || !Number.isFinite(value) || value < field.min || value > field.max) throw new Error(`无效相机参数：${key}`);
      if (key === 'distance' && value < views[viewIndex].disk.horizon * Config.minimumCameraRadiusRs) throw new Error(`相机必须位于视界之外（距离至少 ${Config.minimumCameraRadiusRs} rₛ）`);
    }
    const cameras = views[viewIndex].camera, camera = cameras[mobile ? 'mobile' : 'desktop'];
    let changed = false;
    for (const key in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
      const value = patch[key];
      if (options.linkLayouts === false) {
        if (camera[key] !== value) { camera[key] = value; changed = true; }
      } else {
        if (cameras.desktop[key] !== value || cameras.mobile[key] !== value) changed = true;
        cameras.desktop[key] = cameras.mobile[key] = value;
      }
    }
    if (!changed) return;
    fillCameraTarget();
    prepareTransition(options.smooth !== false, responseMs);
    resetHistory(); sync();
    if (options.notify) notify();
  }
  function setQuality(value) {
    const next = Config.clone(config);
    next.quality = value;
    config = Config.validate(next); views = config.views;
    quality = value === 'auto' ? (touch ? 1 : 3) : value;
    qualityCeiling = touch ? 2 : 3;
    costAverage = cadenceAverage = 0; sampledFrames = 0; sampleStart = 0; lastQualityChange = performance.now();
    sizeDirty = true;
    canvas.dataset.quality = String(quality);
    resetHistory(); sync(); notify();
  }
  function setConfig(value, options = {}) {
    const next = Config.validate(value), id = views[viewIndex].id;
    const index = Math.max(0, next.views.findIndex(view => view.id === id));
    const preserveTime = next.views[index].id === id && next.views[index].disk.phase === views[viewIndex].disk.phase;
    const qualityChanged = next.quality !== config.quality;
    config = next; views = config.views; viewIndex = index;
    if (qualityChanged) setQuality(config.quality);
    applyTarget(Boolean(options.transition), preserveTime);
  }
  function updateView(index, value, options = {}) {
    if (!Number.isInteger(index) || index < 0 || index >= views.length) throw new Error('无效视角编号');
    const next = Config.validateView(value);
    if (next.id !== views[index].id) throw new Error('视角 id 不匹配');
    const phaseChanged = next.disk.phase !== views[index].disk.phase;
    views[index] = next;
    if (index === viewIndex) {
      applyTarget(Boolean(options.transition), !phaseChanged);
    } else notify();
  }
  function setPlaying(value) {
    userPlaying = Boolean(value); resetHistory(); sync(); notify();
  }
  function setTime(value) {
    if (!Number.isFinite(value) || value < 0 || value > Config.phasePeriod) throw new Error(`演化相位应在 0–${Config.phasePeriod} 之间`);
    userPlaying = false; views[viewIndex].disk.phase = value;
    applyTarget(false);
  }
  function setParallax(value) {
    parallaxEnabled = Boolean(value);
    if (!parallaxEnabled) pointerX = pointerY = targetX = targetY = 0;
    resetHistory(); sync();
  }
  function captureView() {
    if (transitioning) throw new Error('视角正在过渡，请等待稳定后再复制');
    const result = Config.clone(views[viewIndex]);
    result.disk.phase = getState().time;
    return result;
  }
  function cycleView() {
    const publicIndices = publicViewIndices(), easterEgg = views.findIndex(view => view.id === 'view-1-blue');
    if (!ready || lost || failed || publicIndices.length < 2) return;
    const publicPosition = publicIndices.indexOf(viewIndex);
    if (viewIndex === easterEgg) {
      setView(publicIndices[0], { transition: !motionPreference.matches });
      return;
    }
    const skipNext = publicIndices.length > 2 && Math.random() < 0.18;
    const next = publicIndices[(publicPosition + (skipNext ? 2 : 1)) % publicIndices.length];
    const revealEgg = easterEgg >= 0 && publicPosition === publicIndices.length - 1 && Math.random() < 0.4;
    setView(revealEgg ? easterEgg : next, { transition: !motionPreference.matches });
  }
  viewButton?.addEventListener('click', cycleView);
  if (viewSurface) {
    viewSurface.addEventListener('pointerdown', event => {
      pointerDownX = event.clientX; pointerDownY = event.clientY; dragged = !event.isPrimary || event.button !== 0;
    }, { passive: true });
    viewSurface.addEventListener('pointermove', event => {
      if (Math.abs(event.clientX - pointerDownX) + Math.abs(event.clientY - pointerDownY) > 9) dragged = true;
    }, { passive: true });
    viewSurface.addEventListener('pointercancel', () => { dragged = true; });
    viewSurface.addEventListener('click', event => { if (event.detail === 0 || !dragged) cycleView(); });
  }
  motionButton?.addEventListener('click', () => setPlaying(!wantsMotion()));
  const preferenceChanged = () => {
    userPlaying = null; targetX = targetY = pointerX = pointerY = 0;
    if (motionPreference.matches && transitioning) finishCamera();
    resetHistory(); sync();
  };
  if (motionPreference.addEventListener) motionPreference.addEventListener('change', preferenceChanged);
  else motionPreference.addListener(preferenceChanged);
  connection?.addEventListener('change', preferenceChanged);
  hero.addEventListener('pointermove', event => {
    if (!available() || !parallaxEnabled || !finePointer.matches || event.pointerType !== 'mouse' || !wantsMotion() || !cssWidth || !cssHeight) return;
    targetX = Math.max(-1, Math.min(1, (event.clientX - stageLeft) / displayWidth * 2 - 1));
    targetY = Math.max(-1, Math.min(1, (event.clientY - stageTop) / displayHeight * 2 - 1));
    sync();
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { targetX = targetY = 0; sync(); }, { passive: true });
  const refreshVisibility = () => { measure(); sync(); };
  addEventListener('focus', () => { windowActive = true; refreshVisibility(); });
  addEventListener('blur', () => { windowActive = false; sync(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { windowActive = true; measure(); }
    sync();
  });
  addEventListener('pagehide', () => { pageActive = false; sync(); });
  addEventListener('pageshow', () => { pageActive = true; resize(); });
  addEventListener('scroll', refreshVisibility, { passive: true });
  addEventListener('resize', resize, { passive: true });
  window.visualViewport?.addEventListener('scroll', refreshVisibility, { passive: true });
  window.visualViewport?.addEventListener('resize', resize, { passive: true });
  if ('IntersectionObserver' in window) new IntersectionObserver(refreshVisibility, { threshold: [0, 0.05, 1] }).observe(stage);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); lost = true; ready = initialized = false; stop();
    stage.classList.remove('is-rendered'); delete stage.dataset.renderer; updateControls();
    notify();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false; ready = initialized = false; costAverage = 0; initialize();
  });
  window.BlackHoleRenderer = Object.freeze({
    getConfig: () => Config.clone(config), getDefaults: () => Config.clone(Config.defaults),
    getView: () => Config.clone(views[viewIndex]),
    getState, getCamera, setCamera, setConfig, updateView, setView, setPlaying, setTime, setQuality, setParallax, captureView,
    getStatistics, setStatistics, resetStatistics, setOccluded
  });
  initialize();
  dispatchEvent(new CustomEvent('blackhole:ready', { detail: getState() }));
})();

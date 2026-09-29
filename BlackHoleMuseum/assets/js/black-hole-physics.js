/* SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2026 Enigmatisms.
 */
(() => {
  'use strict';

  const constants = Object.freeze({
    G: 6.67430e-11,
    C: 299792458,
    SOLAR_MASS: 1.98847e30,
    AU: 149597870700,
    // Julian year (365.25 days), not a calendar year; all lengths above are SI metres.
    LIGHT_YEAR: 9460730472580800
  });
  const radiansToMicroas = 180 / Math.PI * 3600 * 1e6;

  function diskTemperature(physics, disk) {
    if (physics.radiation !== 1) return null;
    const logRatio = Math.log(disk.outer / disk.inner);
    const innerKelvin = physics.temperatureK;
    const outerKelvin = innerKelvin * Math.exp(-0.75 * logRatio);
    // T(r)=T_in (r_in/r)^(3/4), averaged with coordinate annular area 2πr dr.
    // This is the model's local colour temperature, not a measured gas temperature,
    // a proper-area average, or a Doppler-shifted image-temperature estimate.
    const meanKelvin = 1.6 * innerKelvin * Math.expm1(1.25 * logRatio) / Math.expm1(2 * logRatio);
    return {
      meanKelvin, innerKelvin, outerKelvin,
      meanCelsius: meanKelvin - 273.15,
      innerCelsius: innerKelvin - 273.15,
      outerCelsius: outerKelvin - 273.15
    };
  }

  // Inputs use the validated Config schema. Radii are Schwarzschild areal radii,
  // not proper radial distances. Period is Schwarzschild coordinate time at infinity.
  function derive(physics, disk, camera) {
    const gm = constants.G * constants.SOLAR_MASS * physics.massSolar;
    const rs = 2 * gm / (constants.C * constants.C);
    const timeUnitSeconds = rs / constants.C;
    const schwarzschildKm = rs / 1000;
    return {
      schwarzschildKm,
      schwarzschildAU: rs / constants.AU,
      timeUnitSeconds,
      photonSphereKm: 1.5 * schwarzschildKm,
      iscoKm: 3 * schwarzschildKm,
      // 2 pi sqrt((3 rs)^3 / GM) = 2 pi sqrt(54) rs/c.
      iscoPeriodSeconds: 2 * Math.PI * Math.sqrt(54) * timeUnitSeconds,
      // Far-field angular DIAMETER: 2 b_crit / D, b_crit = 3 sqrt(3) rs / 2.
      // This is a model shadow, not the measured emission-ring diameter or camera FOV.
      shadowMicroas: physics.distanceLy > 0
        ? 3 * Math.sqrt(3) * rs / (physics.distanceLy * constants.LIGHT_YEAR) * radiansToMicroas
        : null,
      cameraKm: camera.distance / disk.horizon * schwarzschildKm,
      diskTemperature: diskTemperature(physics, disk)
    };
  }

  let thermalTable;
  function gaussian(wavelength, center, left, right) {
    const t = (wavelength - center) * (wavelength < center ? left : right);
    return Math.exp(-0.5 * t * t);
  }

  function blackbodyTable() {
    if (thermalTable) return thermalTable;
    const width = 256;
    const minTemperature = 500;
    const maxTemperature = 200000;
    const data = new Float32Array(width * 4);
    const h = 6.62607015e-34;
    const k = 1.380649e-23;
    const c = constants.C;
    const firstNm = 360;
    const lastNm = 830;
    const count = lastNm - firstNm + 1;
    const spectrum = new Float64Array(count * 5);

    // CIE 1931 2-degree observer: Wyman, Sloan & Shirley (2013), Eq. 4 / Table 1.
    // https://jcgt.org/published/0002/02/01/paper.pdf
    // Trapezoidal integration at 1 nm of Planck B_lambda =
    // 2hc^2 / (lambda^5 * expm1(hc/(lambda kT))), in W sr^-1 m^-3.
    // Precompute the observer and wavelength terms once, outside temperature sampling.
    for (let i = 0; i < count; i++) {
      const nm = firstNm + i;
      const wavelength = nm * 1e-9;
      const offset = i * 5;
      const weight = (i === 0 || i === count - 1) ? 0.5e-9 : 1e-9;
      spectrum[offset] = 2 * h * c * c / Math.pow(wavelength, 5) * weight;
      spectrum[offset + 1] = h * c / (wavelength * k);
      spectrum[offset + 2] = 0.362 * gaussian(nm, 442, 0.0624, 0.0374)
        + 1.056 * gaussian(nm, 599.8, 0.0264, 0.0323)
        - 0.065 * gaussian(nm, 501.1, 0.0490, 0.0382);
      spectrum[offset + 3] = 0.821 * gaussian(nm, 568.8, 0.0213, 0.0247)
        + 0.286 * gaussian(nm, 530.9, 0.0613, 0.0322);
      spectrum[offset + 4] = 1.217 * gaussian(nm, 437, 0.0845, 0.0278)
        + 0.681 * gaussian(nm, 459, 0.0385, 0.0725);
    }

    const xyz = new Float64Array(3);
    function integrate(temperature) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (let i = 0; i < spectrum.length; i += 5) {
        const radiance = spectrum[i] / Math.expm1(spectrum[i + 1] / temperature);
        x += radiance * spectrum[i + 2];
        y += radiance * spectrum[i + 3];
        z += radiance * spectrum[i + 4];
      }
      xyz[0] = x;
      xyz[1] = y;
      xyz[2] = z;
    }

    integrate(6500);
    const normalization = 1 / xyz[1];
    const logRange = Math.log(maxTemperature / minTemperature);
    for (let i = 0; i < width; i++) {
      integrate(minTemperature * Math.exp(logRange * i / (width - 1)));
      const x = xyz[0] * normalization;
      const y = xyz[1] * normalization;
      const z = xyz[2] * normalization;
      const offset = i * 4;
      // XYZ -> linear sRGB (D65 primaries); no gamma, white balance, or row normalization.
      data[offset] = Math.max(0, 3.2404542 * x - 1.5371385 * y - 0.4985314 * z);
      data[offset + 1] = Math.max(0, -0.969266 * x + 1.8760108 * y + 0.041556 * z);
      data[offset + 2] = Math.max(0, 0.0556434 * x - 0.2040259 * y + 1.0572252 * z);
      data[offset + 3] = 1;
    }
    // Shared upload buffer; callers must not mutate it. A single Y(6500 K) scale
    // preserves radiance: sampling at g*T already includes relativistic brightening.
    // Do NOT multiply thermal samples by another g^3 or g^4 in the shader.
    thermalTable = Object.freeze({ width, minTemperature, maxTemperature, data });
    return thermalTable;
  }

  function freeze(value) {
    for (const item of Object.values(value)) {
      if (item && typeof item === 'object') freeze(item);
    }
    return Object.freeze(value);
  }

  // Source metadata distinguishes measured scales from illustrative near-field
  // materials. Inclination i is measured from the axis; camera elevation = 90-i.
  // All scenes use Schwarzschild transfer: no Kerr spin, jets, maser amplification,
  // synchrotron microphysics or energy-dependent X-ray absorption is implied.
  const catalog = freeze([
    {
      id: 'sgr-a',
      name: 'Sgr A*',
      subtitle: '银河系中心 · 射电伪彩',
      kind: 'observed',
      description: '低光学深度的厚盘，较宽的发光区。',
      en: { name: 'Sgr A*', subtitle: 'Galactic centre · Radio false colour', description: 'A low-optical-depth thick flow with a broad emitting region.' },
      source: {
        measurements: 'ESO/EHT: approximately 4e6 solar masses, 27000 light-years.',
        orientation: 'i=30° is an illustrative member of the low-inclination model family in EHT V, not a measured disc tilt.',
        model: 'Dilute thick flow; radio false-colour power law. Alpha, density, radial profile and texture are illustrative, not a spectral fit.',
        references: [
          'https://www.eso.org/public/science/EHT-MilkyWay/',
          'https://arxiv.org/abs/2311.09478'
        ]
      }
    },
    {
      id: 'm87',
      name: 'M87*',
      subtitle: '室女座 · 射电伪彩',
      kind: 'observed',
      description: '近轴向观察厚盘，发光集中在内缘。',
      en: { name: 'M87*', subtitle: 'Virgo · Radio false colour', description: 'A nearly axial view of a thick flow, with emission concentrated near the inner edge.' },
      source: {
        measurements: 'ESO/EHT 2019: 6.5e9 solar masses, approximately 55e6 light-years.',
        orientation: 'i=17° follows the approaching-jet angle adopted by EHT V; alignment of the disc with that axis is an assumption.',
        model: 'Compact, dilute thick flow; steeper illustrative emissivity than Sgr A*. Radio power-law false colour, no jet or synchrotron transfer.',
        references: [
          'https://www.eso.org/public/news/eso1907/',
          'https://doi.org/10.3847/2041-8213/ab0f43'
        ]
      }
    },
    {
      id: 'ngc-4258',
      name: 'NGC 4258',
      subtitle: '梅西耶 106 · 薄盘演绎',
      kind: 'observed',
      description: '接近侧视的薄盘，以可见光热谱呈现。',
      en: { name: 'NGC 4258', subtitle: 'Messier 106 · Thin-disc illustration', description: 'A nearly edge-on thin disc rendered with a visible thermal spectrum.' },
      source: {
        measurements: 'Reid, Pesce & Riess 2019, Table 2: 3.98e7 solar masses; 7.576 Mpc.',
        orientation: 'i=87.05° is measured at the outer maser radius, 6.1 mas. Extending this orientation inward is illustrative; the observed disc is warped.',
        model: 'Cool, optically thicker thin-disc illustration at 4500 K; neither a measured inner-disc temperature nor an image of the distant molecular maser disc.',
        references: ['https://arxiv.org/html/1908.05625']
      }
    },
    {
      id: 'cygnus-x1',
      name: 'Cygnus X-1',
      subtitle: '天鹅座 X-1 · X 射线伪彩',
      kind: 'observed',
      description: '硬态演绎：较平滑的扁厚盘与硬幂律谱。',
      en: { name: 'Cygnus X-1', subtitle: 'Cygnus X-1 · X-ray false colour', description: 'A hard-state illustration: a smoother, moderately thick flow and a hard power-law spectrum.' },
      source: {
        measurements: 'Miller-Jones et al. 2021: 21.2 solar masses; 2.22 kpc.',
        orientation: 'Binary orbital i=27.51°; inner-flow alignment with the binary is assumed, not measured here.',
        model: 'Illustrative hard-state power law alpha=0.7 (photon index 1.7). Gray absorption; no Comptonization or X-ray blackbody temperature.',
        references: ['https://arxiv.org/abs/2102.09091']
      }
    },
    {
      id: 'a0620',
      name: 'A0620−00',
      subtitle: '麒麟座 · 静默态伪彩',
      kind: 'observed',
      description: '稀薄、低亮度的内流，外侧薄盘不在画面内。',
      en: { name: 'A0620−00', subtitle: 'Monoceros · Quiescent false colour', description: 'A dilute, faint inner flow; the outer thin disc lies beyond the frame.' },
      source: {
        measurements: 'Cantrell et al. 2010: 6.6 solar masses; 1.06 kpc; binary orbital i=51°.',
        orientation: 'Inner flow is assumed aligned with the measured binary orbit.',
        model: 'Dilute hot inner-flow illustration in power-law false colour. The ADAF model places the truncated cool outer disc at thousands of rs, outside this view; the displayed inner edge is not that truncation radius.',
        references: [
          'https://arxiv.org/abs/1001.0261',
          'https://arxiv.org/abs/astro-ph/9508014'
        ]
      }
    },
    {
      id: 'v404-cyg',
      name: 'V404 Cygni',
      subtitle: '天鹅座 · 爆发态伪彩',
      kind: 'observed',
      description: '较厚、较不透明的团块盘，内区受到遮挡。',
      en: { name: 'V404 Cygni', subtitle: 'Cygnus · Outburst false colour', description: 'A thicker, more opaque clumpy flow that obscures the inner region.' },
      source: {
        measurements: 'Khargharia et al. 2010: 9.0 solar masses, binary i=67°; Miller-Jones et al. 2009: 2.39 kpc parallax distance.',
        orientation: 'The binary orbital inclination is used as an illustrative flow orientation, not a claim of inner-disc alignment.',
        model: 'Motta et al. 2017 motivates an inflated, obscuring flow in the 2015 outburst. Clumpy thick-disc power-law illustration; no outflow, partial-covering spectral fit or absorption edges.',
        references: [
          'https://arxiv.org/abs/1004.5358',
          'https://arxiv.org/abs/0910.5253',
          'https://arxiv.org/abs/1707.01076'
        ]
      }
    },
    {
      id: 'gargantua',
      name: 'Gargantua',
      subtitle: '《星际穿越》 · 卡冈图雅',
      kind: 'fictional',
      description: '低仰角薄盘，关闭多普勒，保留引力频移。',
      en: { name: 'Gargantua', subtitle: 'Interstellar · Fictional black hole', description: 'A low-angle thin disc with Doppler effects off and gravitational redshift retained.' },
      source: {
        measurements: 'Thorne: fictional mass 1e8 solar masses; Earth distance unspecified.',
        model: 'Film-inspired framing and thermal material, not DNGR/Kerr reconstruction. Temperature and geometry are artistic choices.',
        references: [
          'https://www.its.caltech.edu/~kip/index.html/PubScans/VI-59.pdf',
          'https://arxiv.org/html/1502.03808#S4'
        ]
      }
    },
    {
      id: 'warm-cloud',
      name: '暖色云盘',
      subtitle: '体积云 · 热谱',
      kind: 'artistic',
      description: '保留原始暖色云团、细丝与低角度构图。',
      en: { name: 'Warm clouds', subtitle: 'Volumetric clouds · Thermal spectrum', description: 'The original warm clouds, filaments and low-angle composition.' }
    },
    {
      id: 'ice-filaments',
      name: '冷色细丝',
      subtitle: '疏松厚盘 · 自定渐变',
      kind: 'artistic',
      description: '蓝紫色疏松厚盘，宽阔发光区与倾斜构图。',
      en: { name: 'Cool filaments', subtitle: 'Diffuse thick flow · Custom gradient', description: 'A blue-violet diffuse flow with a broad emitting region and tilted framing.' }
    },
    {
      id: 'ember-ring',
      name: '余烬环',
      subtitle: '截断薄盘 · 低温热谱',
      kind: 'artistic',
      description: '低温、平滑的截断薄盘，留出较大的中央暗区。',
      en: { name: 'Ember ring', subtitle: 'Truncated thin disc · Cool thermal spectrum', description: 'A cooler, smooth truncated disc surrounding a larger central dark region.' }
    }
  ]);

  function preset(id, orientation, disk, appearance, physics, colors, background = {}) {
    const entry = catalog.find(item => item.id === id);
    const camera = { x: 0.5, y: 0.5, fov: 42, elevation: 9.8, azimuth: 2, roll: 0, distance: 30, ...orientation };
    return {
      id: entry.id,
      label: entry.name,
      camera: { desktop: { ...camera }, mobile: { ...camera } },
      disk: { horizon: 1.33, inner: 3.99, outer: 13.5, thickness: 0.75, density: 2.7, turbulence: 2.15, detail: 2.1, emission: 2.2, speed: 1, phase: 1.8, roughness: 0.88, emissivityIndex: 2.4, ...disk },
      appearance: { exposure: 0.65, bloom: 1.5, temperature: 1, clearance: 0, ...appearance },
      background: { density: 0.8, brightness: 0.45, ...background },
      colors,
      physics: { massSolar: 4000000, distanceLy: 27000, timeScale: 30, physicalTime: 1, doppler: 1, radiation: 2, spectralIndex: 1, temperatureK: 7000, ...physics }
    };
  }

  // Distances in the papers are converted from parsecs to Julian light-years.
  const parsecLy = constants.AU * 648000 / Math.PI / constants.LIGHT_YEAR;
  // Playback multipliers are presentation choices, not inferred source dynamics.
  // Distinct physical-clock baselines retain orbital shear without making every
  // object complete the same orbit on screen; stellar flows are slowed down.
  const presets = freeze([
    preset('sgr-a', { elevation: 60, azimuth: 12, roll: -10, fov: 46, distance: 32 },
      { outer: 12.5, thickness: 1.25, density: 0.55, turbulence: 1.8, detail: 1.7, emission: 3.2, roughness: 0.7, emissivityIndex: 2.6 },
      { exposure: 1.15, bloom: 0.8 },
      { timeScale: 30, spectralIndex: 0.5 },
      { cold: '#54152a', warm: '#ed622c', hot: '#fff0bf' }),
    preset('m87', { elevation: 73, azimuth: -24, roll: 20, fov: 34, distance: 30 },
      { outer: 8.5, thickness: 1.55, density: 0.28, turbulence: 1.1, detail: 1.25, emission: 3.8, phase: 6.4, roughness: 0.38, emissivityIndex: 4.2 },
      { exposure: 1.5, bloom: 0.65, gradientMidpoint: 0.52, gradientSoftness: 0.85 },
      { massSolar: 6500000000, distanceLy: 55000000, timeScale: 65000, spectralIndex: 1.2 },
      { cold: '#3b162b', warm: '#e88b2a', hot: '#fff4c9' }),
    preset('ngc-4258', { elevation: 2.95, azimuth: 0, roll: -5, fov: 40, distance: 36 },
      { outer: 18, thickness: 0.075, density: 4.6, turbulence: 0.3, detail: 0.6, emission: 3.1, phase: 2.4, roughness: 0.12 },
      { exposure: 2.4, bloom: 0.65 },
      { massSolar: 39800000, distanceLy: 7.576e6 * parsecLy, timeScale: 240, radiation: 1, temperatureK: 4500 },
      { cold: '#78230e', warm: '#ef8f37', hot: '#ffe2b7' }),
    preset('cygnus-x1', { elevation: 62.49, azimuth: 34, roll: -22, fov: 39, distance: 29 },
      { outer: 10.5, thickness: 0.4, density: 1.1, turbulence: 0.6, detail: 0.9, emission: 3, phase: 4.1, roughness: 0.2, emissivityIndex: 3.5 },
      { exposure: 1.05, bloom: 0.45, gradientMidpoint: 0.57 },
      { massSolar: 21.2, distanceLy: 2220 * parsecLy, timeScale: 0.0004, spectralIndex: 0.7 },
      { cold: '#172a6e', warm: '#4d94cf', hot: '#eaf5ff' }),
    preset('a0620', { elevation: 39, azimuth: -42, roll: 8, fov: 43, distance: 36 },
      { outer: 16.5, thickness: 1.8, density: 0.18, turbulence: 1.25, detail: 0.75, emission: 1.6, phase: 8.7, roughness: 0.48, emissivityIndex: 1.6 },
      { exposure: 0.8, bloom: 0.3, gradientMidpoint: 0.48, gradientSoftness: 1.3 },
      { massSolar: 6.6, distanceLy: 1060 * parsecLy, timeScale: 0.00006, spectralIndex: 1.1 },
      { cold: '#241434', warm: '#aa5067', hot: '#f3d1bd' },
      { density: 1.15, brightness: 0.3 }),
    preset('v404-cyg', { elevation: 23, azimuth: 19, roll: 12, fov: 47, distance: 34 },
      { outer: 14.5, thickness: 2.3, density: 3.8, turbulence: 2.6, detail: 2.4, emission: 2.6, phase: 5.2, roughness: 0.96, emissivityIndex: 2.8 },
      { exposure: 0.7, bloom: 1.05, gradientMidpoint: 0.6, gradientSoftness: 0.8 },
      { massSolar: 9, distanceLy: 2390 * parsecLy, timeScale: 0.00014, spectralIndex: 1.4 },
      { cold: '#4d1029', warm: '#db4c4b', hot: '#ffeacb' }),
    preset('gargantua', { elevation: 3.6, azimuth: 2, fov: 38, distance: 28 },
      { thickness: 0.09, density: 3.1, turbulence: 1.85, detail: 2.3, emission: 2.5, phase: 3.59, roughness: 0.78 },
      { exposure: 0.8, bloom: 2 },
      { massSolar: 100000000, distanceLy: 0, timeScale: 1100, doppler: 0, radiation: 1, temperatureK: 7200 },
      { cold: '#b63b18', warm: '#ffb870', hot: '#fff5df' }),
    // The original Sgr A* material is retained intact as an artistic starting
    // scene, rather than presenting its optical blackbody clouds as radio data.
    preset('warm-cloud', {}, { speed: 0.24 }, {},
      { distanceLy: 0, physicalTime: 0, radiation: 1 },
      { cold: '#b93417', warm: '#ff9947', hot: '#fff2dc' }),
    preset('ice-filaments', { elevation: 42, azimuth: 48, roll: -28, fov: 49, distance: 35 },
      { inner: 3.3, outer: 17.5, thickness: 1.6, density: 0.6, turbulence: 1.4, detail: 2.8, emission: 3.3, phase: 9.3, roughness: 0.68, emissivityIndex: 1.25, speed: 0.18 },
      { exposure: 0.9, bloom: 1.1, gradientMidpoint: 0.48, gradientSoftness: 1.4 },
      { distanceLy: 0, physicalTime: 0, radiation: 0 },
      { cold: '#27144f', warm: '#377fc4', hot: '#c7fff2' },
      { density: 0.35, brightness: 0.25 }),
    preset('ember-ring', { elevation: 18, azimuth: -28, roll: 7, fov: 46, distance: 42 },
      { inner: 8.5, outer: 19, thickness: 0.15, density: 4.2, turbulence: 0.25, detail: 0.4, emission: 3.8, phase: 3.2, roughness: 0.08, speed: 0.32 },
      { exposure: 4.2, bloom: 0.6 },
      { distanceLy: 0, physicalTime: 0, radiation: 1, temperatureK: 3600 },
      { cold: '#501109', warm: '#c94f1d', hot: '#ffd28c' },
      { density: 0.25, brightness: 0.2 })
  ]);

  function createView(id) {
    const view = presets.find(item => item.id === id);
    if (!view) throw new RangeError(`未知黑洞预设：${id}`);
    return window.BlackHoleConfig.validateView(view);
  }

  window.BlackHolePhysics = Object.freeze({ constants, derive, blackbodyTable, catalog, createView });
})();
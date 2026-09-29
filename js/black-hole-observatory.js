/* SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2026 Enigmatisms.
 */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const canvas = byId('black-hole');
  if (!canvas) return;
  let language = 'zh';
  const t = (zh, en) => language === 'en' ? en : zh;
  const translations = {
    '跳至交互视窗': 'Skip to viewport', '返回博客首页': 'Back to blog home', '黑洞观测站': 'Black hole observatory',
    '观测控制': 'Controls', '关闭观测控制': 'Close controls', '场景控制': 'Scene controls', '关闭': 'Close',
    '工作模式': 'Workspace mode', '预设场景': 'Presets', '自由编辑': 'Editor', '选择场景': 'Select scene',
    '复制当前画面到编辑器': 'Copy frame to editor', '复制会替换编辑工作区；切换模式不会丢失已有编辑。': 'Copy replaces the workspace. Switching modes keeps your edits.',
    '播放': 'Play', '冻结帧': 'Freeze', '重置视点': 'Reset camera', '视角名称': 'View name',
    '保存到浏览器': 'Save locally', '重置编辑': 'Reset edits', '相机': 'Camera', '编辑相机': 'Camera to edit',
    '当前画布': 'Current viewport', '桌面相机': 'Desktop camera', '手机相机': 'Mobile camera', '同步两套相机': 'Link both cameras',
    '吸积盘': 'Accretion disc', '内外缘与相机距离单位': 'Disc / camera radius units', '场景单位': 'Scene units', '视界半径 rₛ': 'Horizon radius rₛ',
    '视界半径使用场景单位。内外缘与视界联动，始终保持有效边界。': 'Horizon size uses scene units. Dependent radii adjust together to keep valid boundaries.',
    '辐射与颜色': 'Radiation & colour', '辐射模式': 'Radiation mode', '艺术调色': 'Artistic palette', 'Planck 黑体谱': 'Planck blackbody', '幂律谱 · 假色': 'Power law · false colour',
    '冷区至热区颜色渐变': 'Cold-to-hot colour gradient', '时间与物理尺度': 'Time & physical scale',
    '相位记录当前帧；输入相位会暂停播放。质量决定物理时钟尺度，播放速度不改变气体轨道速度。': 'Phase records a frame; entering it pauses playback. Mass sets the physical clock scale. Playback speed does not change gas orbital velocity.',
    '背景星空': 'Star field', '导入 / 导出': 'Import / export', '视角或完整配置 JSON': 'View or full configuration JSON',
    '生成 JSON': 'Generate JSON', '下载 JSON': 'Download JSON', '读取 JSON 文件': 'Read JSON file', '检查导入': 'Validate import',
    '选择导入视角': 'View to import', '替换编辑工作区': 'Replace workspace', '画面质量': 'Render quality', '渲染预算': 'Render budget',
    '自动': 'Adaptive', '省电 · 30 fps 上限': 'Low power · up to 30 fps', '均衡 · 30 fps 上限': 'Balanced · up to 30 fps',
    '精细 · 30 fps 上限': 'Detailed · up to 30 fps', '流畅精细 · 60 fps 上限': 'Detailed · up to 60 fps',
    '暂停后累积采样以减少噪点。': 'Paused frames accumulate samples to reduce noise.', '← 返回博客': '← Back to blog',
    '黑洞交互视窗': 'Interactive black hole viewport', '黑洞引力透镜示意预览；交互渲染不可用时显示': 'Black hole lensing preview, shown when interactive rendering is unavailable',
    '正在加载': 'Loading', '当前物理尺度': 'Physical scale', '史瓦西半径 rₛ': 'Schwarzschild radius rₛ', 'ISCO 轨道周期': 'ISCO orbital period',
    '远方坐标时间 · 3 rₛ': 'Distant coordinate time · 3 rₛ', '远场阴影角直径': 'Distant shadow diameter', '操作指南': 'Controls', '自由视点': 'Free camera',
    '拖动环绕；Shift、右键或中键拖动平移。滚轮移动相机，Ctrl / ⌘ + 滚轮调整 FOV。触屏单指环绕，双指平移与缩放。聚焦画布后：W / S 前后移动，A / D 横向移动；方向键环绕，Shift + 方向键平移，+ / − 前后移动，[ / ] 调整 FOV，R 重置视点，空格播放 / 暂停。': 'Drag to orbit; Shift, right or middle drag to pan. Scroll to move, Ctrl / ⌘ + scroll for FOV. Touch: one finger orbits; two fingers pan and zoom. Focus the canvas: W / S move forward / back, A / D move sideways; arrows orbit, Shift + arrows pan, + / − move, [ / ] change FOV, R resets the camera, Space plays / pauses.',
    '暂停': 'Paused', 'Schwarzschild · 程序化渲染': 'Schwarzschild · Procedural rendering',
    '开启 JavaScript 可使用交互控制；当前仅显示预览图。': 'Enable JavaScript for interactive controls; currently showing a preview.',
    '时钟与距离统计': 'Clock & distance statistics', '时钟与距离': 'Clocks & distance', '重置计时': 'Reset clocks',
    '离视界还有（半径差）': 'Horizon gap (radius difference)', '距中心（坐标半径）': 'Centre radius (coordinate)', '地球秒 / 本地秒': 'Earth seconds / local second',
    '模拟累计地球时间': 'Simulated Earth time', '模拟累计本地时间': 'Simulated local time',
    '静止观察者 · 地球按远方观察者近似': 'Static observer · Earth approximated by a distant observer',
    '静态引力时间膨胀；不包含相机运动引起的狭义相对论效应。': 'Static gravitational time dilation; excludes special-relativistic effects of camera motion.',
    '移动至时间膨胀位置': 'Move to a clock-ratio position', '真实移动相机；不改变时间倍率。': 'Moves the camera physically; does not change playback speed.',
    '返回观景位置': 'Return to view', '本地 1 小时 → 地球': 'Local 1 hour → Earth',
    '吸积盘平均色温': 'Mean disc colour temperature', '模型色温，非实测气体温度': 'Model colour temperature, not measured gas temperature'
  };
  const staticText = [];
  const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (textWalker.nextNode()) {
    const node = textWalker.currentNode, zh = node.nodeValue.trim();
    if (translations[zh]) staticText.push({ node, zh, original: node.nodeValue });
  }
  const staticAttributes = [];
  for (const node of document.querySelectorAll('[aria-label], [alt], [title]')) {
    for (const key of ['aria-label', 'alt', 'title']) {
      const zh = node.getAttribute(key);
      if (translations[zh]) staticAttributes.push({ node, key, zh });
    }
  }
  const fieldNames = {
    camera: { x: 'Horizontal framing', y: 'Vertical framing', fov: 'Field of view °', elevation: 'Elevation °', azimuth: 'Azimuth °', roll: 'Roll °', distance: 'Camera radius' },
    disk: { horizon: 'Horizon radius · scene units', inner: 'Inner radius', outer: 'Outer radius', thickness: 'Thickness', density: 'Optical density', turbulence: 'Turbulence', detail: 'Filament detail', roughness: 'Cloud roughness', emission: 'Emission strength', emissivityIndex: 'Radial emissivity index', speed: 'Playback speed', phase: 'Frame phase' },
    appearance: { exposure: 'Exposure', bloom: 'Bloom', temperature: 'Palette temperature', gradientMidpoint: 'Gradient midpoint', gradientSoftness: 'Gradient width', clearance: 'Text area clearance' },
    background: { density: 'Star density', brightness: 'Star brightness' },
    physics: { massSolar: 'Mass · M☉', distanceLy: 'Earth distance · ly (0 unknown)', timeScale: 'Physical time multiplier', physicalTime: 'Physical clock (0 off / 1 on)', doppler: 'Doppler shift & beaming', spectralIndex: 'Power-law spectral index α', temperatureK: 'Inner-edge colour temperature · K' },
    colors: { cold: 'Cold colour', warm: 'Warm colour', hot: 'Hot colour' }
  };
  const fieldLabel = (group, schema) => t(schema.label, fieldNames[group][schema.key]);
  const panel = byId('observatory-panel');
  const panelToggle = byId('panel-toggle');
  const shade = byId('drawer-shade');
  const viewport = document.querySelector('.observation-window');
  const narrow = matchMedia('(max-width: 760px)');
  let drawerOpen = false;
  let desktopOpen = true;
  function updatePanel() {
    const open = narrow.matches ? drawerOpen : desktopOpen;
    document.querySelector('.observatory').classList.toggle('panel-collapsed', !narrow.matches && !desktopOpen);
    panel.classList.toggle('is-open', narrow.matches && drawerOpen);
    panelToggle.setAttribute('aria-expanded', String(open));
    panelToggle.textContent = open ? t('收起面板', 'Hide panel') : t('展开面板', 'Show panel');
    shade.hidden = !narrow.matches || !drawerOpen;
    panel.inert = !open;
    viewport.inert = narrow.matches && drawerOpen;
    window.BlackHoleRenderer?.setOccluded(narrow.matches && drawerOpen);
  }
  function setDrawer(open, returnFocus = false) {
    drawerOpen = open && narrow.matches;
    updatePanel();
    if (drawerOpen) byId('panel-close').focus();
    else if (returnFocus) panelToggle.focus();
  }
  panelToggle.addEventListener('click', () => {
    if (narrow.matches) setDrawer(!drawerOpen);
    else { desktopOpen = !desktopOpen; updatePanel(); }
  });
  byId('panel-close').addEventListener('click', () => setDrawer(false, true));
  shade.addEventListener('click', () => setDrawer(false, true));
  document.addEventListener('keydown', event => {
    if (!drawerOpen || !narrow.matches) return;
    if (event.key === 'Escape') { event.preventDefault(); setDrawer(false, true); }
    if (event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('button, select, input, textarea, a[href], summary')]
      .filter(node => !node.disabled && !node.closest('fieldset:disabled') && node.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  narrow.addEventListener('change', () => setDrawer(false));
  updatePanel();

  const Config = window.BlackHoleConfig;
  const Physics = window.BlackHolePhysics;
  const Renderer = window.BlackHoleRenderer;
  const errorBox = byId('control-error');
  const renderStatus = byId('render-status');
  const originalTitle = document.title;
  function setLanguage(next) {
    language = next === 'en' ? 'en' : 'zh';
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    document.title = language === 'en' ? originalTitle.replace('黑洞观测站', 'Black hole observatory') : originalTitle;
    for (const { node, zh, original } of staticText) if (node.isConnected) node.nodeValue = language === 'en' ? original.replace(zh, translations[zh]) : original;
    for (const { node, key, zh } of staticAttributes) if (node.isConnected) node.setAttribute(key, t(zh, translations[zh]));
    byId('language-en').setAttribute('aria-pressed', String(language === 'en'));
    byId('language-cn').setAttribute('aria-pressed', String(language !== 'en'));
    updatePanel();
    if (!Config || !Physics) {
      renderStatus.textContent = t('资源未加载 · 静态预览', 'Resources unavailable · Preview');
      return;
    }
    if (!Renderer) {
      populateCatalog();
      refresh();
      return;
    }
    activeView = currentView();
    populateCatalog();
    error();
    refresh();
    byId('workspace-status').textContent = t('工作区保留在本页；可保存或导出。', 'Workspace is retained here; save locally or export.');
  }
  byId('language-en').addEventListener('click', () => setLanguage('en'));
  byId('language-cn').addEventListener('click', () => setLanguage('zh'));
  if (!Config || !Physics) {
    renderStatus.textContent = '资源未加载 · 静态预览';
    return;
  }
  const format = new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 4 });
  const scientific = new Intl.NumberFormat('en-US', { notation: 'scientific', maximumSignificantDigits: 3 });
  const number = value => Math.abs(value) >= 1e7 || (value !== 0 && Math.abs(value) < 0.001) ? scientific.format(value) : format.format(value);
  const period = seconds => seconds >= 86400 ? `${number(seconds / 86400)} ${t('天', 'd')}` : seconds >= 3600 ? `${number(seconds / 3600)} ${t('小时', 'h')}` : seconds >= 60 ? `${number(seconds / 60)} ${t('分钟', 'min')}` : `${number(seconds)} s`;
  const coordinateFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 });
  const distanceFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
  const percentFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });
  const temperatureFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const kilometers = value => `${distanceFormat.format(value)} km`;
  const clockEquivalent = ratio => {
    const minutes = Math.round(ratio * 60);
    const hours = Math.floor(minutes / 60), remainder = minutes % 60;
    return `${hours} ${t('小时', 'h')}${remainder ? ` ${remainder} ${t('分钟', 'min')}` : ''}`;
  };
  let schwarzschildKm = 0;
  const definitions = [];
  const colorBindings = [];
  const storageKey = 'eh-observatory-workspace-v1';
  const kindLabels = { observed: '真实天体', fictional: '虚构场景', artistic: '艺术场景' };
  const kindEnglish = { observed: 'Observed systems', fictional: 'Fictional scenes', artistic: 'Artistic scenes' };
  const entryText = entry => language === 'en' ? entry.en : entry;
  let selectedId = Physics.catalog.some(entry => entry.id === 'gargantua') ? 'gargantua' : Physics.catalog[0].id;
  let mode = 'presets';
  let changing = false;
  let importedViews = [];
  let selectedEntry = Physics.catalog.find(entry => entry.id === selectedId);
  const customView = view => Config.validateView({ ...Config.clone(view), id: 'custom' });
  let workspace = customView(Physics.createView('warm-cloud'));
  workspace.physics.radiation = 0;
  workspace.label = '自定义视角';
  let workspaceBaseline = Config.clone(workspace);
  let restoreMessage = '';
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      workspace = customView(parsed.view);
      workspaceBaseline = customView(parsed.baseline || parsed.view);
      restoreMessage = '已恢复浏览器保存的工作区。';
    }
  } catch (failure) {
    restoreMessage = `未能恢复保存：${failure.message}`;
  }
  const customIndex = Physics.catalog.length;
  const initialConfig = Config.validate({
    ...Config.clone(Config.defaults), transitionMs: 650, quality: 'auto',
    views: [...Physics.catalog.map(entry => Physics.createView(entry.id)), workspace]
  });
  let activeView = Physics.createView(selectedId);
  byId('workspace-status').textContent = restoreMessage;

  function populateCatalog() {
    byId('object-select').replaceChildren();
    for (const [kind, label] of Object.entries(kindLabels)) {
      const group = document.createElement('optgroup');
      group.label = t(label, kindEnglish[kind]);
      for (const entry of Physics.catalog.filter(item => item.kind === kind)) {
        const option = document.createElement('option'), localized = entryText(entry);
        option.value = entry.id;
        option.textContent = `${localized.name} · ${localized.subtitle}`;
        group.append(option);
      }
      if (group.children.length) byId('object-select').append(group);
    }
    byId('object-select').value = selectedId;
  }
  populateCatalog();
  function error(message = '') {
    errorBox.textContent = language === 'en' ? englishError(message) : message;
    errorBox.hidden = !message;
  }
  function englishError(message) {
    return message
      .replace(/应在 /g, 'must be within ').replace(/必须为 /g, 'must be ')
      .replace(/必须是对象/g, 'must be an object').replace(/应为 #RRGGBB/g, 'must be #RRGGBB')
      .replace(/视角名称应为 1–32 个字符/g, 'View name must contain 1–32 characters')
      .replace(/视角 id 应以小写字母开头，仅含小写字母、数字、连字符，最多 32 字符/g, 'View id: start with a lowercase letter, then lowercase letters, digits or hyphens; max 32 characters')
      .replace(/吸积盘内缘必须大于视界半径/g, 'Disc inner radius must exceed the horizon')
      .replace(/吸积盘外缘必须大于内缘至少 0.2/g, 'Disc outer radius must exceed the inner radius by more than 0.2')
      .replace(/相机必须位于视界之外（距离至少 [\d.]+ rₛ）/g, `Camera must remain outside the horizon (radius at least ${Config.minimumCameraRadiusRs} rₛ)`)
      .replace(/只支持 version: 1 的配置/g, 'Only version: 1 configurations are supported')
      .replace(/配置至少需要一个视角/g, 'Configuration needs at least one view')
      .replace(/视角 id 重复：/g, 'Duplicate view id: ').replace(/quality 应为 auto 或 0–3 的整数/g, 'Quality must be auto or an integer from 0 to 3')
      .replace(/视角/g, 'View').replace(/配置/g, 'Configuration');
  }
  function guard(action) {
    try { action(); error(); } catch (failure) { error(failure.message); }
  }
  function currentView() {
    return Renderer.getView();
  }
  function liveLayout() { return Renderer ? Renderer.getState().layout : 'desktop'; }
  function editedLayout() {
    const selected = byId('camera-layout').value;
    return selected === 'desktop' || selected === 'mobile' ? selected : liveLayout();
  }
  function snapshot() {
    const view = currentView();
    view.camera[liveLayout()] = Renderer.getCamera();
    view.disk.phase = Renderer.getState().time;
    return Config.validateView(view);
  }
  function stashWorkspace() {
    if (mode === 'editor') workspace = customView(snapshot());
  }
  function commit(view) {
    const validated = customView(view);
    changing = true;
    try {
      Renderer.updateView(customIndex, validated, { transition: false });
      workspace = validated;
      activeView = validated;
    } finally { changing = false; }
    byId('workspace-status').textContent = t('工作区已修改；可保存到浏览器或导出 JSON。', 'Workspace changed; save locally or export JSON.');
    refresh();
  }
  function setValue(group, key, value) {
    if (!Renderer || mode !== 'editor') return;
    guard(() => {
      const view = snapshot();
      if (group === 'camera') {
        const layouts = byId('camera-layout').value === 'both' ? ['desktop', 'mobile'] : [editedLayout()];
        for (const layout of layouts) view.camera[layout][key] = value;
      } else view[group][key] = value;
      if (group === 'disk') {
        const disk = view.disk;
        // Adjust the dependent boundaries as one validated renderer update.
        if (key === 'outer') disk.inner = Math.min(disk.inner, disk.outer - 0.201);
        if (key === 'inner' || key === 'outer') disk.horizon = Math.min(disk.horizon, (disk.inner - 0.001) / 1.01);
        disk.inner = Math.max(disk.inner, disk.horizon * 1.01 + 0.001);
        disk.outer = Math.max(disk.outer, disk.inner + 0.201);
        for (const camera of Object.values(view.camera)) camera.distance = Math.max(camera.distance, disk.horizon * Config.minimumCameraRadiusRs);
      }
      if (group === 'camera' && key === 'distance') {
        for (const camera of Object.values(view.camera)) camera.distance = Math.max(camera.distance, view.disk.horizon * Config.minimumCameraRadiusRs);
      }
      Config.validateView(view);
      cancelInput();
      if (group === 'disk' && key === 'phase') Renderer.setPlaying(false);
      commit(view);
    });
  }
  function isInapplicable(group, key) {
    const radiation = activeView.physics.radiation;
    return (key === 'temperatureK' && radiation !== 1)
      || (key === 'spectralIndex' && radiation !== 2)
      || (['temperature', 'gradientMidpoint', 'gradientSoftness', 'emissivityIndex'].includes(key) && radiation === 1)
      || (key === 'timeScale' && activeView.physics.physicalTime === 0)
      || (group === 'colors' && radiation === 1);
  }
  function radiusDivisor(group, key) {
    return byId('radius-unit').value === 'rs' && ((group === 'disk' && ['inner', 'outer'].includes(key)) || (group === 'camera' && key === 'distance')) ? activeView.disk.horizon : 1;
  }
  function buildControl(containerId, group, schema) {
    const key = schema.key, id = `control-${group}-${key}`;
    const row = document.createElement('div');
    row.className = 'control-row';
    const head = document.createElement('div');
    head.className = 'control-row-head';
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = schema.label;
    const input = document.createElement('input');
    input.id = id; input.type = 'number'; input.className = 'control-number'; input.step = 'any';
    const toggle = Boolean(schema.toggle);
    const phase = key === 'phase';
    const logarithmic = ['massSolar', 'timeScale', 'distanceLy', 'exposure'].includes(key);
    const logOffset = schema.min === 0 ? 1 : 0;
    const toRange = value => logarithmic ? Math.log10(value + logOffset) : value;
    const fromRange = value => logarithmic ? 10 ** value - logOffset : value;
    const knob = phase ? null : document.createElement('input');
    if (knob) {
      knob.id = `${id}-range`; knob.type = toggle ? 'checkbox' : 'range';
      knob.className = toggle ? 'control-toggle' : 'control-range';
      knob.setAttribute('aria-label', `${schema.label}${toggle ? '开关' : '滑块'}`);
      knob.addEventListener(toggle ? 'change' : 'input', () => {
        const divisor = radiusDivisor(group, key);
        let value = toggle ? Number(knob.checked) : fromRange(Number(knob.value)) * divisor;
        value = Math.max(schema.min, Math.min(schema.max, value));
        input.removeAttribute('aria-invalid');
        setValue(group, key, value);
      });
    }
    input.addEventListener('change', () => {
      const value = input.valueAsNumber * radiusDivisor(group, key);
      if (!Number.isFinite(value) || value < schema.min || value > schema.max || (toggle && value !== 0 && value !== 1)) {
        input.setAttribute('aria-invalid', 'true');
        error(`${fieldLabel(group, schema)}: ${t('请输入', 'Enter')} ${input.min} – ${input.max}${toggle ? t('（0 或 1）', ' (0 or 1)') : ''}.`);
        return;
      }
      input.removeAttribute('aria-invalid');
      setValue(group, key, value);
    });
    head.append(label, input); row.append(head);
    if (knob) row.append(knob);
    const ends = document.createElement('div');
    ends.className = 'range-ends';
    row.append(ends);
    byId(containerId).append(row);
    definitions.push({ group, key, schema, row, label, input, knob, toggle, toRange, ends });
  }
  const containers = { camera: 'camera-controls', disk: 'disk-controls', appearance: 'appearance-controls', background: 'background-controls', physics: 'physical-controls' };
  for (const [group, container] of Object.entries(containers)) {
    for (const schema of Config.fields[group]) {
      if (schema.key === 'radiation') continue;
      const target = ['temperatureK', 'spectralIndex', 'doppler'].includes(schema.key) ? 'radiation-controls'
        : ['phase', 'speed'].includes(schema.key) ? 'physical-controls' : container;
      buildControl(target, group, schema);
    }
  }
  for (const schema of Config.fields.colors) {
    const row = document.createElement('div'); row.className = 'color-row';
    const label = document.createElement('label'); label.textContent = schema.label; label.htmlFor = `control-colors-${schema.key}`;
    const text = document.createElement('input');
    text.id = label.htmlFor; text.type = 'text'; text.className = 'text-input color-hex'; text.maxLength = 7; text.spellcheck = false;
    const picker = document.createElement('input'); picker.type = 'color'; picker.setAttribute('aria-label', `${schema.label}选色`);
    text.addEventListener('change', () => {
      const value = text.value.trim();
      if (!/^#[0-9a-f]{6}$/i.test(value)) { text.setAttribute('aria-invalid', 'true'); error(t('颜色请输入 #RRGGBB。', 'Enter a #RRGGBB colour.')); return; }
      text.removeAttribute('aria-invalid'); setValue('colors', schema.key, value);
    });
    picker.addEventListener('input', () => { text.removeAttribute('aria-invalid'); setValue('colors', schema.key, picker.value); });
    row.append(label, picker, text); byId('color-controls').append(row);
    colorBindings.push({ key: schema.key, schema, label, text, picker });
  }
  let gradientKey = '';
  function refreshGradient() {
    const { gradientMidpoint: mid, gradientSoftness: width } = activeView.appearance;
    const { cold, warm, hot } = activeView.colors;
    const key = `${cold}${warm}${hot}/${mid}/${width}/${language}`;
    if (key === gradientKey) return;
    gradientKey = key;
    const rgb = hex => [1, 3, 5].map(index => {
      const c = parseInt(hex.slice(index, index + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    const a = rgb(cold), b = rgb(warm), c = rgb(hot);
    const smooth = (lo, hi, value) => { const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo))); return t * t * (3 - 2 * t); };
    const stops = [];
    for (let i = 0; i <= 24; i++) {
      const heat = i / 24, ab = smooth(mid - 0.48 * width, mid, heat), bc = smooth(mid, mid + 0.38 * width, heat);
      const color = a.map((value, channel) => {
        const linear = (value * (1 - ab) + b[channel] * ab) * (1 - bc) + c[channel] * bc;
        return Math.round(255 * (linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055));
      });
      stops.push(`rgb(${color.join(',')}) ${heat * 100}%`);
    }
    byId('gradient-preview').style.background = `linear-gradient(90deg,${stops.join(',')})`;
    byId('gradient-preview').setAttribute('aria-label', `${t('冷 / 暖 / 热', 'Cold / warm / hot')}: ${cold} / ${warm} / ${hot}; ${t('中点', 'midpoint')} ${mid}; ${t('宽度', 'width')} ${width}`);
  }
  function refreshControls() {
    const camera = activeView.camera[editedLayout()];
    for (const control of definitions) {
      const { group, key, schema, row, label, input, knob, toggle, toRange, ends } = control;
      label.textContent = fieldLabel(group, schema);
      if (knob) knob.setAttribute('aria-label', `${fieldLabel(group, schema)} ${toggle ? t('开关', 'toggle') : t('滑块', 'slider')}`);
      const divisor = radiusDivisor(group, key);
      const value = (group === 'camera' ? camera[key] : activeView[group][key]) / divisor;
      input.min = (group === 'camera' && key === 'distance' ? Math.max(schema.min, activeView.disk.horizon * Config.minimumCameraRadiusRs) : schema.min) / divisor;
      input.max = schema.max / divisor;
      if (document.activeElement !== input && !input.hasAttribute('aria-invalid')) {
        input.value = key === 'phase' ? value : Math.max(Number(input.min), Math.min(Number(input.max), Number(value.toPrecision(7))));
      }
      const disabled = isInapplicable(group, key);
      row.classList.toggle('is-inapplicable', disabled); input.disabled = disabled;
      if (knob) {
        knob.disabled = disabled;
        if (toggle) knob.checked = value === 1;
        else {
          knob.min = toRange(Number(input.min)); knob.max = toRange(schema.max / divisor);
          knob.step = 'any'; knob.value = toRange(value);
          knob.setAttribute('aria-valuetext', `${number(value)}${divisor !== 1 ? ' rₛ' : ''}`);
        }
      }
      ends.textContent = `${number(Number(input.min))} — ${number(schema.max / divisor)}${divisor !== 1 ? ' rₛ' : ''}`;
    }
    byId('radiation-mode').value = activeView.physics.radiation;
    for (const { key, schema, label, text, picker } of colorBindings) {
      label.textContent = fieldLabel('colors', schema);
      picker.setAttribute('aria-label', `${fieldLabel('colors', schema)} ${t('选色', 'picker')}`);
      if (!text.hasAttribute('aria-invalid')) text.value = activeView.colors[key];
      picker.value = activeView.colors[key];
      text.disabled = picker.disabled = isInapplicable('colors', key);
    }
    byId('palette-controls').classList.toggle('is-inapplicable', activeView.physics.radiation === 1);
    byId('palette-note').textContent = activeView.physics.radiation === 1
      ? t('热谱决定颜色；选择“艺术调色”可编辑渐变。', 'The thermal spectrum sets colour. Choose Artistic palette to edit the gradient.')
      : t('冷区、中段和热区颜色可独立调整。', 'Edit outer, middle and inner colours independently.');
    byId('camera-layout-note').textContent = `${t('当前画布', 'Viewport')}: ${liveLayout() === 'mobile' ? t('手机', 'mobile') : t('桌面', 'desktop')} · ${t('短边 FOV', 'short-axis FOV')}. ${editedLayout() !== liveLayout() ? t('这套相机在对应画布宽度下生效。', 'This camera applies at its matching viewport width.') : ''}`;
    if (document.activeElement !== byId('workspace-name')) byId('workspace-name').value = workspace.label;
    refreshGradient();
  }
  function refreshCatalog() {
    const editor = mode === 'editor';
    byId('mode-presets').setAttribute('aria-pressed', String(!editor));
    byId('mode-editor').setAttribute('aria-pressed', String(editor));
    byId('preset-panel').hidden = editor;
    byId('editor-controls').hidden = !editor;
    const localized = entryText(selectedEntry);
    byId('object-name').textContent = editor ? workspace.label : localized.name;
    byId('object-subtitle').textContent = editor ? '' : localized.subtitle;
    byId('object-kind').textContent = editor ? t('自由编辑', 'Editor') : t(kindLabels[selectedEntry.kind], kindEnglish[selectedEntry.kind]);
    byId('object-description').textContent = localized.description;
    byId('object-select').value = selectedId;
  }
  function refreshReadouts(camera) {
    const derived = Physics.derive(activeView.physics, activeView.disk, camera);
    schwarzschildKm = derived.schwarzschildKm;
    byId('readout-radius').textContent = kilometers(schwarzschildKm);
    byId('readout-radius-au').textContent = `${number(derived.schwarzschildAU)} AU`;
    byId('readout-period').textContent = period(derived.iscoPeriodSeconds);
    byId('readout-shadow').textContent = derived.shadowMicroas === null ? t('距离未知', 'Unknown distance') : `${number(derived.shadowMicroas)} μas`;
    byId('readout-distance').textContent = activeView.physics.distanceLy > 0 ? `${number(activeView.physics.distanceLy)} ${t('光年', 'ly')}` : t('地球距离未知', 'Earth distance unknown');
    const temperature = derived.diskTemperature;
    byId('readout-temperature').textContent = temperature
      ? `${temperatureFormat.format(temperature.meanCelsius)} °C`
      : t('未定义热温度', 'No thermal temperature');
    byId('readout-temperature-edges').textContent = temperature
      ? `${t('内 / 外缘', 'Inner / outer')}: ${temperatureFormat.format(temperature.innerCelsius)} / ${temperatureFormat.format(temperature.outerCelsius)} °C`
      : activeView.physics.radiation === 2 ? t('幂律假色 · 非热谱', 'Power-law false colour · nonthermal') : t('艺术调色 · 非热谱', 'Artistic palette · nonthermal');
    byId('temperature-readout').title = temperature
      ? t('局部模型色温，按坐标环面积加权；不是实测气体温度，也不是红移后的图像温度。', 'Local model colour temperature, weighted by coordinate annular area; not measured gas temperature or redshifted image temperature.')
      : t('此场景未指定热谱，不能由调色推算摄氏温度。', 'No thermal spectrum is assigned; Celsius temperature cannot be inferred from the palette.');
    refreshCameraReadout(camera);
  }
  function refreshCameraReadout(camera) {
    byId('camera-readout').textContent = `FOV ${camera.fov.toFixed(1)}° · ${t('距中心', 'Centre')} ${coordinateFormat.format(camera.distance / activeView.disk.horizon)} rₛ`;
    byId('camera-readout').title = `${kilometers(schwarzschildKm * camera.distance / activeView.disk.horizon)} · ${t('坐标半径，非固有距离', 'Coordinate radius, not proper distance')}`;
  }
  function refreshState() {
    if (!Renderer) {
      renderStatus.textContent = t('WebGL2 不可用 · 静态预览', 'WebGL2 unavailable · Preview');
      byId('time-readout').textContent = t('静态预览', 'Static preview');
      return;
    }
    const state = Renderer.getState();
    renderStatus.dataset.ready = String(state.ready);
    renderStatus.textContent = state.failed || !state.ready ? t('实时渲染不可用 · 静态预览', 'Renderer unavailable · Preview') : state.suspended ? t('已挂起', 'Suspended') : state.playing ? t('播放中', 'Playing') : t('已暂停', 'Paused');
    byId('play-toggle').textContent = state.playing ? t('暂停', 'Pause') : t('播放', 'Play');
    byId('play-toggle').setAttribute('aria-pressed', String(state.playing));
    const rate = activeView.physics.timeScale * activeView.disk.speed;
    byId('time-readout').textContent = state.effectiveTimeScale == null ? t('演示时钟', 'Artistic clock') : `${t('物理时间倍率', 'Physical time multiplier')} ×${number(rate)}`;
  }
  function refresh() {
    refreshCatalog();
    refreshControls();
    refreshReadouts(Renderer ? Renderer.getCamera() : activeView.camera.desktop);
    refreshState();
    if (Renderer) renderStatistics();
  }
  refreshCatalog();
  if (!Renderer) {
    refresh();
    canvas.tabIndex = -1;
    return;
  }
  Renderer.setParallax(false);
  Renderer.setConfig(initialConfig, { transition: false });
  Renderer.setView(initialConfig.views.findIndex(view => view.id === selectedId), { transition: false, preserveTime: false });
  activeView = currentView();
  byId('scene-controls').disabled = false;
  setLanguage('zh');
  addEventListener('blackhole:change', () => {
    if (changing) return;
    activeView = currentView();
    refresh();
  });
  canvas.addEventListener('webglcontextlost', () => {
    renderStatus.dataset.ready = 'false';
    cancelInput();
    renderStatus.textContent = t('图形上下文丢失 · 等待恢复', 'Graphics context lost · Waiting to restore');
  });

  const cameraFields = new Map(Config.fields.camera.map(definition => [definition.key, definition]));
  const pointers = new Map();
  const movementKeys = new Set();
  let movementFrame = 0, movementAt = 0;
  function advanceMovement(now) {
    movementFrame = 0;
    if (!movementKeys.size || document.hidden || document.activeElement !== canvas) { movementKeys.clear(); movementAt = 0; return; }
    const dt = movementAt ? Math.min(0.05, (now - movementAt) / 1000) : 0;
    movementAt = now;
    const camera = cameraStart(), azimuth = camera.azimuth * Math.PI / 180, elevation = camera.elevation * Math.PI / 180;
    const radial = [Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.cos(azimuth)];
    const right = [Math.cos(azimuth), 0, -Math.sin(azimuth)];
    const forward = Number(movementKeys.has('w')) - Number(movementKeys.has('s'));
    const sideways = Number(movementKeys.has('d')) - Number(movementKeys.has('a'));
    const speed = Math.max(activeView.disk.horizon * 0.06, (camera.distance - activeView.disk.horizon) * 0.65);
    const step = dt * speed / Math.max(1, Math.hypot(forward, sideways));
    const position = radial.map((axis, index) => axis * camera.distance + (right[index] * sideways - axis * forward) * step);
    const distance = Math.hypot(...position);
    moveCamera({ distance, azimuth: Math.atan2(position[0], position[2]) * 180 / Math.PI, elevation: Math.asin(position[1] / distance) * 180 / Math.PI });
    movementFrame = requestAnimationFrame(advanceMovement);
  }
  let commandCamera = null;
  let pendingCamera = null;
  let inputFrame = 0;
  let settleTimer = 0;
  let lastCommandAt = 0;
  let gestureWidth = 1, gestureHeight = 1;
  function cameraStart() {
    if (!commandCamera || performance.now() - lastCommandAt > 250) commandCamera = Renderer.getCamera();
    return commandCamera;
  }
  function flushCamera() {
    inputFrame = 0;
    if (!pendingCamera) return;
    Renderer.setCamera(pendingCamera, { smooth: true, responseMs: 110, linkLayouts: byId('camera-layout').value === 'both', notify: false });
    pendingCamera = null;
    refreshCameraReadout(commandCamera);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (!document.hidden && !pointers.size && !movementKeys.size) {
        activeView = currentView();
        if (mode === 'editor') stashWorkspace();
        refreshControls(); refreshCameraReadout(Renderer.getCamera());
      }
    }, 350);
  }
  function moveCamera(patch) {
    const camera = cameraStart();
    for (const [key, value] of Object.entries(patch)) {
      const schema = cameraFields.get(key);
      const min = key === 'distance' ? Math.max(schema.min, activeView.disk.horizon * Config.minimumCameraRadiusRs) : schema.min;
      camera[key] = key === 'azimuth' ? ((value + 180) % 360 + 360) % 360 - 180 : Math.max(min, Math.min(schema.max, value));
    }
    commandCamera = camera;
    lastCommandAt = performance.now();
    pendingCamera = camera;
    if (!inputFrame) inputFrame = requestAnimationFrame(flushCamera);
  }
  function stopGesture() {
    for (const id of pointers.keys()) {
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    }
    pointers.clear();
    canvas.classList.remove('is-dragging');
  }
  function cancelInput() {
    stopGesture();
    if (inputFrame) cancelAnimationFrame(inputFrame);
    inputFrame = 0; pendingCamera = commandCamera = null;
    clearTimeout(settleTimer);
    movementKeys.clear();
    if (movementFrame) cancelAnimationFrame(movementFrame);
    movementFrame = 0; movementAt = 0;
  }
  function resetCamera() {
    cancelInput();
    const baseline = mode === 'editor' ? workspaceBaseline : Physics.createView(selectedId);
    const layout = Renderer.getState().layout;
    commandCamera = { ...baseline.camera[layout] };
    commandCamera.distance = Math.max(commandCamera.distance, activeView.disk.horizon * Config.minimumCameraRadiusRs);
    Renderer.setCamera(commandCamera, { smooth: true, responseMs: 180, linkLayouts: byId('camera-layout').value === 'both', notify: false });
    lastCommandAt = performance.now();
    refreshCameraReadout(commandCamera);
    activeView = currentView(); refreshControls();
  }
  function playPause() { Renderer.setPlaying(!Renderer.getState().playing); refreshState(); }
  byId('play-toggle').addEventListener('click', playPause);
  byId('reset-camera').addEventListener('click', resetCamera);
  byId('return-to-view').addEventListener('click', resetCamera);
  for (const button of document.querySelectorAll('[data-clock-ratio]')) {
    button.addEventListener('click', () => {
      const ratio = Number(button.dataset.clockRatio);
      cancelInput();
      const radiusRs = Math.max(Config.minimumCameraRadiusRs, 1 + 1 / (ratio * ratio - 1));
      moveCamera({ distance: activeView.disk.horizon * radiusRs });
      byId('statistics-toggle').checked = true;
      syncStatistics();
      if (narrow.matches) setDrawer(false, true);
    });
  }
  byId('radiation-mode').addEventListener('change', event => setValue('physics', 'radiation', Number(event.target.value)));
  byId('camera-layout').addEventListener('change', refreshControls);
  byId('radius-unit').addEventListener('change', refreshControls);
  byId('quality-select').addEventListener('change', event => {
    Renderer.setQuality(event.target.value === 'auto' ? 'auto' : Number(event.target.value));
  });
  function clearInvalidInputs() {
    for (const input of panel.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
  }
  function switchMode(next, id = selectedId) {
    stashWorkspace(); cancelInput(); clearInvalidInputs();
    changing = true;
    try {
      if (next === 'editor') {
        Renderer.updateView(customIndex, workspace, { transition: false });
        Renderer.setView(customIndex, { transition: false, preserveTime: false });
      } else {
        selectedId = id;
        selectedEntry = Physics.catalog.find(entry => entry.id === selectedId);
        const index = initialConfig.views.findIndex(view => view.id === selectedId);
        Renderer.updateView(index, Physics.createView(selectedId), { transition: false });
        Renderer.setView(index, { transition: false, preserveTime: false });
      }
      mode = next;
      activeView = currentView();
    } finally { changing = false; }
    syncStatistics(true); error(); refresh();
  }
  byId('mode-presets').addEventListener('click', () => guard(() => { if (mode !== 'presets') switchMode('presets'); }));
  byId('mode-editor').addEventListener('click', () => guard(() => { if (mode !== 'editor') switchMode('editor'); }));
  byId('object-select').addEventListener('change', event => guard(() => switchMode('presets', event.target.value)));
  byId('copy-to-editor').addEventListener('click', () => guard(() => {
    workspace = customView(snapshot());
    workspace.label = entryText(selectedEntry).name.slice(0, 32);
    workspaceBaseline = Config.clone(workspace);
    switchMode('editor');
    byId('workspace-status').textContent = t('已复制当前画面与相位。', 'Current camera, material and phase copied.');
  }));
  byId('freeze-frame').addEventListener('click', () => guard(() => {
    const view = snapshot(); cancelInput();
    changing = true;
    try {
      Renderer.setPlaying(false);
      Renderer.updateView(Renderer.getState().viewIndex, view, { transition: false });
      Renderer.setTime(view.disk.phase);
    } finally { changing = false; }
    activeView = currentView();
    if (mode === 'editor') workspace = customView(activeView);
    refresh();
  }));
  byId('workspace-name').addEventListener('change', event => guard(() => {
    const view = snapshot(); view.label = event.target.value.trim();
    event.target.setAttribute('aria-invalid', String(!view.label || view.label.length > 32));
    Config.validateView(view);
    event.target.removeAttribute('aria-invalid'); commit(view);
  }));
  byId('reset-workspace').addEventListener('click', () => guard(() => {
    cancelInput(); clearInvalidInputs(); Renderer.setPlaying(false);
    commit(Config.clone(workspaceBaseline));
    byId('workspace-status').textContent = t('已恢复复制或导入时的工作区。', 'Restored the copied or imported baseline.');
  }));
  function requireValidInputs() {
    const invalid = byId('editor-controls').querySelector('[aria-invalid="true"]');
    if (invalid) {
      invalid.focus();
      throw new Error(t('请先修正标出的输入；预览仍为上次有效值。', 'Correct the marked input first; the preview retains its last valid value.'));
    }
  }
  byId('save-workspace').addEventListener('click', () => guard(() => {
    requireValidInputs();
    stashWorkspace();
    try { localStorage.setItem(storageKey, JSON.stringify({ view: workspace, baseline: workspaceBaseline })); }
    catch { throw new Error(t('浏览器无法保存；工作区仍保留在本页，请导出 JSON。', 'Browser storage is unavailable. Your workspace remains here; export JSON to keep it.')); }
    byId('workspace-status').textContent = t('已保存到此浏览器。', 'Saved in this browser.');
  }));
  function exportView() {
    requireValidInputs();
    stashWorkspace();
    const { version, transitionMs, quality } = Renderer.getConfig();
    const text = JSON.stringify({ version, transitionMs, quality, view: Config.validateView(workspace) }, null, 2);
    byId('view-json').value = text;
    return text;
  }
  byId('export-view').addEventListener('click', () => guard(exportView));
  byId('download-view').addEventListener('click', () => guard(() => {
    const url = URL.createObjectURL(new Blob([exportView()], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'black-hole-view.json';
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }));
  function inspectImport() {
    importedViews = []; byId('import-preview').hidden = true;
    let parsed;
    try { parsed = JSON.parse(byId('view-json').value); }
    catch { throw new Error(t('JSON 格式无效，请检查括号、引号和逗号。', 'Invalid JSON syntax; check brackets, quotes and commas.')); }
    if (parsed?.views !== undefined) importedViews = Config.validate(parsed).views;
    else if (parsed?.view !== undefined) {
      if (parsed.version !== 1) throw new Error(t('只支持 version: 1 的配置', 'Only version: 1 configurations are supported'));
      importedViews = [Config.validateView(parsed.view)];
    } else importedViews = [Config.validateView(parsed)];
    byId('import-view-select').replaceChildren(...importedViews.map((view, index) => {
      const option = document.createElement('option'); option.value = index; option.textContent = view.label; return option;
    }));
    byId('import-preview').hidden = false;
  }
  byId('inspect-import').addEventListener('click', () => guard(inspectImport));
  byId('view-json').addEventListener('input', () => { importedViews = []; byId('import-preview').hidden = true; });
  byId('import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try { byId('view-json').value = await file.text(); inspectImport(); error(); }
    catch (failure) { error(failure.message); }
    finally { event.target.value = ''; }
  });
  byId('apply-import').addEventListener('click', () => guard(() => {
    const imported = importedViews[Number(byId('import-view-select').value)];
    if (!imported) throw new Error(t('请先检查 JSON。', 'Check the JSON before importing.'));
    cancelInput(); clearInvalidInputs(); Renderer.setPlaying(false);
    commit(imported); workspaceBaseline = Config.clone(workspace);
    byId('workspace-status').textContent = t('已导入；可保存到此浏览器。', 'Imported; save to keep it in this browser.');
  }));
  function measureGesture() {
    const bounds = canvas.getBoundingClientRect();
    gestureWidth = Math.max(1, bounds.width); gestureHeight = Math.max(1, bounds.height);
  }
  measureGesture();
  function touchPair() {
    const values = [...pointers.values()];
    if (values.length < 2) return null;
    const a = values[0], b = values[1];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.button > 2 || pointers.size >= 2) return;
    event.preventDefault(); canvas.focus({ preventScroll: true });
    if (!pointers.size) {
      commandCamera = Renderer.getCamera(); lastCommandAt = performance.now(); measureGesture();
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, pan: event.button !== 0 || event.shiftKey });
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', event => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    const before = pointers.size > 1 ? touchPair() : null;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    pointer.x = event.clientX; pointer.y = event.clientY;
    const camera = cameraStart();
    if (before) {
      const after = touchPair();
      moveCamera({ x: camera.x + (after.x - before.x) / gestureWidth, y: camera.y + (after.y - before.y) / gestureHeight, distance: camera.distance * before.distance / after.distance });
    } else if (pointer.pan || event.shiftKey) {
      moveCamera({ x: camera.x + dx / gestureWidth, y: camera.y + dy / gestureHeight });
    } else {
      moveCamera({ azimuth: camera.azimuth - dx * 0.23, elevation: camera.elevation + dy * 0.2 });
    }
  });
  function endPointer(event) {
    pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!pointers.size) canvas.classList.remove('is-dragging');
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('lostpointercapture', endPointer);
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const camera = cameraStart();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? gestureHeight : 1);
    const key = event.ctrlKey || event.metaKey ? 'fov' : 'distance';
    moveCamera({ [key]: camera[key] * Math.exp(Math.max(-0.3, Math.min(0.3, delta * 0.0015))) });
  }, { passive: false });
  canvas.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const camera = cameraStart();
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) {
      event.preventDefault(); movementKeys.add(key);
      if (!movementFrame) movementFrame = requestAnimationFrame(advanceMovement);
      return;
    }
    const orbit = { arrowleft: [-3, 0], arrowright: [3, 0], arrowup: [0, 3], arrowdown: [0, -3] }[key];
    if (orbit) {
      event.preventDefault();
      if (event.shiftKey) moveCamera({ x: camera.x + orbit[0] / 120, y: camera.y - orbit[1] / 120 });
      else moveCamera({ azimuth: camera.azimuth + orbit[0], elevation: camera.elevation + orbit[1] });
    } else if (['+', '=', '-', '_'].includes(key)) {
      event.preventDefault();
      moveCamera({ distance: camera.distance * (key === '+' || key === '=' ? 0.94 : 1.06) });
    } else if (key === '[' || key === ']') {
      event.preventDefault();
      moveCamera({ fov: camera.fov * (key === '[' ? 0.94 : 1.06) });
    } else if (key === 'r') { event.preventDefault(); resetCamera(); }
    else if (key === ' ') { event.preventDefault(); if (!event.repeat) playPause(); }
  });
  addEventListener('keyup', event => {
    movementKeys.delete(event.key.toLowerCase());
    if (!movementKeys.size && movementFrame) { cancelAnimationFrame(movementFrame); movementFrame = 0; movementAt = 0; }
  });
  canvas.addEventListener('blur', cancelInput);
  addEventListener('blur', cancelInput);
  addEventListener('resize', () => { cancelInput(); measureGesture(); refreshCameraReadout(Renderer.getCamera()); }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelInput();
    else refreshState();
  });
  function renderStatistics(stats) {
    if (byId('statistics-panel').hidden) return;
    stats ??= Renderer.getStatistics();
    byId('stat-horizon').textContent = `${coordinateFormat.format(stats.horizonDistanceRs)} rₛ · ${kilometers(stats.horizonDistanceKm)}`;
    byId('stat-centre').textContent = `${coordinateFormat.format(stats.radiusRs)} rₛ · ${kilometers(stats.radiusKm)}`;
    byId('stat-gap-explanation').textContent = t(
      `在视界之外，间隔为视界半径的 ${percentFormat.format(stats.horizonDistanceRs * 100)}%；1 rₛ = ${kilometers(stats.horizonRadiusKm)}。`,
      `Outside the horizon by ${percentFormat.format(stats.horizonDistanceRs * 100)}% of its radius; 1 rₛ = ${kilometers(stats.horizonRadiusKm)}.`
    );
    byId('stat-ratio').textContent = `×${number(stats.earthPerLocalSecond)}`;
    byId('stat-clock-equivalent').textContent = clockEquivalent(stats.earthPerLocalSecond);
    byId('stat-shadow-hint').hidden = !stats.shadowCoversView;
    byId('stat-shadow-hint').textContent = t(
      '相机朝向黑洞，阴影已覆盖视野；全黑不代表到达视界。前景气体仍可能发光。',
      'The camera faces the hole; its shadow covers the view. A black field is not the horizon. Foreground gas may still emit light.'
    );
    byId('stat-earth').textContent = period(stats.earthSeconds);
    byId('stat-local').textContent = period(stats.localSeconds);
  }
  function syncStatistics(reset = false) {
    const available = mode === 'presets' && selectedEntry.kind === 'observed';
    byId('statistics-controls').hidden = !available;
    const enabled = available && byId('statistics-toggle').checked;
    byId('statistics-panel').hidden = !enabled;
    Renderer.setStatistics(enabled);
    if (reset) Renderer.resetStatistics();
    renderStatistics();
  }
  byId('statistics-toggle').addEventListener('change', () => syncStatistics());
  byId('reset-statistics').addEventListener('click', () => { Renderer.resetStatistics(); renderStatistics(); });
  addEventListener('blackhole:statistics', event => renderStatistics(event.detail));
  syncStatistics();
  addEventListener('pagehide', cancelInput);
})();

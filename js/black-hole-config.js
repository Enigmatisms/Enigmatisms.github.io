(() => {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const fields = {
    camera: [
      { key: 'x', label: '水平位置（0 左 / 1 右）', min: -0.5, max: 1.8, step: 0.005 },
      { key: 'y', label: '垂直位置（0 上 / 1 下）', min: -0.5, max: 1.5, step: 0.005 },
      { key: 'fov', label: '视场角 FOV（小 = 放大）', min: 5, max: 100, step: 0.1 },
      { key: 'elevation', label: '俯仰角 °', min: -85, max: 85, step: 0.1 },
      { key: 'azimuth', label: '环绕角 °', min: -180, max: 180, step: 0.5 },
      { key: 'roll', label: '画面倾斜 °', min: -90, max: 90, step: 0.1 },
      { key: 'distance', label: '相机距离', min: 8, max: 80, step: 0.1 }
    ],
    disk: [
      { key: 'horizon', label: '视界半径', min: 0.5, max: 4, step: 0.01 },
      { key: 'inner', label: '吸积盘内缘', min: 1, max: 16, step: 0.05 },
      { key: 'outer', label: '吸积盘外缘', min: 5, max: 40, step: 0.1 },
      { key: 'thickness', label: '盘厚度', min: 0.15, max: 4, step: 0.025 },
      { key: 'density', label: '体积密度', min: 0.05, max: 5, step: 0.025 },
      { key: 'turbulence', label: '湍流强度', min: 0, max: 3, step: 0.025 },
      { key: 'detail', label: '细丝强度', min: 0, max: 3, step: 0.025 },
      { key: 'emission', label: '盘面发光强度', min: 0.05, max: 6, step: 0.025 },
      { key: 'speed', label: '旋转速度', min: -3, max: 3, step: 0.025 },
      { key: 'phase', label: '时间相位（冻结帧）', min: 0, max: 20, step: 0.01 }
    ],
    appearance: [
      { key: 'exposure', label: '曝光', min: 0.1, max: 5, step: 0.025 },
      { key: 'bloom', label: '亮部光晕', min: 0, max: 4, step: 0.025 },
      { key: 'temperature', label: '色温系数', min: 0.35, max: 2, step: 0.025 },
      { key: 'clearance', label: '文字区域避让（0 关闭 / 1 开启）', min: 0, max: 1, step: 0.05 }
    ],
    background: [
      { key: 'density', label: '背景星空密度', min: 0, max: 3, step: 0.05 },
      { key: 'brightness', label: '背景星空亮度', min: 0, max: 5, step: 0.05 }
    ],
    colors: [
      { key: 'cold', label: '外层冷区颜色' },
      { key: 'warm', label: '中层暖区颜色' },
      { key: 'hot', label: '内层热区颜色' }
    ]
  };
  // Keep the optional v1 background fallback stable for older saved files.
  const backgroundDefaults = { density: 0.65, brightness: 0.8 };
  const material = {
    disk: { horizon: 1.33, inner: 3.6, outer: 13.5, thickness: 0.4, density: 2.85, turbulence: 1.9, detail: 1.5, speed: 0.725, emission: 2.75 },
    appearance: { exposure: 0.5, bloom: 2.4, temperature: 1.025, clearance: 1 },
    background: { density: 1.5, brightness: 0.7 },
    colors: { cold: '#c82718', warm: '#ff903a', hot: '#fff1d7' }
  };
  function camera(x, y, fov, elevation, roll, azimuth = 0) {
    return { x, y, fov, elevation, azimuth, roll, distance: 26 };
  }
  function preset(index, desktop, phase) {
    const view = {
      id: `view-${index}`, label: `视角${index}`,
      camera: { desktop, mobile: camera(1, 0.8, 20.408, 11.46, 13.18) },
      ...clone(material)
    };
    view.disk.phase = phase;
    return view;
  }
  const defaults = {
    version: 1,
    transitionMs: 1400,
    quality: 'auto',
    views: [
      // Accepted view-1.json .. view-4.json; their editor IDs were all "close".
      preset(1, camera(0.89, 0.525, 29.1, 8.7, 8.6, 2), 1.796101470878881),
      preset(2, camera(0.98, 0.5, 19.7, 2.5, 0, 2), 2.635855951656069),
      preset(3, camera(0.7, 0.505, 42, 3.6, 0, 2), 7.250114281054692),
      preset(4, camera(0.7, 0.505, 42, 9.8, 16.9, 2), 3.591380109132146)
    ]
  };
  function object(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} 必须是对象`);
  }
  function number(value, definition, name) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < definition.min || value > definition.max) {
      throw new Error(`${name} 应在 ${definition.min}–${definition.max} 之间`);
    }
    return value;
  }
  function numericGroup(value, group, name) {
    object(value, name);
    const result = {};
    for (const field of fields[group]) result[field.key] = number(value[field.key], field, `${name}.${field.key}`);
    return result;
  }
  function validateView(value) {
    object(value, '视角');
    if (typeof value.id !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(value.id)) throw new Error('视角 id 应以小写字母开头，仅含小写字母、数字、连字符，最多 32 字符');
    if (typeof value.label !== 'string' || !value.label.trim() || value.label.length > 32) throw new Error('视角名称应为 1–32 个字符');
    object(value.camera, 'camera');
    const desktop = numericGroup(value.camera.desktop, 'camera', 'camera.desktop');
    const mobile = numericGroup(value.camera.mobile, 'camera', 'camera.mobile');
    const disk = numericGroup(value.disk, 'disk', 'disk');
    const appearance = numericGroup(value.appearance, 'appearance', 'appearance');
    const background = numericGroup(
      Object.prototype.hasOwnProperty.call(value, 'background') ? value.background : backgroundDefaults,
      'background', 'background'
    );
    object(value.colors, 'colors');
    const colors = {};
    for (const field of fields.colors) {
      const color = value.colors[field.key];
      if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`colors.${field.key} 应为 #RRGGBB`);
      colors[field.key] = color.toLowerCase();
    }
    if (disk.inner <= disk.horizon * 1.01) throw new Error('吸积盘内缘必须大于视界半径');
    if (disk.outer <= disk.inner + 0.2) throw new Error('吸积盘外缘必须大于内缘至少 0.2');
    return { id: value.id, label: value.label.trim(), camera: { desktop, mobile }, disk, appearance, background, colors };
  }
  function validate(value) {
    object(value, '配置');
    if (value.version !== 1) throw new Error('只支持 version: 1 的配置');
    const transitionMs = number(value.transitionMs, { min: 0, max: 5000 }, 'transitionMs');
    if (value.quality !== 'auto' && (!Number.isInteger(value.quality) || value.quality < 0 || value.quality > 3)) {
      throw new Error('quality 应为 auto 或 0–3 的整数');
    }
    if (!Array.isArray(value.views) || value.views.length === 0) throw new Error('配置至少需要一个视角');
    const views = value.views.map(validateView);
    const ids = new Set();
    for (const view of views) {
      if (ids.has(view.id)) throw new Error(`视角 id 重复：${view.id}`);
      ids.add(view.id);
    }
    return { version: 1, transitionMs, quality: value.quality, views };
  }
  function freeze(value) {
    for (const item of Object.values(value)) if (item && typeof item === 'object') freeze(item);
    return Object.freeze(value);
  }
  window.BlackHoleConfig = Object.freeze({ defaults: freeze(defaults), fields: freeze(fields), clone, validate, validateView });
})();

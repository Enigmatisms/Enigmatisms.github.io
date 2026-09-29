/* SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2026 Enigmatisms.
 */
(() => {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const minimumCameraRadiusRs = 1.0001;
  const phasePeriod = 2 * Math.PI * 16777523 / Math.SQRT1_2;
  const fields = {
    camera: [
      { key: 'x', label: '水平位置（0 左 / 1 右）', min: -0.5, max: 1.8, step: 0.005 },
      { key: 'y', label: '垂直位置（0 上 / 1 下）', min: -0.5, max: 1.5, step: 0.005 },
      { key: 'fov', label: '视场角 FOV（小 = 放大）', min: 5, max: 100, step: 0.1 },
      { key: 'elevation', label: '俯仰角 °', min: -85, max: 85, step: 0.1 },
      { key: 'azimuth', label: '环绕角 °', min: -180, max: 180, step: 0.5 },
      { key: 'roll', label: '画面倾斜 °', min: -90, max: 90, step: 0.1 },
      { key: 'distance', label: '相机距离', min: 0.5 * minimumCameraRadiusRs, max: 80, step: 0.01 }
    ],
    disk: [
      { key: 'horizon', label: '视界半径', min: 0.5, max: 4, step: 0.01 },
      { key: 'inner', label: '吸积盘内缘', min: 1, max: 16, step: 0.05 },
      { key: 'outer', label: '吸积盘外缘', min: 5, max: 40, step: 0.1 },
      { key: 'thickness', label: '盘厚度', min: 0.03, max: 4, step: 0.005 },
      { key: 'density', label: '体积密度', min: 0.05, max: 5, step: 0.025 },
      { key: 'turbulence', label: '湍流强度', min: 0, max: 3, step: 0.025 },
      { key: 'detail', label: '细丝强度', min: 0, max: 3, step: 0.025 },
      { key: 'roughness', label: '体积云粗糙度', min: 0, max: 1, step: 0.025, default: 0 },
      { key: 'emission', label: '盘面发光强度', min: 0.05, max: 6, step: 0.025 },
      { key: 'emissivityIndex', label: '径向发光衰减', min: 0, max: 6, step: 0.05, default: 2.4 },
      { key: 'speed', label: '播放速度（不改变气体轨道速度）', min: -3, max: 3, step: 0.025 },
      { key: 'phase', label: '演化相位（冻结帧）', min: 0, max: phasePeriod, step: 0.01 }
    ],
    appearance: [
      { key: 'exposure', label: '曝光', min: 0.001, max: 10, step: 0.005 },
      { key: 'bloom', label: '亮部光晕', min: 0, max: 4, step: 0.025 },
      { key: 'temperature', label: '色温系数', min: 0.35, max: 2, step: 0.025 },
      { key: 'gradientMidpoint', label: '渐变中点', min: 0.05, max: 0.95, step: 0.005, default: 0.64 },
      { key: 'gradientSoftness', label: '渐变宽度', min: 0.05, max: 2, step: 0.025, default: 1 },
      { key: 'clearance', label: '文字区域避让（0 关闭 / 1 开启）', min: 0, max: 1, step: 0.05 }
    ],
    background: [
      { key: 'density', label: '背景星空密度', min: 0, max: 3, step: 0.05 },
      { key: 'brightness', label: '背景星空亮度', min: 0, max: 5, step: 0.05 }
    ],
    physics: [
      { key: 'massSolar', label: '黑洞质量（太阳质量）', min: 1, max: 1e10, step: 1, default: 4e6 },
      { key: 'distanceLy', label: '距地球光年（0 表示未知）', min: 0, max: 1e10, step: 1, default: 27000 },
      { key: 'timeScale', label: '物理时间倍率', min: 1e-6, max: 1e6, step: 0.000001, default: 1 },
      { key: 'physicalTime', label: '物理时间（0 演示 / 1 物理）', min: 0, max: 1, step: 1, default: 0, toggle: true },
      { key: 'doppler', label: '多普勒频移与束射（0 关 / 1 开）', min: 0, max: 1, step: 1, default: 1, toggle: true },
      { key: 'radiation', label: '辐射模式（0 调色 / 1 热谱 / 2 幂律）', min: 0, max: 2, step: 1, default: 0, values: [0, 1, 2] },
      { key: 'spectralIndex', label: '幂律谱指数 α', min: -1, max: 3, step: 0.05, default: 1 },
      { key: 'temperatureK', label: '内缘有效色温（K）', min: 1000, max: 40000, step: 100, default: 6500 }
    ],
    colors: [
      { key: 'cold', label: '外层冷区颜色' },
      { key: 'warm', label: '中层暖区颜色' },
      { key: 'hot', label: '内层热区颜色' }
    ]
  };
  // Keep the optional v1 background fallback stable for older saved files.
  const backgroundDefaults = { density: 0.65, brightness: 0.8 };
  const physicsDefaults = Object.fromEntries(fields.physics.map(field => [field.key, field.default]));
  const material = {
    disk: { horizon: 1.33, inner: 3.6, outer: 13.5, thickness: 0.4, density: 2.85, turbulence: 1.9, detail: 1.5, roughness: 0, speed: 0.725, emission: 2.75, emissivityIndex: 2.4 },
    appearance: { exposure: 0.5, bloom: 2.4, temperature: 1.025, gradientMidpoint: 0.64, gradientSoftness: 1, clearance: 1 },
    background: { density: 1.5, brightness: 0.7 },
    physics: physicsDefaults,
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
    if (definition.toggle && value !== 0 && value !== 1) throw new Error(`${name} 必须为 0 或 1`);
    if (definition.values && !definition.values.includes(value)) throw new Error(`${name} 必须为 ${definition.values.join(' / ')}`);
    return value;
  }
  function numericGroup(value, group, name) {
    object(value, name);
    const result = {};
    for (const field of fields[group]) {
      const input = value[field.key] === undefined ? field.default : value[field.key];
      result[field.key] = number(input, field, `${name}.${field.key}`);
    }
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
    const physics = numericGroup(
      Object.prototype.hasOwnProperty.call(value, 'physics') ? value.physics : physicsDefaults,
      'physics', 'physics'
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
    if (desktop.distance < disk.horizon * minimumCameraRadiusRs || mobile.distance < disk.horizon * minimumCameraRadiusRs) throw new Error(`相机必须位于视界之外（距离至少 ${minimumCameraRadiusRs} rₛ）`);
    return { id: value.id, label: value.label.trim(), camera: { desktop, mobile }, disk, appearance, background, physics, colors };
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
  window.BlackHoleConfig = Object.freeze({ defaults: freeze(defaults), fields: freeze(fields), phasePeriod, minimumCameraRadiusRs, clone, validate, validateView });
})();

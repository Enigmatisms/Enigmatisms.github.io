/* SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2026 Enigmatisms.
 */
(() => {
  'use strict';
  const Renderer = window.BlackHoleRenderer;
  const Config = window.BlackHoleConfig;
  if (!Renderer || !Config) return;
  const files = ['view-1.json', 'view-2.json', 'view-3.json', 'view-4.json', 'view-1-blue.json'];
  const labels = ['视角 1', '视角 2', '视角 3', '视角 4', '蓝色彩蛋'];
  async function loadCuration() {
    try {
      const payloads = await Promise.all(files.map(async file => {
        const response = await fetch(new URL(`black-hole-views/${file}`, document.baseURI), { cache: 'no-store' });
        if (!response.ok) throw new Error(`${file}: ${response.status}`);
        return response.json();
      }));
      const views = payloads.map((payload, index) => {
        const view = Config.clone(payload.view || payload);
        view.id = index === files.length - 1 ? 'view-1-blue' : `view-${index + 1}`;
        view.label = labels[index];
        return Config.validateView(view);
      });
      const next = Renderer.getConfig();
      next.transitionMs = Math.max(1400, ...payloads.map(payload => Number(payload.transitionMs) || 0));
      next.views = views;
      Renderer.setConfig(Config.validate(next), { transition: true });
      dispatchEvent(new CustomEvent('blackhole:curation-ready', { detail: { views: views.length } }));
    } catch (error) {
      console.warn('Homepage curation unavailable; using built-in defaults:', error.message);
    }
  }
  loadCuration();
})();

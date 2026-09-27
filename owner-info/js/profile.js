(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const connection = navigator.connection;

  // Scroll-induced boundary events are not a request to download a preview.
  // A real mouse move clears this guard, including when it stays inside a row.
  let scrollOnly = false;
  let mouseX = null;
  let mouseY = null;
  let mouseMoved = false;
  window.addEventListener('scroll', () => { scrollOnly = true; }, { passive: true });
  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    mouseMoved = event.clientX !== mouseX || event.clientY !== mouseY;
    mouseX = event.clientX;
    mouseY = event.clientY;
    if (mouseMoved) scrollOnly = false;
  }, { capture: true, passive: true });

  const previews = [];

  function updateControl(preview) {
    const action = preview.mode ? 'Pause' : 'Play';
    preview.button.textContent = `${action} preview`;
    preview.button.setAttribute('aria-label', `${action} preview: ${preview.title}`);
    preview.button.setAttribute('aria-pressed', String(Boolean(preview.mode)));
  }

  function pause(preview) {
    preview.mode = null;
    preview.request += 1;
    preview.video.pause();
    preview.container.classList.remove('is-playing');
    preview.status.textContent = '';
    updateControl(preview);
  }

  async function play(preview, mode) {
    if (document.hidden || preview.mode) return;
    for (const other of previews) {
      if (other !== preview && other.mode) pause(other);
    }
    preview.mode = mode;
    const request = ++preview.request;
    preview.status.textContent = '';
    updateControl(preview);
    const video = preview.video;
    if (!preview.loaded) {
      // Neither the browser's preload heuristic nor scrolling can request a video.
      // The source is attached only after a deliberate hover or button action.
      video.poster = video.dataset.poster;
      for (const source of video.querySelectorAll('source[data-src]')) {
        source.src = source.dataset.src;
      }
      video.muted = true;
      preview.loaded = true;
      video.load();
    }
    try {
      await video.play();
      // An earlier request must not pause a newer request for this same video.
      if (!preview.mode || document.hidden) video.pause();
    } catch (_) {
      if (request !== preview.request) return;
      pause(preview);
      preview.status.textContent = 'Preview could not play. You can retry or follow the project links.';
    }
  }

  for (const container of document.querySelectorAll('[data-preview]')) {
    const video = container.querySelector('video');
    const button = container.querySelector('.preview-toggle');
    if (!video || !button) continue;
    const row = container.closest('article.portfolio-item');
    const preview = {
      container,
      row,
      video,
      button,
      status: container.querySelector('.preview-status'),
      title: row.querySelector('h3').textContent.trim().replace(/\s+/g, ' '),
      loaded: false,
      mode: null,
      request: 0,
      suppressHover: false
    };
    previews.push(preview);
    button.hidden = false;
    updateControl(preview);
    button.addEventListener('click', () => {
      if (preview.mode) {
        preview.suppressHover = true;
        pause(preview);
      } else {
        play(preview, 'explicit');
      }
    });
    function hover(event) {
      if (event.pointerType !== 'mouse' || !finePointer.matches || reducedMotion.matches || connection?.saveData || scrollOnly || preview.suppressHover || preview.mode) return;
      play(preview, 'hover');
    }
    row.addEventListener('pointerenter', hover);
    row.addEventListener('pointermove', event => {
      if (mouseMoved) hover(event);
    }, { passive: true });
    row.addEventListener('pointerleave', event => {
      if (event.pointerType !== 'mouse') return;
      preview.suppressHover = false;
      if (preview.mode) pause(preview);
    });
    video.addEventListener('playing', () => {
      if (!preview.mode || document.hidden) {
        pause(preview);
        return;
      }
      container.classList.add('is-playing');
    });
    // pause() owns state. Native pause events are queued and can belong to a
    // cancelled request; letting them clear mode would cancel a rapid re-entry.
    video.addEventListener('error', () => {
      pause(preview);
      preview.status.textContent = 'Preview unavailable. The project links are still available.';
    });
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) continue;
        const preview = previews.find(item => item.row === entry.target);
        if (preview?.mode) pause(preview);
      }
    }, { threshold: 0 });
    for (const preview of previews) observer.observe(preview.row);
  } else {
    window.addEventListener('scroll', () => {
      for (const preview of previews) {
        if (!preview.mode) continue;
        const bounds = preview.row.getBoundingClientRect();
        if (bounds.bottom <= 0 || bounds.top >= window.innerHeight || bounds.right <= 0 || bounds.left >= window.innerWidth) pause(preview);
      }
    }, { passive: true });
  }

  function pauseAll() {
    for (const preview of previews) {
      if (preview.mode) pause(preview);
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseAll();
  });
  window.addEventListener('pagehide', pauseAll);
  function respectPreferences() {
    if (!reducedMotion.matches && !connection?.saveData && finePointer.matches) return;
    for (const preview of previews) {
      if (preview.mode === 'hover') pause(preview);
    }
  }
  reducedMotion.addEventListener('change', respectPreferences);
  finePointer.addEventListener('change', respectPreferences);
  connection?.addEventListener('change', respectPreferences);
})();

(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const connection = navigator.connection;

  const root = document.documentElement;
  const themeToggle = document.querySelector('#theme-toggle');
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const THEME_KEY = 'owner-info-theme';
  let targetTheme = root.dataset.theme === 'dark' ? 'dark' : 'light';
  let themeTransition = null;

  function savedTheme() {
    try {
      const theme = localStorage.getItem(THEME_KEY);
      return theme === 'dark' || theme === 'light' ? theme : null;
    } catch {
      return null;
    }
  }

  function applyTheme(theme, persist) {
    const dark = theme === 'dark';
    root.dataset.theme = dark ? 'dark' : 'light';
    themeColor?.setAttribute('content', dark ? '#07050c' : '#ffffff');
    if (themeToggle) {
      const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
      themeToggle.setAttribute('aria-label', label);
      themeToggle.setAttribute('aria-pressed', String(dark));
      themeToggle.title = label;
    }
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
      } catch {
        // Storage can be disabled without disabling theme switching.
      }
    }
  }

  function clearThemeTransitionState() {
    delete root.dataset.themeTransition;
    root.style.removeProperty('--theme-origin-x');
    root.style.removeProperty('--theme-origin-y');
    root.style.removeProperty('--theme-radius');
  }

  function cancelThemeTransition() {
    const transition = themeTransition;
    themeTransition = null;
    try {
      transition?.skipTransition();
    } catch {
      // A completed transition is already detached.
    }
  }

  function switchTheme(theme, persist) {
    const expanding = theme === 'dark';
    const update = () => applyTheme(theme, persist);
    cancelThemeTransition();
    clearThemeTransitionState();
    if (reducedMotion.matches || !document.startViewTransition || !themeToggle) {
      update();
      return;
    }

    const bounds = themeToggle.getBoundingClientRect();
    const x = bounds.left + bounds.width / 2;
    const y = bounds.top + bounds.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.style.setProperty('--theme-origin-x', `${x}px`);
    root.style.setProperty('--theme-origin-y', `${y}px`);
    root.style.setProperty('--theme-radius', `${radius}px`);
    root.dataset.themeTransition = expanding ? 'expand' : 'contract';

    let transition;
    try {
      // CSS owns the pseudo-element animation, so its state is destroyed with
      // the View Transition tree and cannot leak into a later theme switch.
      transition = document.startViewTransition(update);
    } catch {
      clearThemeTransitionState();
      update();
      return;
    }
    themeTransition = transition;
    transition.ready.catch(() => {});
    transition.updateCallbackDone.catch(() => {});
    transition.finished.catch(() => {}).finally(() => {
      if (themeTransition !== transition) return;
      themeTransition = null;
      clearThemeTransitionState();
    });
  }

  applyTheme(targetTheme, false);
  themeToggle?.addEventListener('click', () => {
    targetTheme = targetTheme === 'dark' ? 'light' : 'dark';
    switchTheme(targetTheme, true);
  });
  systemDark.addEventListener('change', event => {
    if (savedTheme()) return;
    targetTheme = event.matches ? 'dark' : 'light';
    switchTheme(targetTheme, false);
  });

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

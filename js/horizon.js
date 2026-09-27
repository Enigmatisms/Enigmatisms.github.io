(() => {
  'use strict';
  const root = document.documentElement;
  const base = document.body.dataset.root || '/';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const themeButton = document.getElementById('theme-toggle');
  const systemTheme = matchMedia('(prefers-color-scheme: dark)');
  function storedTheme() {
    try { return localStorage.getItem('eh-theme'); } catch (_) { return null; }
  }
  function setTheme(theme) {
    root.dataset.theme = theme === 'dark' ? 'dark' : 'light';
    if (themeButton) {
      themeButton.hidden = false;
      themeButton.setAttribute('aria-label', theme === 'dark' ? '切换浅色模式' : '切换深色模式');
      themeButton.setAttribute('aria-pressed', String(theme === 'dark'));
    }
    const comments = document.querySelector('.utterances-frame');
    if (comments) comments.contentWindow.postMessage({ type: 'set-theme', theme: theme === 'dark' ? 'github-dark' : 'github-light' }, 'https://utteranc.es');
  }
  setTheme(storedTheme() || (systemTheme.matches ? 'dark' : 'light'));
  themeButton?.addEventListener('click', () => {
    const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('eh-theme', theme); } catch (_) { /* Preference is optional. */ }
    setTheme(theme);
  });
  const onSystemTheme = () => { if (!storedTheme()) setTheme(systemTheme.matches ? 'dark' : 'light'); };
  if (systemTheme.addEventListener) systemTheme.addEventListener('change', onSystemTheme);
  else systemTheme.addListener(onSystemTheme);
  addEventListener('storage', event => { if (event.key === 'eh-theme') setTheme(event.newValue || (systemTheme.matches ? 'dark' : 'light')); });

  // Native dialog supplies focus trapping and Escape; no search bytes until intent.
  const dialog = document.querySelector('.search-dialog');
  const input = document.getElementById('search-input');
  const results = dialog?.querySelector('.search-results');
  const status = dialog?.querySelector('.search-status');
  let searchData;
  let loadingSearch;
  let searchTimer;
  let searchOpener;
  const normalize = text => text.normalize('NFKC').toLocaleLowerCase();
  async function loadSearch() {
    if (searchData) return searchData;
    if (!loadingSearch) {
      loadingSearch = fetch(dialog.dataset.searchUrl).then(response => {
        if (!response.ok) throw new Error('Search index unavailable');
        return response.json();
      }).then(posts => {
        searchData = posts.map(post => ({ ...post, searchable: normalize(`${post.title} ${post.tags} ${post.content}`), titleSearch: normalize(post.title) }));
        return searchData;
      }).catch(error => { loadingSearch = null; throw error; });
    }
    return loadingSearch;
  }
  async function search() {
    const query = input.value.trim();
    results.replaceChildren();
    if (!query) { status.textContent = '输入关键词搜索文章。'; return; }
    status.textContent = '正在搜索…';
    try {
      const posts = await loadSearch();
      if (input.value.trim() !== query || !dialog.open) return;
      const terms = normalize(query).split(/\s+/).filter(Boolean);
      const matches = posts.filter(post => terms.every(term => post.searchable.includes(term)))
        .sort((a, b) => Number(terms.every(term => b.titleSearch.includes(term))) - Number(terms.every(term => a.titleSearch.includes(term))));
      status.textContent = matches.length ? `找到 ${matches.length} 篇笔记${matches.length > 30 ? '，显示前 30 篇；可增加关键词缩小范围' : ''}` : '没有找到相关笔记。试试其他关键词，或浏览归档。';
      const fragment = document.createDocumentFragment();
      for (const post of matches.slice(0, 30)) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = post.url;
        const title = document.createElement('h3');
        title.textContent = post.title;
        const excerpt = document.createElement('p');
        const match = normalize(post.content).indexOf(terms[0]);
        const start = Math.max(0, match - 32);
        excerpt.textContent = `${start ? '…' : ''}${post.content.slice(start, start + 135)}${post.content.length > start + 135 ? '…' : ''}`;
        const meta = document.createElement('small');
        meta.textContent = `${post.date} / ${post.tags}`;
        link.append(title, excerpt, meta);
        item.append(link);
        fragment.append(item);
      }
      results.replaceChildren(fragment);
    } catch (_) {
      status.textContent = '搜索索引暂时无法读取。请重新输入以重试，或使用下方归档链接。';
    }
  }
  function openSearch(opener) {
    if (!dialog || typeof dialog.showModal !== 'function') return;
    if (!dialog.open) {
      searchOpener = opener || document.activeElement;
      dialog.showModal();
    }
    input.focus();
    search();
  }
  if (dialog && typeof dialog.showModal === 'function') {
    document.querySelectorAll('[data-search-open]').forEach(button => {
      button.hidden = false;
      button.addEventListener('click', () => openSearch(button));
    });
    dialog.querySelector('[data-search-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { clearTimeout(searchTimer); searchOpener?.focus(); });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    input.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(search, 120); });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); results.querySelector('a')?.focus(); }
    });
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (dialog.open) dialog.close(); else openSearch();
      }
    });
  }

  const body = document.getElementById('article-body');
  const backTop = document.querySelector('.back-top');
  const progress = document.querySelector('.reading-progress span');
  const header = document.querySelector('.site-header');
  let scrollQueued = false;
  function updateScroll() {
    scrollQueued = false;
    if (backTop) backTop.hidden = scrollY < 600;
    header?.classList.toggle('is-scrolled', scrollY > 24);
    if (!body || !progress) return;
    const start = body.getBoundingClientRect().top + scrollY - 140;
    const distance = Math.max(1, body.offsetHeight - innerHeight + 140);
    progress.style.transform = `scaleX(${Math.min(1, Math.max(0, (scrollY - start) / distance))})`;
  }
  addEventListener('scroll', () => {
    if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(updateScroll); }
  }, { passive: true });
  addEventListener('resize', updateScroll, { passive: true });
  updateScroll();

  async function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return; } catch (_) { /* Try the browser's selection fallback. */ }
    }
    const field = document.createElement('textarea');
    field.value = text;
    field.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    if (!copied) throw new Error('Clipboard unavailable');
  }

  document.querySelectorAll('.post-body table:not(.highlight table)').forEach(table => {
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', '可横向滚动的数据表格');
    table.before(wrapper);
    wrapper.append(table);
  });
  document.querySelectorAll('.post-body pre:not(.mermaid)').forEach(pre => {
    if (pre.closest('.gutter')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'code-wrap';
    pre.before(wrapper);
    wrapper.append(pre);
    const button = document.createElement('button');
    button.className = 'copy-code';
    button.type = 'button';
    button.textContent = '复制代码';
    button.addEventListener('click', async () => {
      try { await copy(pre.innerText); button.textContent = '已复制'; }
      catch (_) { button.textContent = '请选中代码复制'; }
      setTimeout(() => { button.textContent = '复制代码'; }, 2000);
    });
    wrapper.append(button);
  });

  // Preserve NexT's authored tab syntax while adding touch and keyboard semantics.
  document.querySelectorAll('.post-body .tabs').forEach((group, groupIndex) => {
    const links = [...group.querySelectorAll(':scope > .nav-tabs a')];
    const panels = [...group.querySelectorAll(':scope > .tab-content > .tab-pane')];
    if (links.length !== panels.length || !links.length) return;
    group.dataset.enhanced = '';
    group.querySelector('.nav-tabs').setAttribute('role', 'tablist');
    function activate(index, focus) {
      links.forEach((link, i) => {
        const active = i === index;
        link.parentElement.classList.toggle('active', active);
        panels[i].classList.toggle('active', active);
        link.setAttribute('aria-selected', String(active));
        link.tabIndex = active ? 0 : -1;
      });
      if (focus) links[index].focus();
    }
    links.forEach((link, i) => {
      const panel = panels[i];
      if (document.getElementById(panel.id) !== panel) panel.id += `-${groupIndex + 1}`;
      link.id = `article-tab-${groupIndex}-${i}`;
      link.href = `#${panel.id}`;
      link.setAttribute('role', 'tab');
      link.setAttribute('aria-controls', panel.id);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', link.id);
      link.addEventListener('click', event => { event.preventDefault(); activate(i, false); });
      link.addEventListener('keydown', event => {
        let next = i;
        if (event.key === 'ArrowRight') next = (i + 1) % links.length;
        else if (event.key === 'ArrowLeft') next = (i - 1 + links.length) % links.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = links.length - 1;
        else return;
        event.preventDefault();
        activate(next, true);
      });
    });
    const selected = panels.findIndex(panel => panel.classList.contains('active'));
    activate(Math.max(0, selected), false);
  });

  if (!body) return;
  const toc = document.querySelector('.article-toc');
  if (toc && !toc.querySelector('a')) toc.hidden = true;
  else if (toc && matchMedia('(max-width: 820px)').matches) toc.open = false;
  if (toc && 'IntersectionObserver' in window) {
    const links = [...toc.querySelectorAll('a')];
    const byId = new Map(links.map(link => [decodeURIComponent(link.hash.slice(1)), link]));
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !byId.has(entry.target.id)) continue;
        links.forEach(link => link.removeAttribute('aria-current'));
        byId.get(entry.target.id).setAttribute('aria-current', 'location');
      }
    }, { rootMargin: '-130px 0px -55% 0px' });
    body.querySelectorAll('h1[id],h2[id],h3[id]').forEach(heading => observer.observe(heading));
  }
  const articleStatus = document.getElementById('article-status');
  const copyLink = document.getElementById('copy-link');
  if (copyLink) {
    copyLink.hidden = false;
    copyLink.addEventListener('click', async () => {
      try { await copy(location.href); articleStatus.textContent = '链接已复制'; }
      catch (_) { articleStatus.textContent = '请从地址栏复制链接'; }
    });
  }
  const bookmark = document.getElementById('bookmark');
  const resume = document.getElementById('resume-reading');
  const bookmarkKey = `eh-reading:${location.pathname}`;
  let savedPosition = 0;
  try { savedPosition = Number(localStorage.getItem(bookmarkKey)) || 0; } catch (_) { /* Optional local storage. */ }
  if (resume && savedPosition > 150) {
    resume.hidden = false;
    resume.addEventListener('click', () => scrollTo({ top: savedPosition, behavior: reduced.matches ? 'instant' : 'smooth' }));
  }
  function savePosition(manual) {
    try {
      localStorage.setItem(bookmarkKey, String(Math.round(scrollY)));
      if (manual) articleStatus.textContent = '阅读位置已保存在此设备';
    } catch (_) { if (manual) articleStatus.textContent = '浏览器禁止了本地存储，无法保存'; }
  }
  if (bookmark) {
    bookmark.hidden = false;
    bookmark.addEventListener('click', () => savePosition(true));
    addEventListener('pagehide', () => savePosition(false));
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => { script.remove(); reject(new Error(`Unable to load ${src}`)); };
      document.head.append(script);
    });
  }
  if (body.querySelector('.math')) {
    window.MathJax = {
      tex: { inlineMath: [['$', '$'], ['\\(', '\\)']], tags: 'all' },
      options: { ignoreHtmlClass: 'tex2jax_ignore', processHtmlClass: 'math' },
      startup: { ready() { window.MathJax.startup.defaultReady(); window.MathJax.startup.promise.then(updateScroll); } }
    };
    loadScript(`${base}lib/mathjax/tex-chtml.js`).catch(() => {
      const note = document.createElement('p');
      note.className = 'math-status';
      note.textContent = '公式排版资源加载失败；原始公式仍可阅读，请刷新重试。';
      body.prepend(note);
    });
  }
  const diagrams = [...body.querySelectorAll('.mermaid')];
  if (diagrams.length) {
    loadScript(`${base}lib/mermaid.min.js`).then(async () => {
      window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: root.dataset.theme === 'dark' ? 'dark' : 'neutral', fontFamily: 'system-ui, sans-serif' });
      await window.mermaid.run({ nodes: diagrams });
      updateScroll();
    }).catch(() => {
      const note = document.createElement('p');
      note.className = 'diagram-status';
      note.textContent = '流程图暂时无法渲染，以下保留原始图表描述。';
      diagrams[0].before(note);
    });
  }
  const commentsButton = document.getElementById('load-comments');
  if (commentsButton) {
    commentsButton.hidden = false;
    commentsButton.addEventListener('click', () => {
      const script = document.createElement('script');
      script.src = 'https://utteranc.es/client.js';
      script.setAttribute('repo', commentsButton.dataset.repo);
      script.setAttribute('issue-term', commentsButton.dataset.issueTerm || 'pathname');
      script.setAttribute('theme', root.dataset.theme === 'dark' ? 'github-dark' : 'github-light');
      script.crossOrigin = 'anonymous';
      script.async = true;
      commentsButton.disabled = true;
      commentsButton.textContent = '正在连接 GitHub…';
      script.onload = () => { commentsButton.hidden = true; };
      script.onerror = () => { script.remove(); commentsButton.disabled = false; commentsButton.textContent = '连接失败，点击重试'; };
      document.getElementById('comments-container').append(script);
    });
  }
})();

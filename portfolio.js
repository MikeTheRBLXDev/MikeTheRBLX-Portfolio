(() => {
  'use strict';
  const grid = document.getElementById('work-list');
  const status = document.getElementById('work-status');
  const modal = document.getElementById('media-modal');
  const modalContent = document.getElementById('modal-content');
  const modalTitle = document.getElementById('modal-title');
  const closeButton = document.getElementById('modal-close');
  const videoExt = /\.(mp4|webm|ogg|mov|m4v)$/i;
  const mediaExt = /\.(png|jpe?g|gif|webp|svg|avif|mp4|webm|ogg|mov|m4v)$/i;
  const encodePath = value => value.split('/').map(encodeURIComponent).join('/');
  let items = [], current = null, opener = null, ready = false;
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function safePath(value, folder) {
    return typeof value === 'string' && value.startsWith(`assets/${folder}/`) &&
      !/[\\\x00-\x1f]/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..') && mediaExt.test(value);
  }
  function projectHash(item) { return `#project/${encodeURIComponent(item.slug)}`; }
  function projectURL(item) { const url = new URL(location.href); url.hash = projectHash(item); return url.href; }
  function imageFor(item, hero = false) {
    const img = element('img');
    img.src = item.type === 'youtube' ? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg` : encodePath(item.preview?.small || item.path);
    if (item.preview && item.type !== 'youtube') {
      img.srcset = `${encodePath(item.preview.small)} 800w, ${encodePath(item.preview.large)} 1600w`;
      img.sizes = hero ? '(max-width: 900px) 90vw, 48vw' : '(max-width: 620px) 90vw, (max-width: 1100px) 92vw, 1060px';
    }
    img.alt = item.title;
    // The showcase intentionally reserves a consistent stage for every aspect ratio.
    img.width = 1600; img.height = 900;
    img.decoding = 'async';
    img.loading = hero ? 'eager' : 'lazy';
    if (hero) img.fetchPriority = 'high';
    return img;
  }
  function makeYoutube(item) {
    const iframe = element('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${item.id}?autoplay=1&rel=0`;
    iframe.title = item.title;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    return iframe;
  }
  function openLink(link, item) {
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); opener = link;
      if (location.hash === projectHash(item)) openModal(item);
      else { location.hash = projectHash(item); }
    });
  }
  function card(item, index) {
    const article = element('article', 'work-card');
    article.id = `work-${item.slug}`;
    const top = element('div', 'project-topline');
    top.append(element('span', 'project-number', `${String(index + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`), element('span', '', item.type === 'youtube' || videoExt.test(item.path || '') ? 'UI DESIGN IN MOTION' : 'ROBLOX UI DESIGN'));
    const media = element('div', 'project-media scroll-reveal');
    let preview;
    if (item.type === 'youtube') {
      preview = element('button', 'project-preview'); preview.type = 'button';
      preview.setAttribute('aria-label', `Play ${item.title}`);
      preview.append(imageFor(item));
      const play = element('span', 'youtube-play'); play.setAttribute('aria-hidden', 'true'); play.append(element('span', '', '▶')); preview.append(play);
      preview.addEventListener('click', () => {
        const iframe = makeYoutube(item);
        preview.replaceWith(iframe);
        const caption = element('p', 'youtube-caption');
        const external = element('a', '', 'Watch on YouTube ↗'); external.href = `https://www.youtube.com/watch?v=${item.id}`; external.target = '_blank'; external.rel = 'noopener noreferrer';
        caption.append(external); media.append(caption);
        iframe.focus({preventScroll: true});
      }, {once: true});
    } else if (videoExt.test(item.path)) {
      preview = element('video', 'project-preview'); preview.src = encodePath(item.path); preview.controls = true; preview.playsInline = true; preview.preload = 'none'; preview.setAttribute('aria-label', item.title);
    } else {
      preview = element('a', 'project-preview'); preview.href = projectHash(item); preview.setAttribute('aria-label', `View full-size ${item.title}`);
      preview.append(imageFor(item));
      const action = element('span', 'preview-action', 'Full-size preview'); action.append(element('span', '', '↗')); preview.append(action); openLink(preview, item);
    }
    media.append(preview);
    const copy = element('div', 'project-copy scroll-reveal');
    const heading = element('div');
    heading.append(element('h3', '', item.title), element('p', 'project-kind', 'DESIGNED BY MIKE'));
    const detail = element('div');
    if (item.description) detail.append(element('p', '', item.description));
    const share = element('button', 'project-link', 'Copy project link'); share.type = 'button'; share.append(element('span', '', '⧉')); share.setAttribute('aria-label', `Copy link to ${item.title}`);
    share.addEventListener('click', () => window.portfolioCopy(projectURL(item), 'Project link copied', share)); detail.append(share);
    copy.append(heading, detail); article.append(top, media, copy); return article;
  }
  function setHero(item) {
    const hero = document.getElementById('hero-project');
    hero.replaceChildren();
    if (videoExt.test(item.path || '')) {
      const video = element('video'); video.src = encodePath(item.path); video.preload = 'metadata'; video.muted = true; video.playsInline = true; video.setAttribute('aria-label', item.title); hero.append(video);
    } else {
      const img = imageFor(item, true); img.id = 'hero-project-image'; hero.append(img);
    }
    const label = element('span', 'hero-preview-label', 'Take a closer look'); label.append(element('span', '', '↗')); hero.append(label);
    hero.href = projectHash(item); hero.setAttribute('aria-label', `View ${item.title}`); openLink(hero, item);
    document.getElementById('hero-project-title').textContent = item.title;
  }
  function openModal(item) {
    if (current === item && modal.open) return;
    current = item; modalTitle.textContent = item.title; modalContent.replaceChildren();
    let media;
    if (item.type === 'youtube') media = makeYoutube(item);
    else if (videoExt.test(item.path)) {
      media = element('video'); media.src = encodePath(item.path); media.controls = true; media.autoplay = true; media.playsInline = true; media.setAttribute('aria-label', item.title);
    } else { media = element('img'); media.src = encodePath(item.path); media.alt = item.title; }
    modalContent.append(media);
    const description = document.getElementById('modal-description'); description.textContent = item.description; description.hidden = !item.description;
    if (!modal.open) modal.showModal();
    closeButton.focus({preventScroll: true});
  }
  function dismiss(changeHash = true, restoreFocus = true) {
    if (!modal.open) return;
    modal.close(); current = null; modalContent.replaceChildren();
    // Keep the announcement live region outside the now-closed dialog.
    document.body.append(document.getElementById('copy-status'));
    if (changeHash) history.replaceState(null, '', '#work');
    if (restoreFocus) (opener?.isConnected ? opener : document.getElementById('work-heading')).focus({preventScroll: true});
    opener = null;
  }
  function route() {
    if (!ready) return;
    let slug;
    try {
      const hash = location.hash.slice(1);
      if (hash.startsWith('project/')) slug = decodeURIComponent(hash.slice(8));
      // Preserve previously shared UI project fragments after the single-page migration.
      else if (hash.startsWith('ui/')) slug = decodeURIComponent(hash.slice(3));
    } catch { /* Invalid URL fragments never interrupt browsing. */ }
    const item = items.find(project => project.slug === slug);
    if (item) openModal(item); else dismiss(false, false);
  }
  closeButton.addEventListener('click', () => dismiss());
  modal.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  modal.addEventListener('click', event => {
    if (event.target !== modal) return;
    const bounds = modal.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dismiss();
  });
  document.getElementById('copy-project').addEventListener('click', event => { if (current) window.portfolioCopy(projectURL(current), 'Project link copied', event.currentTarget); });
  document.getElementById('modal-contact').addEventListener('click', () => dismiss(false, false));
  window.addEventListener('hashchange', route);
  async function load() {
    try {
      const response = await fetch('portfolio.json', {cache: 'no-cache'});
      if (!response.ok) throw new Error('Portfolio unavailable');
      const data = await response.json();
      const usedSlugs = new Set();
      items = (Array.isArray(data.ui) ? data.ui : []).filter(item => item && !item.hidden && (item.type === 'youtube' ? /^[A-Za-z0-9_-]{11}$/.test(item.id || '') : item.type === 'media' && safePath(item.path, 'UI'))).map(item => {
        const title = typeof item.title === 'string' && item.title.trim() ? item.title : 'A little UI work';
        const base = typeof item.slug === 'string' && item.slug ? item.slug : item.id || title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        let slug = base, suffix = 2;
        while (usedSlugs.has(slug)) slug = `${base}-${suffix++}`;
        usedSlugs.add(slug);
        const preview = safePath(item.preview?.small, 'previews') && safePath(item.preview?.large, 'previews') ? item.preview : undefined;
        return {...item, title, slug, preview, description: typeof item.description === 'string' ? item.description : ''};
      });
      const featured = items.find(item => item.featured) || items[0];
      if (featured) {
        setHero(featured);
      } else document.querySelector('.hero-showcase').hidden = true;
      grid.replaceChildren(...items.map(card));
      document.querySelectorAll('.work-card h3').forEach(heading => { heading.tabIndex = -1; });
      document.getElementById('work-heading').tabIndex = -1;
      status.hidden = items.length > 0;
      status.textContent = items.length ? '' : 'Fresh work is on the way. Get in touch to see what’s possible.';
      window.portfolioObserve(grid);
      ready = true; route();
      // Gallery loading adds height above later sections. Honor direct section links afterward.
      const anchor = location.hash.slice(1) || (new URLSearchParams(location.search).get('from') === 'work' ? 'work' : '');
      if (['work', 'about', 'tos', 'contact'].includes(anchor)) requestAnimationFrame(() => document.getElementById(anchor).scrollIntoView({behavior: 'instant', block: 'start'}));
    } catch {
      status.hidden = false;
      status.textContent = 'The previews couldn’t load. Try refreshing, or get in touch below.';
      // A static featured image and all terms/contact content remain available.
      const hero = document.getElementById('hero-project'); hero.href = '#work'; hero.setAttribute('aria-label', 'See selected work');
    } finally { grid.removeAttribute('aria-busy'); }
  }
  load();
})();

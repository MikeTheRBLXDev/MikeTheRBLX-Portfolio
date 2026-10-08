(() => {
  const categories = ['scripting', 'ui'];
  const state = {category: 'scripting', manifest: {}, ready: false, item: null, opener: null};
  const grid = document.getElementById('portfolio-grid');
  const featured = document.getElementById('portfolio-featured');
  const empty = document.getElementById('portfolio-empty');
  const panel = document.getElementById('portfolio-content');
  const tabs = [...document.querySelectorAll('.portfolio-tab')];
  const modal = document.getElementById('media-modal');
  const modalContent = document.getElementById('modal-content');
  const modalActions = document.getElementById('modal-actions');
  const modalTitle = document.getElementById('modal-title');
  const closeButton = document.getElementById('modal-close');
  const imageExt = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
  const videoExt = /\.(mp4|webm|ogg|mov|m4v)$/i;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function projectHash(item) { return `#${state.category}/${encodeURIComponent(item.slug)}`; }
  function projectURL(item) {
    const url = new URL(location.href);
    url.search = '';
    url.hash = projectHash(item);
    return url.href;
  }
  function shareButton(item) {
    const button = element('button', 'button button-small', 'Copy project link');
    button.type = 'button';
    button.setAttribute('aria-label', `Copy link to ${item.title}`);
    button.addEventListener('click', () => window.portfolioCopy(projectURL(item), 'Project link copied', button));
    return button;
  }
  function preview(item, eager) {
    const link = element('a', 'project-preview');
    link.href = projectHash(item);
    link.dataset.project = item.slug;
    link.setAttribute('aria-label', `${item.type === 'youtube' || videoExt.test(item.path || '') ? 'Watch' : 'View'} ${item.title}`);
    let media;
    if (item.type === 'youtube') {
      link.classList.add('youtube-thumb');
      media = element('img', 'portfolio-media youtube-image');
      media.src = `https://i.ytimg.com/vi/${item.id}/maxresdefault.jpg`;
      media.addEventListener('error', () => {
        const fallback = `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;
        if (media.src !== fallback) media.src = fallback;
        else media.hidden = true;
      });
      const play = element('span', 'youtube-play', '▶');
      play.setAttribute('aria-hidden', 'true');
      link.append(play);
    } else if (videoExt.test(item.path)) {
      media = element('video', 'portfolio-media');
      media.src = item.path;
      media.muted = true;
      media.playsInline = true;
      media.preload = 'metadata';
      const play = element('span', 'youtube-play', '▶');
      play.setAttribute('aria-hidden', 'true');
      link.append(play);
    } else {
      media = element('img', 'portfolio-media');
      media.src = item.path;
    }
    if (media.tagName === 'IMG') {
      media.alt = item.title;
      media.loading = eager ? 'eager' : 'lazy';
      media.decoding = 'async';
    }
    link.prepend(media);
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      state.opener = link;
      location.hash = projectHash(item);
    });
    return link;
  }
  function card(item, isFeatured) {
    const article = element('article', isFeatured ? 'featured-project' : 'portfolio-card');
    const details = element('div', isFeatured ? 'featured-details' : 'project-details');
    const label = item.type === 'youtube' || videoExt.test(item.path || '') ? 'VIDEO DEMO' : 'UI DESIGN';
    details.append(element('p', 'project-kind', isFeatured ? `FEATURED ${state.category === 'ui' ? 'UI' : 'SCRIPTING'} PROJECT` : label));
    details.append(element(isFeatured ? 'h2' : 'h3', 'project-title', item.title));
    if (item.description) details.append(element('p', 'project-description', item.description));
    const actions = element('div', 'project-actions');
    const view = element('a', 'button button-small', label === 'VIDEO DEMO' ? 'Watch demo' : 'View UI');
    view.href = projectHash(item);
    view.dataset.project = item.slug;
    view.setAttribute('aria-label', `${view.textContent}: ${item.title}`);
    view.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      state.opener = view;
      location.hash = projectHash(item);
    });
    actions.append(view, shareButton(item));
    details.append(actions);
    article.append(preview(item, isFeatured), details);
    return article;
  }
  function render() {
    grid.replaceChildren();
    featured.replaceChildren();
    const items = state.manifest[state.category] || [];
    const selected = items.find(item => item.featured) || items[0];
    featured.hidden = !selected;
    empty.hidden = items.length > 0;
    if (selected) featured.append(card(selected, true));
    for (const item of items) if (item !== selected) grid.append(card(item, false));
    panel.setAttribute('aria-labelledby', `tab-${state.category}`);
    for (const tab of tabs) {
      const active = tab.dataset.category === state.category;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
  }
  function openModal(item) {
    if (state.item?.slug === item.slug && modal.open) return;
    state.item = item;
    modalTitle.textContent = item.title;
    modalContent.replaceChildren();
    modalActions.replaceChildren();
    let media;
    if (item.type === 'youtube') {
      media = element('iframe', 'youtube-frame');
      media.src = `https://www.youtube-nocookie.com/embed/${item.id}?autoplay=1&rel=0`;
      media.title = item.title;
      media.allow = 'autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen';
      media.allowFullscreen = true;
      media.referrerPolicy = 'strict-origin-when-cross-origin';
    } else if (videoExt.test(item.path)) {
      media = document.createElement('video');
      media.src = item.path;
      media.controls = true;
      media.autoplay = true;
      media.playsInline = true;
      media.setAttribute('aria-label', item.title);
    } else {
      media = document.createElement('img');
      media.src = item.path;
      media.alt = item.title;
    }
    modalContent.append(media);
    modalActions.append(shareButton(item));
    if (item.type === 'youtube') {
      const external = element('a', 'button button-small', 'Watch on YouTube ↗');
      external.href = `https://www.youtube.com/watch?v=${item.id}`;
      external.target = '_blank';
      external.rel = 'noopener noreferrer';
      modalActions.append(external);
    }
    if (!modal.open) modal.showModal();
    document.body.classList.add('modal-is-open');
    closeButton.focus({preventScroll: true});
  }
  function dismiss(updateHash = true) {
    if (!modal.open) return;
    modal.close();
    state.item = null;
    modalContent.replaceChildren();
    document.body.classList.remove('modal-is-open');
    if (updateHash) history.replaceState(null, '', `#${state.category}`);
    const target = state.opener?.isConnected ? state.opener : tabs.find(tab => tab.dataset.category === state.category);
    target?.focus({preventScroll: true});
    state.opener = null;
  }
  function route() {
    let category, slug;
    try { [category, slug] = decodeURIComponent(location.hash.slice(1)).split('/'); }
    catch { category = 'scripting'; }
    if (!categories.includes(category)) category = 'scripting';
    if (state.category !== category) {
      dismiss(false);
      state.category = category;
      if (state.ready) render();
    }
    if (!state.ready) return;
    const item = (state.manifest[category] || []).find(project => project.slug === slug);
    if (item) openModal(item);
    else dismiss(false);
  }
  closeButton.addEventListener('click', () => dismiss());
  modal.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  modal.addEventListener('click', event => {
    if (event.target !== modal) return;
    const bounds = modal.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dismiss();
  });
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => { location.hash = tab.dataset.category; });
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      tabs[next].focus();
      location.hash = tabs[next].dataset.category;
    });
  });
  window.addEventListener('hashchange', route);
  async function loadManifest() {
    panel.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('portfolio.json', {cache: 'no-cache'});
      if (!response.ok) throw new Error('Manifest unavailable');
      const data = await response.json();
      for (const category of categories) {
        const usedSlugs = new Set();
        state.manifest[category] = (Array.isArray(data[category]) ? data[category] : []).filter(item =>
          item.type === 'youtube' ? /^[A-Za-z0-9_-]{11}$/.test(item.id) :
          item.type === 'media' && typeof item.path === 'string' && item.path.startsWith(`portfolio/${category}/`) && (imageExt.test(item.path) || videoExt.test(item.path))
        ).map(item => {
          const fallback = (item.path?.split('/').pop() || 'Roblox demo').replace(/\.[^.]+$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
          const title = item.title || fallback;
          const base = item.slug || item.id || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
          let slug = base, suffix = 2;
          while (usedSlugs.has(slug)) slug = `${base}-${suffix++}`;
          usedSlugs.add(slug);
          return {...item, title, slug};
        });
      }
      state.ready = true;
      route();
      render();
    } catch {
      featured.hidden = true;
      empty.hidden = false;
      empty.querySelector('h3').textContent = 'Project previews are unavailable right now.';
      empty.querySelector('p').textContent = 'Please try again shortly, or get in touch to ask about my work.';
    } finally {
      panel.removeAttribute('aria-busy');
    }
  }
  loadManifest();
})();

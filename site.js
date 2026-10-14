(() => {
  'use strict';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motionPreference = null;
  try { motionPreference = localStorage.getItem('mike-portfolio-motion'); } catch { /* Browsing works without storage. */ }
  const motionReduced = () => motionPreference === 'off' || (motionPreference !== 'on' && reduceMotion.matches);
  const motionButton = document.getElementById('motion-toggle');
  function updateMotionControl() {
    document.documentElement.classList.toggle('motion-enabled', motionPreference === 'on');
    document.documentElement.classList.toggle('motion-disabled', motionPreference === 'off');
    motionButton.textContent = `Motion: ${motionReduced() ? 'off' : 'on'}`;
    motionButton.setAttribute('aria-pressed', String(!motionReduced()));
    motionButton.setAttribute('aria-label', `Turn animations ${motionReduced() ? 'on' : 'off'}`);
  }
  updateMotionControl();
  const status = document.getElementById('copy-status');
  let statusTimer;
  function announce(message) {
    clearTimeout(statusTimer);
    (document.querySelector('dialog[open]') || document.body).append(status);
    status.textContent = message;
    status.classList.add('visible');
    statusTimer = setTimeout(() => status.classList.remove('visible'), 3500);
  }
  async function copy(value, message = 'Copied', button) {
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        copied = true;
      }
    } catch { /* Older browsers can use the selection fallback. */ }
    if (!copied) {
      const input = document.createElement('textarea');
      input.value = value;
      input.className = 'clipboard-buffer';
      (document.querySelector('dialog[open]') || document.body).append(input);
      input.select();
      try { copied = document.execCommand('copy'); } catch { /* Offer manual copy below. */ }
      input.remove();
      button?.focus({preventScroll: true});
    }
    if (copied) { announce(message); return; }
    const dialog = document.createElement('dialog');
    dialog.className = 'copy-dialog';
    dialog.setAttribute('aria-labelledby', 'manual-copy-title');
    const heading = document.createElement('h2');
    heading.id = 'manual-copy-title';
    heading.textContent = 'Copy the text below';
    const description = document.createElement('p');
    description.textContent = 'Select the text, then copy it.';
    const input = document.createElement('textarea');
    input.value = value;
    input.readOnly = true;
    input.setAttribute('aria-label', 'Text to copy');
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'button button-primary';
    done.textContent = 'Done';
    done.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { dialog.remove(); button?.focus({preventScroll: true}); }, {once: true});
    dialog.append(heading, description, input, done);
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
    input.select();
  }
  window.portfolioCopy = copy;
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-copy]');
    if (button) copy(button.dataset.copy, button.dataset.copySuccess, button);
  });
  document.getElementById('year').textContent = String(new Date().getFullYear());

  const menu = document.querySelector('.menu-toggle');
  const nav = document.getElementById('main-nav');
  function closeMenu() {
    nav.classList.remove('is-open');
    menu.setAttribute('aria-expanded', 'false');
    menu.querySelector('span').textContent = '+';
  }
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    nav.classList.toggle('is-open', open);
    menu.setAttribute('aria-expanded', String(open));
    menu.querySelector('span').textContent = open ? '−' : '+';
  });
  nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.site-header') && menu.getAttribute('aria-expanded') === 'true') closeMenu();
  });
  window.matchMedia('(min-width: 621px)').addEventListener('change', closeMenu);

  const form = document.getElementById('brief-form');
  const result = document.getElementById('brief-result');
  const briefText = document.getElementById('brief-text');
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const fields = new FormData(form);
    const project = fields.get('project').trim();
    const details = fields.get('details').trim();
    if (!project || !details) { announce('Add your project name and a few details first.'); return; }
    briefText.textContent = `Hey Mike! I’d like to talk about a UI commission.\n\nProject: ${project}\nBudget: ${fields.get('budget').trim() || 'Let’s discuss'}\nTimeline: ${fields.get('timing').trim() || 'Flexible'}\n\n${details}`;
    result.hidden = false;
    document.getElementById('brief-result-title').focus({preventScroll: true});
    result.scrollIntoView({behavior: motionReduced() ? 'instant' : 'smooth', block: 'nearest'});
  });
  form.addEventListener('input', () => { result.hidden = true; });
  document.getElementById('copy-brief').addEventListener('click', event => copy(briefText.textContent, 'Message copied. Paste it into Discord.', event.currentTarget));

  // Read stable, unanimated wrappers so scroll transforms never feed back into measurements.
  const tracks = new Map();
  const active = new Set();
  let frame = 0;
  const clamp = value => Math.max(0, Math.min(1, value));
  function renderScroll() {
    frame = 0;
    if (motionReduced() || document.hidden) return;
    const height = window.innerHeight;
    const measurements = [...active].map(track => [track, track.getBoundingClientRect()]);
    for (const [track, bounds] of measurements) {
      const node = tracks.get(track);
      const enter = clamp((height - bounds.top) / (height * .52));
      const leave = clamp((bounds.bottom - 45) / (height * .2));
      const progress = Math.min(enter, leave);
      const ease = 1 - Math.pow(1 - progress, 3);
      const travel = node.classList.contains('project-media') ? 42 : 24;
      const y = enter < 1 ? travel * (1 - ease) : -travel * .6 * (1 - ease);
      node.style.setProperty('--reveal-opacity', (.16 + .84 * ease).toFixed(3));
      node.style.setProperty('--reveal-y', `${y.toFixed(2)}px`);
      if (node.classList.contains('project-media')) node.style.setProperty('--reveal-scale', (.975 + .025 * ease).toFixed(4));
    }
  }
  function scheduleScroll() { if (!frame && !motionReduced()) frame = requestAnimationFrame(renderScroll); }
  const revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) active.add(entry.target);
      else active.delete(entry.target);
    }
    scheduleScroll();
  }, {rootMargin: '100px 0px'});
  function observeScroll(scope = document) {
    for (const node of scope.querySelectorAll('.scroll-reveal')) {
      if (node.parentElement.classList.contains('scroll-track')) continue;
      const track = document.createElement('div');
      track.className = 'scroll-track';
      node.before(track);
      track.append(node);
      tracks.set(track, node);
      revealObserver.observe(track);
    }
    scheduleScroll();
  }
  window.portfolioObserve = observeScroll;
  observeScroll();
  window.addEventListener('scroll', scheduleScroll, {passive: true});
  window.addEventListener('resize', scheduleScroll, {passive: true});
  document.addEventListener('visibilitychange', scheduleScroll);
  function updateMotion() {
    updateMotionControl();
    if (motionReduced()) {
      for (const node of tracks.values()) for (const key of ['--reveal-y', '--reveal-scale', '--reveal-opacity']) node.style.removeProperty(key);
    } else scheduleScroll();
  }
  reduceMotion.addEventListener('change', updateMotion);
  motionButton.addEventListener('click', () => {
    motionPreference = motionReduced() ? 'on' : 'off';
    try { localStorage.setItem('mike-portfolio-motion', motionPreference); } catch { /* Optional preference only. */ }
    updateMotion();
  });

  const sections = [...document.querySelectorAll('main>section[id]')];
  let sectionFrame = 0;
  function markSection() {
    sectionFrame = 0;
    const section = [...sections].reverse().find(node => node.getBoundingClientRect().top <= window.innerHeight * .38);
    for (const link of nav.querySelectorAll('a')) {
      if (link.getAttribute('href') === `#${section?.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }
  window.addEventListener('scroll', () => {
    if (!sectionFrame) sectionFrame = requestAnimationFrame(markSection);
  }, {passive: true});
  markSection();

  const board = document.querySelector('.board-tilt');
  const floatBoard = document.querySelector('.floating-board');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let tiltFrame = 0;
  let pointer;
  board.addEventListener('pointermove', event => {
    if (motionReduced() || !finePointer.matches) return;
    pointer = {x: event.clientX, y: event.clientY};
    if (tiltFrame) return;
    tiltFrame = requestAnimationFrame(() => {
      tiltFrame = 0;
      const bounds = board.getBoundingClientRect();
      board.style.setProperty('--rx', `${((.5 - (pointer.y - bounds.top) / bounds.height) * 5).toFixed(2)}deg`);
      board.style.setProperty('--ry', `${(((pointer.x - bounds.left) / bounds.width - .5) * 5).toFixed(2)}deg`);
    });
  });
  board.addEventListener('pointerleave', () => {
    cancelAnimationFrame(tiltFrame); tiltFrame = 0;
    board.style.setProperty('--rx', '0deg'); board.style.setProperty('--ry', '0deg');
  });
  new IntersectionObserver(([entry]) => {
    floatBoard.style.animationPlayState = entry.isIntersecting ? 'running' : 'paused';
  }).observe(floatBoard);
})();

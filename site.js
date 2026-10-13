(() => {
  const status = document.getElementById('copy-status');
  let timer;
  function announce(message) {
    if (!status) return;
    clearTimeout(timer);
    (document.querySelector('dialog[open]') || document.body).append(status);
    status.textContent = message;
    status.classList.add('visible');
    timer = setTimeout(() => status.classList.remove('visible'), 4000);
  }
  function manualCopy(value) {
    const dialog = document.createElement('dialog');
    dialog.className = 'copy-dialog';
    dialog.setAttribute('aria-labelledby', 'copy-dialog-title');
    const title = document.createElement('h2'); title.id = 'copy-dialog-title'; title.textContent = 'Copy to clipboard';
    const instruction = document.createElement('p'); instruction.textContent = 'Select and copy the text below.';
    const input = document.createElement('textarea'); input.value = value; input.readOnly = true; input.setAttribute('aria-label', 'Text to copy');
    const close = document.createElement('button'); close.className = 'button'; close.type = 'button'; close.textContent = 'Done';
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove(), {once:true});
    dialog.append(title, instruction, input, close); document.body.append(dialog); dialog.showModal(); input.focus(); input.select();
  }
  async function copy(value, message, button) {
    let copied = false;
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(value); copied = true; } } catch {}
    if (!copied) {
      const textarea = document.createElement('textarea'); textarea.value = value; textarea.className = 'clipboard-buffer';
      (document.querySelector('dialog[open]') || document.body).append(textarea); textarea.select();
      try { copied = document.execCommand('copy'); } catch {}
      textarea.remove(); button?.focus({preventScroll:true});
    }
    if (copied) announce(message || 'Copied'); else manualCopy(value);
  }
  window.portfolioCopy = copy;
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-copy]');
    if (button) copy(button.dataset.copy, button.dataset.copySuccess, button);
  });
  document.getElementById('year')?.replaceChildren(String(new Date().getFullYear()));
  const page = document.body.dataset.page;
  document.querySelector(`[data-nav="${page}"]`)?.setAttribute('aria-current','page');
  const menu = document.querySelector('.menu-toggle');
  const nav = document.getElementById('main-nav');
  function closeMenu() { nav?.classList.remove('is-open'); menu?.setAttribute('aria-expanded','false'); }
  menu?.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; nav.classList.toggle('is-open', open); menu.setAttribute('aria-expanded', String(open)); });
  nav?.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); } });
  document.addEventListener('click', event => { if (menu?.getAttribute('aria-expanded') === 'true' && !event.target.closest('.site-header')) closeMenu(); });
  window.matchMedia('(min-width:621px)').addEventListener('change', closeMenu);
  const form = document.getElementById('brief-form');
  if (form) {
    const select = document.getElementById('project-service');
    const service = new URLSearchParams(location.search).get('service');
    if ([...select.options].some(option => option.value === service)) select.value = service;
    const result = document.getElementById('brief-result');
    const text = document.getElementById('brief-text');
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const fields = new FormData(form);
      const project = fields.get('project').trim(), details = fields.get('details').trim();
      if (!project || !details) { announce('Please add your project name and a few details.'); return; }
      text.textContent = `Hey Mike! I’d like to discuss a project.\n\nProject: ${project}\nService: ${select.selectedOptions[0].textContent}\nBudget: ${fields.get('budget').trim() || 'Let’s discuss'}\nTimeline: ${fields.get('timing').trim() || 'Flexible'}\n\n${details}`;
      result.hidden = false;
      document.getElementById('brief-result-title').focus({preventScroll:true});
      result.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'nearest'});
    });
    form.addEventListener('input', () => { result.hidden = true; });
    document.getElementById('copy-brief').addEventListener('click', event => copy(text.textContent, 'Message copied. Paste it into your Discord DM.', event.currentTarget));
  }
})();

(() => {
  const status = document.getElementById('copy-status');
  let timer;
  function announce(message) {
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
    const title = document.createElement('h2');
    title.id = 'copy-dialog-title';
    title.textContent = 'Copy to clipboard';
    const instruction = document.createElement('p');
    instruction.textContent = 'Select and copy the text below.';
    const input = document.createElement('input');
    input.value = value;
    input.readOnly = true;
    input.setAttribute('aria-label', 'Text to copy');
    const close = document.createElement('button');
    close.className = 'button';
    close.textContent = 'Done';
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove(), {once: true});
    dialog.append(title, instruction, input, close);
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
    input.select();
  }
  async function copy(value, message, button) {
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        copied = true;
      }
    } catch {}
    if (!copied) {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.className = 'clipboard-buffer';
      (document.querySelector('dialog[open]') || document.body).append(textarea);
      textarea.select();
      try { copied = document.execCommand('copy'); } catch {}
      textarea.remove();
      button?.focus({preventScroll: true});
    }
    if (copied) announce(message || 'Copied');
    else manualCopy(value);
  }
  window.portfolioCopy = copy;
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-copy]');
    if (button) copy(button.dataset.copy, button.dataset.copySuccess, button);
  });
  for (const link of document.querySelectorAll('[data-nav]')) {
    if (link.classList.contains('active')) link.setAttribute('aria-current', 'page');
  }
})();

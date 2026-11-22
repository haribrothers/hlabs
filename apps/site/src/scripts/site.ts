// The little the website's pages do in the browser (US-SITE-12): the theme button and Copy buttons. Nothing is sent
// anywhere; the theme is kept in this browser under Starlight's key, so the help follows it too.

const root = document.documentElement;
const systemLight = () => window.matchMedia('(prefers-color-scheme: light)').matches;

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
  button.addEventListener('click', () => {
    const now = root.dataset.theme ?? (systemLight() ? 'light' : 'dark');
    const next = now === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try {
      localStorage.setItem('starlight-theme', next);
    } catch {
      // Storage blocked: the choice lasts for this page.
    }
  });
}

// <button data-copy="text">: copies it and says "Copied" for a moment.
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  const label = button.querySelector<HTMLElement>('[data-copy-label]');
  const idle = label?.textContent ?? '';
  let timer: number | undefined;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy ?? '');
    } catch {
      return;
    }
    button.toggleAttribute('data-copied', true);
    if (label) label.textContent = 'Copied';
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      button.toggleAttribute('data-copied', false);
      if (label) label.textContent = idle;
    }, 1600);
  });
}

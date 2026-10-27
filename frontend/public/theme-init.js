// Applies the stored theme before first paint. The Content-Security-Policy
// forbids inline scripts, so this must stay an external same-origin file.
(() => {
  try {
    const stored = window.localStorage.getItem('mailquay:ui');
    const saved = stored ? JSON.parse(stored) : null;
    const theme = saved && saved.state ? saved.state.theme : undefined;
    const dark =
      theme === 'dark' ||
      (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch {
    document.documentElement.style.colorScheme = 'light';
  }
})();

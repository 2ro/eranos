// Reads the saved theme from localStorage and applies it to <html> and the
// preloader background before first paint. Runs as a blocking <script> so
// there's no flash of the wrong theme.
//
// Eranos's colors are hardcoded in src/index.css via :root {} and .dark {}
// blocks. There is no custom-theme branch; the only thing this script
// does is set the right class on <html> and paint the preloader with the
// matching background + primary color so the page doesn't flash white
// in dark mode (or vice versa) before the React bundle boots.
//
// The colors below MUST stay in sync with the values in src/index.css.
(function () {
  var builtins = {
    dark:  { bg: 'hsl(0 0% 10%)',  primary: 'hsl(24 100% 50%)' },
    light: { bg: 'hsl(0 0% 100%)', primary: 'hsl(24 100% 50%)' }
  };

  var theme = 'system';
  try {
    var cfg = JSON.parse(localStorage.getItem('nostr:app-config') || '{}');
    if (cfg.theme === 'dark' || cfg.theme === 'light' || cfg.theme === 'system') {
      theme = cfg.theme;
    }
  } catch (e) {}

  if (theme === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  var colors = builtins[theme] || builtins.dark;

  document.documentElement.className = theme;
  document.body.style.background = colors.bg;
  var p = document.getElementById('preloader');
  if (p) {
    p.style.background = colors.bg;
    var logo = p.querySelector('[data-logo]');
    if (logo) logo.style.background = colors.primary;
    var spinner = p.querySelector('[data-spinner]');
    if (spinner) {
      spinner.style.borderColor = colors.primary.replace(')', ' / 0.25)');
      spinner.style.borderTopColor = colors.primary;
    }
  }
})();

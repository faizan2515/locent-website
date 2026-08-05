/*
 * Theme switch — the web counterpart of the app's Settings > Appearance control.
 * Three states (system / light / dark); `system` follows the OS and keeps
 * following it as it changes. The chosen state is persisted so the pre-paint
 * script in each page's <head> can apply it before first render.
 *
 * Dark mode works by re-pointing the `--color-*` variables under
 * [data-theme='dark'], so nothing here touches individual elements.
 */
(function () {
  var STORAGE_KEY = 'locent-theme';
  var media = window.matchMedia('(prefers-color-scheme: dark)');

  function readPreference() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'light' || stored === 'dark' ? stored : 'system';
    } catch (e) {
      return 'system';
    }
  }

  function apply(pref) {
    var dark = pref === 'dark' || (pref === 'system' && media.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    paintButtons(pref);
  }

  function paintButtons(pref) {
    var buttons = document.querySelectorAll('[data-theme-value]');
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      var active = button.getAttribute('data-theme-value') === pref;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.classList.toggle('bg-background', active);
      button.classList.toggle('text-foreground', active);
      button.classList.toggle('shadow-sm', active);
      button.classList.toggle('text-muted', !active);
    }
  }

  function choose(pref) {
    try {
      if (pref === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, pref);
    } catch (e) {
      /* storage blocked — the choice still applies for this page view */
    }
    apply(pref);
  }

  var buttons = document.querySelectorAll('[data-theme-value]');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', function (event) {
      choose(event.currentTarget.getAttribute('data-theme-value'));
    });
  }

  /* Small screens get a single button instead of the three-way control, so it
     flips away from whatever is on screen now — which may be the system's
     choice rather than a stored one. */
  var toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      choose(dark ? 'light' : 'dark');
    });
  }

  /* Only meaningful while the preference is `system`, but harmless otherwise. */
  var onSystemChange = function () {
    if (readPreference() === 'system') apply('system');
  };
  if (media.addEventListener) media.addEventListener('change', onSystemChange);
  else media.addListener(onSystemChange);

  apply(readPreference());

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();

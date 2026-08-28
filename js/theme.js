/**
 * theme.js — Alternância persistente entre os temas escuro e claro.
 */
(function () {
  const STORAGE_KEY = 'salestrack-theme';

  function applyTheme(theme, notify) {
    const selectedTheme = theme === 'light' ? 'light' : 'dark';
    const isLight = selectedTheme === 'light';
    const root = document.documentElement;
    const toggle = document.getElementById('themeToggle');
    const mascot = document.getElementById('dashboardMascot');

    root.dataset.theme = selectedTheme;
    root.style.colorScheme = selectedTheme;
    localStorage.setItem(STORAGE_KEY, selectedTheme);

    if (toggle) {
      toggle.setAttribute('aria-pressed', String(isLight));
      toggle.setAttribute('aria-label', isLight ? 'Ativar tema escuro' : 'Ativar tema claro');
      toggle.querySelector('.theme-icon').textContent = isLight ? '☀' : '☾';
      toggle.querySelector('.theme-label').textContent = isLight ? 'Claro' : 'Escuro';
    }

    if (mascot) {
      mascot.src = isLight ? mascot.dataset.lightSrc : mascot.dataset.darkSrc;
    }

    if (notify) window.dispatchEvent(new CustomEvent('salestrack:themechange'));
  }

  function initializeTheme() {
    applyTheme(localStorage.getItem(STORAGE_KEY) || 'dark', false);
    document.getElementById('themeToggle').addEventListener('click', () => {
      const nextTheme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      applyTheme(nextTheme, true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTheme, { once: true });
  } else {
    initializeTheme();
  }
})();

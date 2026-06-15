const SECTIONS = ['dashboard', 'trips', 'map', 'about'];

function showSection(name) {
  SECTIONS.forEach(section => {
    const el = document.getElementById(section);
    if (!el) return;
    el.classList.toggle('section--active', section === name);
  });

  document.querySelectorAll('.sidebar__link').forEach(link => {
    link.classList.toggle('sidebar__link--active', link.dataset.section === name);
  });

  document.querySelectorAll('.bottomnav__link[data-section]').forEach(link => {
    link.classList.toggle('bottomnav__link--active', link.dataset.section === name);
  });

  // Leaflet needs a resize nudge if it was hidden during init
  if (name === 'map' && window.map_invalidateSize) {
    window.map_invalidateSize();
  }
}

function initNav() {
  document.querySelectorAll('.sidebar__link, .bottomnav__link[data-section]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      showSection(link.dataset.section);
    });
  });
}

// Theme toggle

// Earthy palette defaults to the light theme.
let currentTheme = 'light';

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);

  document.querySelectorAll('#theme-toggle .sidebar__icon, #theme-toggle-mobile .bottomnav__icon')
    .forEach(icon => {
      icon.textContent = theme === 'dark' ? '☾' : '☼';
    });
}

function initTheme() {
  applyTheme(currentTheme);

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  });

  document.getElementById('theme-toggle-mobile')?.addEventListener('click', () => {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initTheme();
});
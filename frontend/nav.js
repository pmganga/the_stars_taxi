const SECTIONS = ['dashboard', 'trips', 'map', 'about'];
const SECTION_STORAGE_KEY = 'nyc_mobility_active_section';

function showSection(name) {
  SECTIONS.forEach(function(section) {
    var el = document.getElementById(section);
    if (!el) return;
    el.classList.toggle('section--active', section === name);
  });

  document.querySelectorAll('.sidebar__link').forEach(function(link) {
    link.classList.toggle('sidebar__link--active', link.dataset.section === name);
  });

  document.querySelectorAll('.bottomnav__link[data-section]').forEach(function(link) {
    link.classList.toggle('bottomnav__link--active', link.dataset.section === name);
  });

  try {
    sessionStorage.setItem(SECTION_STORAGE_KEY, name);
  } catch (e) {
    // sessionStorage unavailable - section just won't survive reload
  }

  if (name === 'map' && window.map_invalidateSize) {
    window.map_invalidateSize();
  }
}

function initNav() {
  document.querySelectorAll('.sidebar__link, .bottomnav__link[data-section]').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      showSection(link.dataset.section);
    });
  });

  // restore whichever section was active before reload
  var savedSection = null;
  try {
    savedSection = sessionStorage.getItem(SECTION_STORAGE_KEY);
  } catch (e) {
    // ignore
  }
  if (savedSection && SECTIONS.indexOf(savedSection) !== -1) {
    showSection(savedSection);
  }
}

// Theme toggle with localStorage caching

var currentTheme = localStorage.getItem('nyc_mobility_theme') || 'light';

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  
  // Save to localStorage so it persists across reloads
  localStorage.setItem('nyc_mobility_theme', theme);

  // Update the theme toggle icons
  document.querySelectorAll('#theme-toggle .sidebar__icon, #theme-toggle-mobile .bottomnav__icon')
    .forEach(function(icon) {
      icon.textContent = theme === 'dark' ? '☾' : '☼';
    });
  
  console.log('Theme applied:', theme);
}

function initTheme() {
  // Load saved theme from localStorage
  var savedTheme = localStorage.getItem('nyc_mobility_theme');
  if (savedTheme) {
    currentTheme = savedTheme;
    console.log('Loaded saved theme:', currentTheme);
  } else {
    // Check system preference
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    currentTheme = prefersDark ? 'dark' : 'light';
    console.log('Using system theme preference:', currentTheme);
  }
  
  applyTheme(currentTheme);

  var themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function() {
      var newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      applyTheme(newTheme);
    });
  }

  var themeBtnMobile = document.getElementById('theme-toggle-mobile');
  if (themeBtnMobile) {
    themeBtnMobile.addEventListener('click', function() {
      var newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      applyTheme(newTheme);
    });
  }
}

// Update map theme when theme changes
function updateMapThemeFromCache() {
  var theme = localStorage.getItem('nyc_mobility_theme') || 'light';
  if (window.updateMapTheme) {
    window.updateMapTheme();
  }
}

// Listen for theme changes from other tabs/windows
window.addEventListener('storage', function(e) {
  if (e.key === 'nyc_mobility_theme') {
    console.log('Theme changed in another tab:', e.newValue);
    applyTheme(e.newValue);
    // Update map if it exists
    if (window.updateMapTheme) {
      setTimeout(window.updateMapTheme, 100);
    }
  }
});

document.addEventListener('DOMContentLoaded', function() {
  initNav();
  initTheme();
});

console.log('Nav module loaded with theme caching');
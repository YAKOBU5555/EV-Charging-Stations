/**
 * Shared chrome for every signed-in page: sidebar, topbar, toasts, socket
 * connection and small formatting helpers.
 */
const NAV = [
  { href: '/dashboard.html', icon: 'speedometer2', label: 'Dashboard' },
  { href: '/stations.html', icon: 'ev-station', label: 'Stations' },
  { href: '/chargers.html', icon: 'plug', label: 'Chargers' },
  { href: '/alerts.html', icon: 'exclamation-triangle', label: 'Alerts' },
  { href: '/sessions.html', icon: 'lightning-charge', label: 'Sessions' },
  { href: '/analytics.html', icon: 'bar-chart', label: 'Analytics' },
  { href: '/maintenance.html', icon: 'tools', label: 'Maintenance' },
  { href: '/users.html', icon: 'people', label: 'Users', roles: ['admin'] },
  { href: '/settings.html', icon: 'sliders', label: 'Thresholds', roles: ['admin'] }
];

const currentUser = JSON.parse(localStorage.getItem('ev_user') || 'null');

function requireAuth() {
  if (!localStorage.getItem('ev_token') || !currentUser) {
    location.href = '/login.html';
    return false;
  }
  return true;
}

function can(...roles) {
  return currentUser && roles.includes(currentUser.role);
}

function renderLayout(activeHref, title) {
  const links = NAV
    .filter((item) => !item.roles || item.roles.includes(currentUser.role))
    .map((item) => `<a class="nav-link ${item.href === activeHref ? 'active' : ''}" href="${item.href}">
        <i class="bi bi-${item.icon}"></i>${item.label}</a>`).join('');

  document.body.insertAdjacentHTML('afterbegin', `
    <nav class="app-sidebar" id="appSidebar" aria-label="Main">
      <div class="brand">
        <i class="bi bi-ev-station-fill fs-4"></i>
        <span>EV Charging<br>Health Monitoring</span>
      </div>
      <div class="nav-section">Monitoring</div>
      ${links}
      <div class="nav-section">Account</div>
      <a class="nav-link" href="#" id="signOutLink"><i class="bi bi-box-arrow-right"></i>Sign out</a>
    </nav>
    <div class="app-main">
      <header class="app-topbar">
        <button class="btn btn-sm btn-outline-secondary d-lg-none" id="sidebarToggle" aria-label="Toggle navigation">
          <i class="bi bi-list"></i>
        </button>
        <h1 class="h6 mb-0 flex-grow-1">${title}</h1>
        <span class="text-muted-sm d-none d-md-inline"><span class="live-dot stale" id="liveDot"></span> <span id="liveLabel">connecting…</span></span>
        <span class="badge text-bg-light border">${currentUser.name} · ${currentUser.role}</span>
      </header>
      <div class="app-content" id="appContent"></div>
    </div>
    <div class="toast-stack" id="toastStack"></div>
  `);

  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('appSidebar').classList.toggle('open');
  });
  document.getElementById('signOutLink').addEventListener('click', async (e) => {
    e.preventDefault();
    try { await api.post('/api/auth/logout'); } catch (err) { /* token may already be gone */ }
    localStorage.removeItem('ev_token');
    localStorage.removeItem('ev_user');
    location.href = '/login.html';
  });
}

/** Toast notifications. type: success | warning | danger | info */
function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${type} border-0 show`;
  el.role = 'status';
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Dismiss"></button></div>`;
  el.querySelector('button').addEventListener('click', () => el.remove());
  document.getElementById('toastStack').appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

/** Connect to the monitoring channel. Handlers: { 'charger:update': fn, ... } */
function connectSocket(handlers = {}) {
  const socket = io({ auth: { token: api.token() } });
  const dot = document.getElementById('liveDot');
  const label = document.getElementById('liveLabel');

  socket.on('connect', () => { dot.classList.remove('stale'); label.textContent = 'live'; });
  socket.on('disconnect', () => { dot.classList.add('stale'); label.textContent = 'reconnecting…'; });
  socket.on('connect_error', () => { dot.classList.add('stale'); label.textContent = 'offline'; });
  Object.entries(handlers).forEach(([event, fn]) => socket.on(event, fn));
  return socket;
}

/* ---------- formatting helpers ---------- */
const fmt = {
  slug: (value = '') => String(value).toLowerCase().replace(/[^a-z]/g, ''),
  badge(value) {
    return `<span class="badge-status st-${fmt.slug(value)}">${value || '—'}</span>`;
  },
  healthBar(score) {
    const colour = score >= 90 ? 'var(--ev-green)' : score >= 70 ? 'var(--ev-amber)' : score >= 40 ? '#e07a20' : 'var(--ev-red)';
    return `<div class="d-flex align-items-center gap-2">
      <div class="health-bar flex-grow-1" style="min-width:60px"><span style="width:${score}%;background:${colour}"></span></div>
      <small class="text-muted-sm">${score}</small></div>`;
  },
  dateTime: (value) => (value ? new Date(value).toLocaleString() : '—'),
  date: (value) => (value ? new Date(value).toLocaleDateString() : '—'),
  since(value) {
    if (!value) return '—';
    const seconds = Math.round((Date.now() - new Date(value)) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
    return `${Math.round(seconds / 86400)}d ago`;
  },
  number: (value, digits = 1) => (value === null || value === undefined ? '—' : Number(value).toFixed(digits)),
  empty(message, hint = '') {
    return `<div class="empty-state"><span class="icon"><i class="bi bi-inbox"></i></span>${message}
      ${hint ? `<div class="text-muted-sm mt-1">${hint}</div>` : ''}</div>`;
  },
  loading(rows = 3) {
    return Array.from({ length: rows }, () => '<div class="skeleton my-2"></div>').join('');
  }
};

/** Confirmation dialog backed by the browser, kept in one place. */
function confirmAction(message) {
  return window.confirm(message);
}

/** Show the simulator banner when the data on screen is generated. */
async function renderSimulatorBanner(container) {
  try {
    const { simulator } = await api.get('/api/monitoring/simulator');
    if (!simulator.running) { container.innerHTML = ''; return; }
    container.innerHTML = `<div class="simulated-banner">
      <i class="bi bi-cpu"></i>
      <span>Showing simulated telemetry — readings are generated every ${simulator.intervalMs / 1000}s, not read from hardware.</span>
      ${can('admin') ? '<button class="btn btn-sm btn-outline-dark ms-auto" id="simStop">Stop simulator</button>' : ''}
    </div>`;
    const stop = document.getElementById('simStop');
    if (stop) stop.addEventListener('click', async () => {
      await api.post('/api/monitoring/simulator/stop');
      toast('Simulator stopped', 'success');
      renderSimulatorBanner(container);
    });
  } catch (err) { container.innerHTML = ''; }
}

/* Dashboard: live stat cards, health chart, station map, recent alerts and sessions. */
if (requireAuth()) {
  renderLayout('/dashboard.html', 'Operations dashboard');

  document.getElementById('appContent').innerHTML = `
    <div id="simBanner" class="mb-3"></div>
    <div class="row g-3" id="statCards">${fmt.loading(2)}</div>

    <div class="row g-3 mt-1">
      <div class="col-lg-5">
        <div class="card h-100">
          <div class="card-header d-flex justify-content-between align-items-center">
            Charger health overview
            <small class="text-muted-sm" id="healthUpdated"></small>
          </div>
          <div class="card-body"><canvas id="healthChart" height="210"></canvas></div>
        </div>
      </div>
      <div class="col-lg-7">
        <div class="card h-100">
          <div class="card-header">Status mix across all chargers</div>
          <div class="card-body"><canvas id="statusChart" height="210"></canvas></div>
        </div>
      </div>
    </div>

    <div class="card mt-3">
      <div class="card-header d-flex justify-content-between align-items-center">
        Station health map
        <a href="/stations.html" class="text-muted-sm">Manage stations</a>
      </div>
      <div class="card-body"><div id="map"></div></div>
    </div>

    <div class="row g-3 mt-1">
      <div class="col-lg-6">
        <div class="card h-100">
          <div class="card-header d-flex justify-content-between align-items-center">
            Recent alerts <a href="/alerts.html" class="text-muted-sm">All alerts</a>
          </div>
          <div class="card-body p-0" id="recentAlerts">${fmt.loading()}</div>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="card h-100">
          <div class="card-header d-flex justify-content-between align-items-center">
            Active sessions <a href="/sessions.html" class="text-muted-sm">All sessions</a>
          </div>
          <div class="card-body p-0" id="activeSessions">${fmt.loading()}</div>
        </div>
      </div>
    </div>`;

  let healthChart;
  let statusChart;

  const CARDS = [
    { key: 'totalStations', label: 'Charging stations', icon: 'ev-station', tint: 'tint-blue' },
    { key: 'totalChargers', label: 'Charging points', icon: 'plug', tint: 'tint-blue' },
    { key: 'available', label: 'Available now', icon: 'check-circle', tint: 'tint-green' },
    { key: 'occupied', label: 'Occupied', icon: 'lightning-charge', tint: 'tint-blue' },
    { key: 'offline', label: 'Offline', icon: 'wifi-off', tint: 'tint-grey' },
    { key: 'faulty', label: 'Reporting faults', icon: 'exclamation-octagon', tint: 'tint-red' },
    { key: 'activeSessions', label: 'Active sessions', icon: 'ev-front', tint: 'tint-blue' },
    { key: 'energyToday', label: 'Energy today (kWh)', icon: 'battery-charging', tint: 'tint-green' },
    { key: 'utilisation', label: 'Average utilisation (%)', icon: 'graph-up', tint: 'tint-amber' },
    { key: 'systemHealth', label: 'System health (%)', icon: 'heart-pulse', tint: 'tint-green' }
  ];

  function renderStats(stats) {
    document.getElementById('statCards').innerHTML = CARDS.map((card) => `
      <div class="col-6 col-md-4 col-xl-2">
        <div class="card stat-card">
          <div class="stat-icon ${card.tint}"><i class="bi bi-${card.icon}"></i></div>
          <div>
            <div class="stat-value">${stats[card.key]}</div>
            <div class="stat-label">${card.label}</div>
          </div>
        </div>
      </div>`).join('');

    const breakdown = stats.healthBreakdown;
    const healthData = [breakdown.Healthy, breakdown.Warning, breakdown.Degraded, breakdown.Critical];
    const statusData = [stats.available, stats.occupied, stats.idle, stats.offline, stats.faulty, stats.maintenance];

    if (!healthChart) {
      healthChart = new Chart(document.getElementById('healthChart'), {
        type: 'doughnut',
        data: {
          labels: ['Healthy', 'Warning', 'Degraded', 'Critical'],
          datasets: [{ data: healthData, backgroundColor: ['#17a673', '#f0a020', '#e07a20', '#e0443e'], borderWidth: 0 }]
        },
        options: { plugins: { legend: { position: 'bottom' } }, cutout: '62%' }
      });
    } else {
      healthChart.data.datasets[0].data = healthData;
      healthChart.update('none');
    }

    if (!statusChart) {
      statusChart = new Chart(document.getElementById('statusChart'), {
        type: 'bar',
        data: {
          labels: ['Available', 'Charging', 'Idle', 'Offline', 'Fault', 'Maintenance'],
          datasets: [{ label: 'Chargers', data: statusData, backgroundColor: ['#17a673', '#0b63f6', '#f0a020', '#6b7686', '#e0443e', '#8b95a5'], borderRadius: 5 }]
        },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
      });
    } else {
      statusChart.data.datasets[0].data = statusData;
      statusChart.update('none');
    }
    document.getElementById('healthUpdated').textContent = `updated ${new Date().toLocaleTimeString()}`;
  }

  async function loadOverview() {
    try {
      const { stats } = await api.get('/api/monitoring/overview');
      renderStats(stats);
    } catch (err) { toast(err.message, 'danger'); }
  }

  async function loadMap() {
    const { stations } = await api.get('/api/monitoring/map');
    stationMap.render('map', stations);
  }

  async function loadAlerts() {
    const { alerts } = await api.get('/api/alerts?status=Active&limit=6');
    const box = document.getElementById('recentAlerts');
    if (!alerts.length) {
      box.innerHTML = fmt.empty('No active alerts', 'Everything is reporting within its thresholds.');
      return;
    }
    box.innerHTML = `<div class="list-group list-group-flush">${alerts.map((a) => `
      <div class="list-group-item d-flex justify-content-between align-items-start gap-2">
        <div>
          <div>${a.message}</div>
          <small class="text-muted-sm">${a.charger?.chargerId || '—'} · ${fmt.since(a.createdAt)}</small>
        </div>
        ${fmt.badge(a.severity)}
      </div>`).join('')}</div>`;
  }

  async function loadSessions() {
    const { sessions } = await api.get('/api/sessions?status=Active&limit=6');
    const box = document.getElementById('activeSessions');
    if (!sessions.length) {
      box.innerHTML = fmt.empty('No vehicles charging right now');
      return;
    }
    box.innerHTML = `<div class="list-group list-group-flush">${sessions.map((s) => `
      <div class="list-group-item d-flex justify-content-between align-items-start gap-2">
        <div>
          <div>${s.vehicleId} on ${s.charger?.chargerId || '—'}</div>
          <small class="text-muted-sm">${s.station?.name || ''} · started ${fmt.since(s.startTime)}</small>
        </div>
        <span class="text-muted-sm">${fmt.number(s.chargingPower)} kW</span>
      </div>`).join('')}</div>`;
  }

  function refreshAll() {
    loadOverview();
    loadAlerts();
    loadSessions();
  }

  // Live updates: throttle refreshes so a busy simulator cannot swamp the UI.
  let pending = false;
  const scheduleRefresh = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; refreshAll(); }, 1500);
  };

  refreshAll();
  loadMap().catch((err) => toast(err.message, 'danger'));
  renderSimulatorBanner(document.getElementById('simBanner'));

  connectSocket({
    'stats:refresh': scheduleRefresh,
    'station:update': (station) => station && stationMap.updateStation(station),
    'alert:new': (alert) => {
      toast(`${alert.severity}: ${alert.message}`, alert.severity === 'Critical' ? 'danger' : 'warning');
      loadAlerts();
    },
    'simulator:state': () => renderSimulatorBanner(document.getElementById('simBanner'))
  });
}

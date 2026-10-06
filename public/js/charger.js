/* Single charger: live readings, health breakdown, telemetry trend, alerts. */
if (requireAuth()) {
  renderLayout('/chargers.html', 'Charger detail');
  const chargerId = new URLSearchParams(location.search).get('id');

  document.getElementById('appContent').innerHTML = `
    <div id="simBanner" class="mb-3"></div>
    <div id="header" class="mb-3">${fmt.loading(2)}</div>
    <div class="row g-3" id="readings"></div>
    <div class="row g-3 mt-1">
      <div class="col-lg-8"><div class="card h-100">
        <div class="card-header">Recent telemetry</div>
        <div class="card-body"><canvas id="trend" height="200"></canvas></div>
      </div></div>
      <div class="col-lg-4"><div class="card h-100">
        <div class="card-header">Why this score</div>
        <div class="card-body" id="breakdown">${fmt.loading()}</div>
      </div></div>
    </div>
    <div class="card mt-3">
      <div class="card-header">Alerts for this charger</div>
      <div class="card-body p-0" id="alerts">${fmt.loading()}</div>
    </div>`;

  let trendChart;

  function renderReadings(charger) {
    const cells = [
      { label: 'Voltage', value: `${fmt.number(charger.voltage, 0)} V`, icon: 'lightning', tint: 'tint-blue' },
      { label: 'Current', value: `${fmt.number(charger.current, 0)} A`, icon: 'activity', tint: 'tint-blue' },
      { label: 'Power', value: `${fmt.number(charger.power)} kW`, icon: 'battery-charging', tint: 'tint-green' },
      { label: 'Temperature', value: `${fmt.number(charger.temperature)} °C`, icon: 'thermometer-half', tint: charger.temperature > 75 ? 'tint-red' : charger.temperature > 60 ? 'tint-amber' : 'tint-green' },
      { label: 'Error code', value: charger.errorCode, icon: 'exclamation-octagon', tint: charger.errorCode === 'NONE' ? 'tint-grey' : 'tint-red' },
      { label: 'Firmware', value: charger.firmwareVersion, icon: 'cpu', tint: 'tint-grey' }
    ];
    document.getElementById('readings').innerHTML = cells.map((c) => `
      <div class="col-6 col-lg-2"><div class="card stat-card">
        <div class="stat-icon ${c.tint}"><i class="bi bi-${c.icon}"></i></div>
        <div><div class="stat-value" style="font-size:19px">${c.value}</div><div class="stat-label">${c.label}</div></div>
      </div></div>`).join('');
  }

  function renderHeader(charger, health) {
    document.getElementById('header').innerHTML = `
      <div class="card"><div class="card-body d-flex flex-wrap align-items-center gap-3">
        <div>
          <h2 class="h5 mb-1">${charger.chargerId}</h2>
          <div class="text-muted-sm">${charger.connectorType} · ${charger.chargingStandard} · up to ${charger.maxPower} kW</div>
        </div>
        <div class="ms-auto d-flex align-items-center gap-3 flex-wrap">
          ${fmt.badge(charger.status)} ${fmt.badge(health.status)}
          <div style="min-width:160px">${fmt.healthBar(health.score)}</div>
          <div class="text-muted-sm">Heartbeat ${fmt.since(charger.lastHeartbeat)}</div>
        </div>
      </div></div>`;
  }

  function renderBreakdown(health) {
    const rows = Object.entries(health.components).map(([key, value]) => `
      <div class="d-flex justify-content-between align-items-center py-1">
        <span class="text-capitalize">${key.replace(/([A-Z])/g, ' $1')}</span>
        <div style="width:110px">${fmt.healthBar(Math.round(value * 100))}</div>
      </div>`).join('');
    const reasons = health.reasons.length
      ? `<ul class="text-muted-sm mt-2 mb-0 ps-3">${health.reasons.map((r) => `<li>${r}</li>`).join('')}</ul>`
      : '<p class="text-muted-sm mt-2 mb-0">Every monitored parameter is within its configured range.</p>';
    document.getElementById('breakdown').innerHTML = rows + reasons;
  }

  function renderTrend(telemetry) {
    const labels = telemetry.map((t) => new Date(t.recordedAt).toLocaleTimeString());
    const datasets = [
      { label: 'Temperature (°C)', data: telemetry.map((t) => t.temperature), borderColor: '#e0443e', tension: .3, yAxisID: 'y' },
      { label: 'Power (kW)', data: telemetry.map((t) => t.power), borderColor: '#0b63f6', tension: .3, yAxisID: 'y' },
      { label: 'Health', data: telemetry.map((t) => t.healthScore), borderColor: '#17a673', tension: .3, yAxisID: 'y1' }
    ];
    if (!trendChart) {
      trendChart = new Chart(document.getElementById('trend'), {
        type: 'line',
        data: { labels, datasets },
        options: {
          interaction: { mode: 'index', intersect: false },
          elements: { point: { radius: 0 } },
          scales: { y: { beginAtZero: true }, y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false } } }
        }
      });
    } else {
      trendChart.data.labels = labels;
      trendChart.data.datasets.forEach((d, i) => { d.data = datasets[i].data; });
      trendChart.update('none');
    }
  }

  function renderAlerts(alerts) {
    const box = document.getElementById('alerts');
    if (!alerts.length) { box.innerHTML = fmt.empty('No alerts recorded for this charger'); return; }
    box.innerHTML = `<div class="list-group list-group-flush">${alerts.map((a) => `
      <div class="list-group-item d-flex justify-content-between gap-2">
        <div>${a.message}<small class="text-muted-sm d-block">${fmt.dateTime(a.createdAt)}</small></div>
        <div class="text-end">${fmt.badge(a.severity)} ${fmt.badge(a.status)}</div>
      </div>`).join('')}</div>`;
  }

  async function load() {
    try {
      const [{ charger, health, telemetry }, detail] = await Promise.all([
        api.get(`/api/monitoring/chargers/${chargerId}?limit=60`),
        api.get(`/api/chargers/${chargerId}`)
      ]);
      renderHeader(charger, health);
      renderReadings(charger);
      renderBreakdown(health);
      renderTrend(telemetry);
      renderAlerts(detail.alerts);
    } catch (err) {
      document.getElementById('header').innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    }
  }

  if (!chargerId) {
    document.getElementById('appContent').innerHTML = fmt.empty('No charger selected', '<a href="/chargers.html">Back to the charger list</a>');
  } else {
    load();
    renderSimulatorBanner(document.getElementById('simBanner'));
    connectSocket({
      'charger:update': (update) => { if (update._id === chargerId) load(); }
    });
  }
}

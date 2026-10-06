/* Analytics: energy, utilisation, faults and station performance over a date range. */
if (requireAuth()) {
  renderLayout('/analytics.html', 'Analytics and reports');

  const today = new Date().toISOString().slice(0, 10);
  const twoWeeksAgo = new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10);

  document.getElementById('appContent').innerHTML = `
    <div class="d-flex flex-wrap gap-2 align-items-end mb-3">
      <div><label class="form-label mb-1 text-muted-sm">From</label><input id="from" type="date" class="form-control" value="${twoWeeksAgo}"></div>
      <div><label class="form-label mb-1 text-muted-sm">To</label><input id="to" type="date" class="form-control" value="${today}"></div>
      <div><label class="form-label mb-1 text-muted-sm">Group energy by</label>
        <select id="groupBy" class="form-select"><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></div>
      <button class="btn btn-primary" id="apply">Apply range</button>
    </div>

    <div class="row g-3">
      <div class="col-lg-8"><div class="card h-100">
        <div class="card-header">Energy delivered</div>
        <div class="card-body"><canvas id="energyChart" height="200"></canvas></div>
      </div></div>
      <div class="col-lg-4"><div class="card h-100">
        <div class="card-header">Alerts by severity</div>
        <div class="card-body"><canvas id="severityChart" height="200"></canvas></div>
      </div></div>
      <div class="col-lg-6"><div class="card h-100">
        <div class="card-header">Charger utilisation (top 10)</div>
        <div class="card-body"><canvas id="utilisationChart" height="220"></canvas></div>
      </div></div>
      <div class="col-lg-6"><div class="card h-100">
        <div class="card-header">Fault frequency by type</div>
        <div class="card-body"><canvas id="faultChart" height="220"></canvas></div>
      </div></div>
    </div>

    <div class="card mt-3">
      <div class="card-header">Station performance</div>
      <div class="table-responsive"><table class="table table-hover align-middle mb-0">
        <thead><tr><th>Station</th><th>Sessions</th><th>Energy (kWh)</th><th>Avg duration</th><th>Faults</th><th style="min-width:140px">Health</th></tr></thead>
        <tbody id="stationRows"><tr><td colspan="6">${fmt.loading()}</td></tr></tbody>
      </table></div>
    </div>

    <div class="card mt-3">
      <div class="card-header">Charger performance</div>
      <div class="table-responsive"><table class="table table-hover align-middle mb-0">
        <thead><tr><th>Charger</th><th>Station</th><th>Utilisation</th><th>Uptime</th><th>Downtime</th>
          <th>Avg temp</th><th>Avg power</th><th>Sessions</th></tr></thead>
        <tbody id="chargerRows"><tr><td colspan="8">${fmt.loading()}</td></tr></tbody>
      </table></div>
    </div>`;

  const charts = {};

  function upsertChart(id, config) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), config);
  }

  async function load() {
    const range = `from=${document.getElementById('from').value}&to=${document.getElementById('to').value}`;
    const groupBy = document.getElementById('groupBy').value;

    const [energy, utilisation, faults, stations] = await Promise.all([
      api.get(`/api/analytics/energy?${range}&groupBy=${groupBy}`),
      api.get(`/api/analytics/utilization?${range}`),
      api.get(`/api/analytics/faults?${range}`),
      api.get(`/api/analytics/stations?${range}`)
    ]);

    upsertChart('energyChart', {
      type: 'line',
      data: {
        labels: energy.series.map((s) => s.period),
        datasets: [{ label: 'kWh delivered', data: energy.series.map((s) => s.energy), borderColor: '#0b63f6', backgroundColor: 'rgba(11,99,246,.15)', fill: true, tension: .3 }]
      },
      options: { scales: { y: { beginAtZero: true } } }
    });

    upsertChart('severityChart', {
      type: 'doughnut',
      data: {
        labels: faults.bySeverity.map((s) => s.severity),
        datasets: [{ data: faults.bySeverity.map((s) => s.count), backgroundColor: ['#e0443e', '#f0a020', '#0b63f6'], borderWidth: 0 }]
      },
      options: { plugins: { legend: { position: 'bottom' } }, cutout: '60%' }
    });

    const top = utilisation.chargers.slice(0, 10);
    upsertChart('utilisationChart', {
      type: 'bar',
      data: { labels: top.map((c) => c.chargerId), datasets: [{ label: '% of the window spent charging', data: top.map((c) => c.utilisation), backgroundColor: '#17a673', borderRadius: 4 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, max: 100 } } }
    });

    upsertChart('faultChart', {
      type: 'bar',
      data: { labels: faults.byType.map((f) => f.type), datasets: [{ label: 'Alerts', data: faults.byType.map((f) => f.count), backgroundColor: '#e0443e', borderRadius: 4 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });

    document.getElementById('stationRows').innerHTML = stations.stations.length
      ? stations.stations.map((s) => `<tr>
          <td><strong>${s.name}</strong><small class="text-muted-sm d-block">${s.stationId}</small></td>
          <td>${s.sessions}</td><td>${fmt.number(s.energyDelivered, 2)}</td>
          <td>${s.avgDuration} min</td><td>${s.faults}</td><td>${fmt.healthBar(s.healthScore)}</td>
        </tr>`).join('')
      : `<tr><td colspan="6">${fmt.empty('No station activity in this range')}</td></tr>`;

    document.getElementById('chargerRows').innerHTML = utilisation.chargers.length
      ? utilisation.chargers.map((c) => `<tr>
          <td>${c.chargerId}</td><td>${c.station}</td><td>${c.utilisation}%</td>
          <td>${c.uptime}%</td><td>${c.downtime}%</td>
          <td>${c.avgTemperature ?? '—'} °C</td><td>${c.avgPower ?? '—'} kW</td><td>${c.sessions}</td>
        </tr>`).join('')
      : `<tr><td colspan="8">${fmt.empty('No charger telemetry in this range')}</td></tr>`;
  }

  document.getElementById('apply').addEventListener('click', () => load().catch((err) => toast(err.message, 'danger')));
  load().catch((err) => toast(err.message, 'danger'));
}

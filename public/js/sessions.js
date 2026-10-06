/* Charging sessions: live and historical, with daily charts. */
if (requireAuth()) {
  renderLayout('/sessions.html', 'Charging sessions');

  document.getElementById('appContent').innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-lg-7"><div class="card h-100">
        <div class="card-header">Sessions and energy per day</div>
        <div class="card-body"><canvas id="dailyChart" height="190"></canvas></div>
      </div></div>
      <div class="col-lg-5"><div class="card h-100">
        <div class="card-header">Average duration per day (minutes)</div>
        <div class="card-body"><canvas id="durationChart" height="190"></canvas></div>
      </div></div>
    </div>

    <div class="d-flex flex-wrap gap-2 mb-3">
      <select id="statusFilter" class="form-select" style="max-width:180px">
        <option value="">All statuses</option><option>Active</option><option>Completed</option><option>Failed</option><option>Interrupted</option>
      </select>
      <input id="from" type="date" class="form-control" style="max-width:170px">
      <input id="to" type="date" class="form-control" style="max-width:170px">
      <span class="ms-auto align-self-center text-muted-sm" id="count"></span>
    </div>

    <div class="card"><div class="table-responsive">
      <table class="table table-hover align-middle mb-0">
        <thead><tr><th>Session</th><th>Vehicle</th><th>Charger</th><th>Started</th>
          <th>Duration</th><th>Energy</th><th>Power</th><th>Status</th><th></th></tr></thead>
        <tbody id="rows"><tr><td colspan="9">${fmt.loading()}</td></tr></tbody>
      </table>
    </div></div>`;

  let dailyChart;
  let durationChart;

  async function loadCharts() {
    const { series } = await api.get('/api/analytics/energy?groupBy=day');
    const labels = series.map((s) => s.period);

    if (!dailyChart) {
      dailyChart = new Chart(document.getElementById('dailyChart'), {
        data: {
          labels,
          datasets: [
            { type: 'bar', label: 'Sessions', data: series.map((s) => s.sessions), backgroundColor: '#0b63f6', borderRadius: 4, yAxisID: 'y' },
            { type: 'line', label: 'Energy (kWh)', data: series.map((s) => s.energy), borderColor: '#17a673', backgroundColor: 'rgba(23,166,115,.15)', fill: true, tension: .3, yAxisID: 'y1' }
          ]
        },
        options: { scales: { y: { beginAtZero: true }, y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } } } }
      });
      durationChart = new Chart(document.getElementById('durationChart'), {
        type: 'line',
        data: { labels, datasets: [{ label: 'Avg duration', data: series.map((s) => s.avgDuration), borderColor: '#f0a020', backgroundColor: 'rgba(240,160,32,.18)', fill: true, tension: .3 }] },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
      });
    } else {
      [dailyChart, durationChart].forEach((c) => { c.data.labels = labels; });
      dailyChart.data.datasets[0].data = series.map((s) => s.sessions);
      dailyChart.data.datasets[1].data = series.map((s) => s.energy);
      durationChart.data.datasets[0].data = series.map((s) => s.avgDuration);
      dailyChart.update('none');
      durationChart.update('none');
    }
  }

  async function loadTable() {
    const query = new URLSearchParams();
    ['statusFilter', 'from', 'to'].forEach((id) => {
      const value = document.getElementById(id).value;
      if (value) query.set(id === 'statusFilter' ? 'status' : id, value);
    });

    const { sessions, total } = await api.get(`/api/sessions?${query}`);
    document.getElementById('count').textContent = `${total} session${total === 1 ? '' : 's'}`;
    const rows = document.getElementById('rows');

    if (!sessions.length) {
      rows.innerHTML = `<tr><td colspan="9">${fmt.empty('No sessions in this range')}</td></tr>`;
      return;
    }
    rows.innerHTML = sessions.map((s) => `
      <tr>
        <td class="text-muted-sm">${s.sessionId}</td>
        <td>${s.vehicleId}</td>
        <td>${s.charger?.chargerId || '—'}<small class="text-muted-sm d-block">${s.station?.name || ''}</small></td>
        <td class="text-muted-sm">${fmt.dateTime(s.startTime)}</td>
        <td>${s.status === 'Active' ? fmt.since(s.startTime).replace(' ago', '') : `${s.durationMinutes} min`}</td>
        <td>${fmt.number(s.energyConsumed, 2)} kWh</td>
        <td>${fmt.number(s.chargingPower)} kW</td>
        <td>${fmt.badge(s.status)}</td>
        <td class="text-end">${can('admin', 'operator') && s.status === 'Active'
          ? `<button class="btn btn-sm btn-outline-danger" data-stop="${s._id}">Stop</button>` : ''}</td>
      </tr>`).join('');
  }

  document.getElementById('rows').addEventListener('click', async (e) => {
    const stop = e.target.closest('[data-stop]');
    if (!stop) return;
    if (!confirmAction('Stop this charging session?')) return;
    try {
      await api.put(`/api/sessions/${stop.dataset.stop}/stop`, {});
      toast('Session stopped', 'success');
      loadTable();
    } catch (err) { toast(err.message, 'danger'); }
  });

  ['statusFilter', 'from', 'to'].forEach((id) =>
    document.getElementById(id).addEventListener('change', loadTable));

  loadCharts().catch((err) => toast(err.message, 'danger'));
  loadTable().catch((err) => toast(err.message, 'danger'));
  connectSocket({ 'session:started': loadTable, 'session:ended': loadTable });
}

/* Alerts: filter, acknowledge, resolve and delete. */
if (requireAuth()) {
  renderLayout('/alerts.html', 'Alerts and faults');

  document.getElementById('appContent').innerHTML = `
    <div class="d-flex flex-wrap gap-2 mb-3">
      <select id="statusFilter" class="form-select" style="max-width:180px">
        <option value="">All statuses</option><option>Active</option><option>Acknowledged</option><option>Resolved</option>
      </select>
      <select id="severityFilter" class="form-select" style="max-width:180px">
        <option value="">All severities</option><option>Critical</option><option>Warning</option><option>Information</option>
      </select>
      <input id="from" type="date" class="form-control" style="max-width:170px">
      <input id="to" type="date" class="form-control" style="max-width:170px">
      <span class="ms-auto align-self-center text-muted-sm" id="count"></span>
    </div>

    <div class="card"><div class="table-responsive">
      <table class="table table-hover align-middle mb-0">
        <thead><tr><th>Raised</th><th>Alert</th><th>Charger</th><th>Severity</th><th>Status</th><th></th></tr></thead>
        <tbody id="rows"><tr><td colspan="6">${fmt.loading()}</td></tr></tbody>
      </table>
    </div></div>`;

  async function load() {
    const query = new URLSearchParams();
    const status = document.getElementById('statusFilter').value;
    const severity = document.getElementById('severityFilter').value;
    const from = document.getElementById('from').value;
    const to = document.getElementById('to').value;
    if (status) query.set('status', status);
    if (severity) query.set('severity', severity);
    if (from) query.set('from', from);
    if (to) query.set('to', to);

    const { alerts, total } = await api.get(`/api/alerts?${query}`);
    document.getElementById('count').textContent = `${total} alert${total === 1 ? '' : 's'}`;
    const rows = document.getElementById('rows');

    if (!alerts.length) {
      rows.innerHTML = `<tr><td colspan="6">${fmt.empty('No alerts here', 'Adjust the filters or wait for new telemetry.')}</td></tr>`;
      return;
    }
    rows.innerHTML = alerts.map((a) => `
      <tr>
        <td class="text-muted-sm">${fmt.dateTime(a.createdAt)}</td>
        <td>${a.message}<small class="text-muted-sm d-block">${a.type} · ${a.station?.name || ''}</small></td>
        <td>${a.charger?.chargerId || '—'}</td>
        <td>${fmt.badge(a.severity)}</td>
        <td>${fmt.badge(a.status)}${a.acknowledgedBy ? `<small class="text-muted-sm d-block">by ${a.acknowledgedBy.name}</small>` : ''}</td>
        <td class="text-end">
          ${can('admin', 'operator') && a.status === 'Active' ? `<button class="btn btn-sm btn-outline-primary" data-ack="${a._id}">Acknowledge</button>` : ''}
          ${can('admin', 'operator') && a.status !== 'Resolved' ? `<button class="btn btn-sm btn-outline-success" data-res="${a._id}">Resolve</button>` : ''}
          ${can('admin') && a.status === 'Resolved' ? `<button class="btn btn-sm btn-outline-danger" data-del="${a._id}"><i class="bi bi-trash"></i></button>` : ''}
        </td>
      </tr>`).join('');
  }

  document.getElementById('rows').addEventListener('click', async (e) => {
    const ack = e.target.closest('[data-ack]');
    const res = e.target.closest('[data-res]');
    const del = e.target.closest('[data-del]');
    try {
      if (ack) { await api.put(`/api/alerts/${ack.dataset.ack}/acknowledge`); toast('Alert acknowledged', 'success'); }
      if (res) { await api.put(`/api/alerts/${res.dataset.res}/resolve`); toast('Alert resolved', 'success'); }
      if (del) {
        if (!confirmAction('Delete this resolved alert?')) return;
        await api.del(`/api/alerts/${del.dataset.del}`);
        toast('Alert deleted', 'success');
      }
      if (ack || res || del) load();
    } catch (err) { toast(err.message, 'danger'); }
  });

  ['statusFilter', 'severityFilter', 'from', 'to'].forEach((id) =>
    document.getElementById(id).addEventListener('change', load));

  load().catch((err) => toast(err.message, 'danger'));
  connectSocket({
    'alert:new': (a) => { toast(`${a.severity}: ${a.message}`, a.severity === 'Critical' ? 'danger' : 'warning'); load(); },
    'alert:resolved': load
  });
}

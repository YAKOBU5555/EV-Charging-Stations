/* Maintenance: schedule work, track progress, and see what is overdue. */
if (requireAuth()) {
  renderLayout('/maintenance.html', 'Maintenance');

  document.getElementById('appContent').innerHTML = `
    <div class="row g-3 mb-3" id="buckets"></div>

    <div class="d-flex flex-wrap gap-2 mb-3">
      <select id="statusFilter" class="form-select" style="max-width:190px">
        <option value="">All statuses</option><option>Scheduled</option><option>In Progress</option><option>Completed</option><option>Cancelled</option>
      </select>
      ${can('admin', 'operator') ? '<button class="btn btn-primary ms-auto" id="newRecord"><i class="bi bi-plus-lg"></i> Schedule work</button>' : ''}
    </div>

    <div class="card"><div class="table-responsive">
      <table class="table table-hover align-middle mb-0">
        <thead><tr><th>Reference</th><th>Station / charger</th><th>Type</th><th>Description</th>
          <th>Technician</th><th>Scheduled</th><th>Status</th><th></th></tr></thead>
        <tbody id="rows"><tr><td colspan="8">${fmt.loading()}</td></tr></tbody>
      </table>
    </div></div>

    <div class="modal fade" id="maintModal" tabindex="-1">
      <div class="modal-dialog"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">Schedule maintenance</h5>
          <button class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
        <div class="modal-body">
          <div id="formError" class="alert alert-danger py-2 d-none"></div>
          <div class="mb-3"><label class="form-label">Station</label><select id="f_station" class="form-select"></select></div>
          <div class="mb-3"><label class="form-label">Charger (optional)</label><select id="f_charger" class="form-select"><option value="">Whole station</option></select></div>
          <div class="mb-3"><label class="form-label">Type</label><select id="f_type" class="form-select">
            <option>Preventive</option><option>Corrective</option><option>Inspection</option><option>Firmware Upgrade</option><option>Calibration</option>
          </select></div>
          <div class="mb-3"><label class="form-label">What needs doing</label><textarea id="f_description" class="form-control" rows="2"></textarea></div>
          <div class="row g-3">
            <div class="col-6"><label class="form-label">Technician</label><input id="f_technician" class="form-control"></div>
            <div class="col-6"><label class="form-label">Scheduled date</label><input id="f_scheduledDate" type="date" class="form-control"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
          <button class="btn btn-primary" id="saveRecord">Schedule work</button>
        </div>
      </div></div>
    </div>`;

  const modal = new bootstrap.Modal(document.getElementById('maintModal'));

  async function loadOptions() {
    const { stations } = await api.get('/api/stations?limit=200');
    document.getElementById('f_station').innerHTML = stations.map((s) => `<option value="${s._id}">${s.name}</option>`).join('');
    await loadChargerOptions();
  }

  async function loadChargerOptions() {
    const stationId = document.getElementById('f_station').value;
    if (!stationId) return;
    const { chargers } = await api.get(`/api/chargers?station=${stationId}`);
    document.getElementById('f_charger').innerHTML = '<option value="">Whole station</option>'
      + chargers.map((c) => `<option value="${c._id}">${c.chargerId}</option>`).join('');
  }

  function renderBuckets(buckets) {
    const cards = [
      { label: 'Overdue', count: buckets.overdue.length, tint: 'tint-red', icon: 'exclamation-triangle' },
      { label: 'Due within 7 days', count: buckets.upcoming.length, tint: 'tint-amber', icon: 'calendar-event' },
      { label: 'Completed', count: buckets.completed.length, tint: 'tint-green', icon: 'check2-circle' }
    ];
    document.getElementById('buckets').innerHTML = cards.map((c) => `
      <div class="col-md-4"><div class="card stat-card">
        <div class="stat-icon ${c.tint}"><i class="bi bi-${c.icon}"></i></div>
        <div><div class="stat-value">${c.count}</div><div class="stat-label">${c.label}</div></div>
      </div></div>`).join('');

    if (buckets.overdue.length) {
      toast(`${buckets.overdue.length} maintenance job${buckets.overdue.length === 1 ? ' is' : 's are'} overdue`, 'warning');
    }
  }

  async function load() {
    const status = document.getElementById('statusFilter').value;
    const { maintenance, buckets } = await api.get(`/api/maintenance${status ? `?status=${encodeURIComponent(status)}` : ''}`);
    renderBuckets(buckets);

    const rows = document.getElementById('rows');
    if (!maintenance.length) {
      rows.innerHTML = `<tr><td colspan="8">${fmt.empty('Nothing scheduled', 'Schedule work to keep chargers ahead of faults.')}</td></tr>`;
      return;
    }
    const now = Date.now();
    rows.innerHTML = maintenance.map((m) => {
      const overdue = m.status !== 'Completed' && m.status !== 'Cancelled' && new Date(m.scheduledDate) < now;
      return `<tr>
        <td class="text-muted-sm">${m.maintenanceId}</td>
        <td>${m.station?.name || '—'}<small class="text-muted-sm d-block">${m.charger?.chargerId || 'whole station'}</small></td>
        <td>${m.type}</td>
        <td>${m.description}</td>
        <td>${m.technician}</td>
        <td>${fmt.date(m.scheduledDate)} ${overdue ? '<span class="badge-status st-overdue">overdue</span>' : ''}</td>
        <td>${fmt.badge(m.status)}</td>
        <td class="text-end">
          ${can('admin', 'operator') && m.status !== 'Completed' ? `<button class="btn btn-sm btn-outline-success" data-done="${m._id}">Mark done</button>` : ''}
          ${can('admin') ? `<button class="btn btn-sm btn-outline-danger" data-del="${m._id}"><i class="bi bi-trash"></i></button>` : ''}
        </td>
      </tr>`;
    }).join('');
  }

  document.getElementById('rows').addEventListener('click', async (e) => {
    const done = e.target.closest('[data-done]');
    const del = e.target.closest('[data-del]');
    try {
      if (done) { await api.put(`/api/maintenance/${done.dataset.done}`, { status: 'Completed' }); toast('Maintenance completed', 'success'); }
      if (del) {
        if (!confirmAction('Delete this maintenance record?')) return;
        await api.del(`/api/maintenance/${del.dataset.del}`);
        toast('Record deleted', 'success');
      }
      if (done || del) load();
    } catch (err) { toast(err.message, 'danger'); }
  });

  const newBtn = document.getElementById('newRecord');
  if (newBtn) newBtn.addEventListener('click', () => modal.show());
  const stationSelect = document.getElementById('f_station');
  if (stationSelect) stationSelect.addEventListener('change', loadChargerOptions);

  const saveBtn = document.getElementById('saveRecord');
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const value = (id) => document.getElementById(id).value;
    try {
      await api.post('/api/maintenance', {
        station: value('f_station'),
        charger: value('f_charger') || undefined,
        type: value('f_type'),
        description: value('f_description').trim(),
        technician: value('f_technician').trim(),
        scheduledDate: value('f_scheduledDate')
      });
      modal.hide();
      toast('Maintenance scheduled', 'success');
      load();
    } catch (err) {
      const box = document.getElementById('formError');
      box.textContent = err.details ? err.details.map((d) => d.message).join(' · ') : err.message;
      box.classList.remove('d-none');
    }
  });

  document.getElementById('statusFilter').addEventListener('change', load);
  loadOptions().catch(() => {});
  load().catch((err) => toast(err.message, 'danger'));
}

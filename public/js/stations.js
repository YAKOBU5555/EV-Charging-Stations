/* Stations: searchable table, map, and create/edit/delete for admins. */
if (requireAuth()) {
  renderLayout('/stations.html', 'Charging stations');

  document.getElementById('appContent').innerHTML = `
    <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
      <input id="search" class="form-control" style="max-width:280px" placeholder="Search name, ID or location">
      <select id="statusFilter" class="form-select" style="max-width:190px">
        <option value="">All statuses</option>
        <option>Operational</option><option>Partial</option><option>Offline</option><option>Maintenance</option>
      </select>
      ${can('admin') ? '<button class="btn btn-primary ms-auto" id="newStation"><i class="bi bi-plus-lg"></i> Add station</button>' : ''}
    </div>

    <div class="card mb-3">
      <div class="card-header">Station locations</div>
      <div class="card-body"><div id="map" class="map-panel"></div></div>
    </div>

    <div class="card">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead><tr>
            <th>Station</th><th>Location</th><th>Chargers</th><th>Status</th>
            <th style="min-width:140px">Health</th><th>Next maintenance</th><th></th>
          </tr></thead>
          <tbody id="rows"><tr><td colspan="7">${fmt.loading()}</td></tr></tbody>
        </table>
      </div>
    </div>

    <div class="modal fade" id="stationModal" tabindex="-1">
      <div class="modal-dialog modal-lg"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title" id="modalTitle">Add station</h5>
          <button class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
        <div class="modal-body">
          <div id="formError" class="alert alert-danger py-2 d-none"></div>
          <div class="row g-3">
            <div class="col-md-6"><label class="form-label">Station ID</label><input id="f_stationId" class="form-control" placeholder="STN-HYD-01"></div>
            <div class="col-md-6"><label class="form-label">Name</label><input id="f_name" class="form-control"></div>
            <div class="col-md-6"><label class="form-label">Location</label><input id="f_location" class="form-control"></div>
            <div class="col-md-6"><label class="form-label">Address</label><input id="f_address" class="form-control"></div>
            <div class="col-md-3"><label class="form-label">Latitude</label><input id="f_latitude" type="number" step="any" class="form-control"></div>
            <div class="col-md-3"><label class="form-label">Longitude</label><input id="f_longitude" type="number" step="any" class="form-control"></div>
            <div class="col-md-3"><label class="form-label">Installed on</label><input id="f_installationDate" type="date" class="form-control"></div>
            <div class="col-md-3"><label class="form-label">Next maintenance</label><input id="f_nextMaintenanceDate" type="date" class="form-control"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
          <button class="btn btn-primary" id="saveStation">Save station</button>
        </div>
      </div></div>
    </div>`;

  const modal = new bootstrap.Modal(document.getElementById('stationModal'));
  let editingId = null;

  const field = (name) => document.getElementById(`f_${name}`);

  async function load() {
    const params = new URLSearchParams();
    const search = document.getElementById('search').value.trim();
    const status = document.getElementById('statusFilter').value;
    if (search) params.set('search', search);
    if (status) params.set('status', status);

    const { stations } = await api.get(`/api/stations?${params}`);
    const rows = document.getElementById('rows');

    if (!stations.length) {
      rows.innerHTML = `<tr><td colspan="7">${fmt.empty('No stations match your filters', 'Clear the search box to see everything.')}</td></tr>`;
    } else {
      rows.innerHTML = stations.map((s) => `
        <tr>
          <td><a href="/chargers.html?station=${s._id}"><strong>${s.name}</strong></a><br><small class="text-muted-sm">${s.stationId}</small></td>
          <td>${s.location}<br><small class="text-muted-sm">${s.address || ''}</small></td>
          <td>${s.chargerStats.total || 0}
            <small class="text-muted-sm d-block">${s.chargerStats.Charging || 0} charging · ${s.chargerStats.Fault || 0} faults</small></td>
          <td>${fmt.badge(s.status)}</td>
          <td>${fmt.healthBar(s.healthScore)}</td>
          <td>${fmt.date(s.nextMaintenanceDate)}</td>
          <td class="text-end">
            ${can('admin') ? `<button class="btn btn-sm btn-outline-secondary" data-edit="${s._id}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-del="${s._id}" data-name="${s.name}"><i class="bi bi-trash"></i></button>` : ''}
          </td>
        </tr>`).join('');
    }

    const { stations: mapStations } = await api.get('/api/monitoring/map');
    stationMap.render('map', mapStations);
  }

  function openForm(station) {
    editingId = station ? station._id : null;
    document.getElementById('modalTitle').textContent = station ? 'Edit station' : 'Add station';
    document.getElementById('formError').classList.add('d-none');
    ['stationId', 'name', 'location', 'address', 'latitude', 'longitude'].forEach((key) => {
      field(key).value = station ? (station[key] ?? '') : '';
    });
    field('installationDate').value = station?.installationDate ? station.installationDate.slice(0, 10) : '';
    field('nextMaintenanceDate').value = station?.nextMaintenanceDate ? station.nextMaintenanceDate.slice(0, 10) : '';
    modal.show();
  }

  async function save() {
    const payload = {
      stationId: field('stationId').value.trim(),
      name: field('name').value.trim(),
      location: field('location').value.trim(),
      address: field('address').value.trim(),
      latitude: Number(field('latitude').value),
      longitude: Number(field('longitude').value)
    };
    if (field('installationDate').value) payload.installationDate = field('installationDate').value;
    if (field('nextMaintenanceDate').value) payload.nextMaintenanceDate = field('nextMaintenanceDate').value;

    try {
      if (editingId) await api.put(`/api/stations/${editingId}`, payload);
      else await api.post('/api/stations', payload);
      modal.hide();
      toast(editingId ? 'Station updated' : 'Station created', 'success');
      load();
    } catch (err) {
      const box = document.getElementById('formError');
      box.textContent = err.details ? err.details.map((d) => d.message).join(' · ') : err.message;
      box.classList.remove('d-none');
    }
  }

  document.getElementById('rows').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn = e.target.closest('[data-del]');
    if (editBtn) {
      const { station } = await api.get(`/api/stations/${editBtn.dataset.edit}`);
      openForm(station);
    }
    if (delBtn) {
      if (!confirmAction(`Delete ${delBtn.dataset.name} and all of its chargers?`)) return;
      await api.del(`/api/stations/${delBtn.dataset.del}`);
      toast('Station deleted', 'success');
      load();
    }
  });

  document.getElementById('saveStation').addEventListener('click', save);
  const newBtn = document.getElementById('newStation');
  if (newBtn) newBtn.addEventListener('click', () => openForm(null));

  let debounce;
  document.getElementById('search').addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(load, 300);
  });
  document.getElementById('statusFilter').addEventListener('change', load);

  load().catch((err) => toast(err.message, 'danger'));
  connectSocket({ 'station:update': (s) => s && stationMap.updateStation(s) });
}

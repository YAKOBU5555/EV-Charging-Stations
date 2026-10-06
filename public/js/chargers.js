/* Chargers: live table filtered by station, status or health. */
if (requireAuth()) {
  renderLayout('/chargers.html', 'Chargers');
  const params = new URLSearchParams(location.search);

  document.getElementById('appContent').innerHTML = `
    <div id="simBanner" class="mb-3"></div>
    <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
      <input id="search" class="form-control" style="max-width:240px" placeholder="Search charger ID">
      <select id="stationFilter" class="form-select" style="max-width:240px"><option value="">All stations</option></select>
      <select id="statusFilter" class="form-select" style="max-width:180px">
        <option value="">All statuses</option>
        <option>Available</option><option>Charging</option><option>Idle</option>
        <option>Offline</option><option>Fault</option><option>Maintenance</option>
      </select>
      <select id="healthFilter" class="form-select" style="max-width:180px">
        <option value="">All health states</option>
        <option>Healthy</option><option>Warning</option><option>Degraded</option><option>Critical</option>
      </select>
      ${can('admin') ? '<button class="btn btn-primary ms-auto" id="newCharger"><i class="bi bi-plus-lg"></i> Add charger</button>' : ''}
    </div>

    <div class="card">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead><tr>
            <th>Charger</th><th>Station</th><th>Connector</th><th>Status</th>
            <th>V / A / kW</th><th>Temp</th><th style="min-width:130px">Health</th><th>Heartbeat</th><th></th>
          </tr></thead>
          <tbody id="rows"><tr><td colspan="9">${fmt.loading()}</td></tr></tbody>
        </table>
      </div>
    </div>

    <div class="modal fade" id="chargerModal" tabindex="-1">
      <div class="modal-dialog"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">Add charger</h5>
          <button class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
        <div class="modal-body">
          <div id="formError" class="alert alert-danger py-2 d-none"></div>
          <div class="mb-3"><label class="form-label">Charger ID</label><input id="f_chargerId" class="form-control" placeholder="STN-HYD-01-C01"></div>
          <div class="mb-3"><label class="form-label">Station</label><select id="f_station" class="form-select"></select></div>
          <div class="row g-3">
            <div class="col-6"><label class="form-label">Connector</label>
              <select id="f_connectorType" class="form-select">
                <option>CCS2</option><option>CCS1</option><option>CHAdeMO</option><option>Type2</option><option>GB/T</option><option>Bharat AC-001</option>
              </select></div>
            <div class="col-6"><label class="form-label">Standard</label>
              <select id="f_chargingStandard" class="form-select">
                <option>DC Fast</option><option>Ultra Fast DC</option><option>AC Level 2</option><option>AC Level 1</option>
              </select></div>
            <div class="col-6"><label class="form-label">Max power (kW)</label><input id="f_maxPower" type="number" class="form-control" value="60"></div>
            <div class="col-6"><label class="form-label">Max current (A)</label><input id="f_maxCurrent" type="number" class="form-control" value="150"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
          <button class="btn btn-primary" id="saveCharger">Save charger</button>
        </div>
      </div></div>
    </div>`;

  const modal = new bootstrap.Modal(document.getElementById('chargerModal'));

  async function loadStations() {
    const { stations } = await api.get('/api/stations?limit=200');
    const options = stations.map((s) => `<option value="${s._id}">${s.name}</option>`).join('');
    document.getElementById('stationFilter').innerHTML = `<option value="">All stations</option>${options}`;
    const formSelect = document.getElementById('f_station');
    if (formSelect) formSelect.innerHTML = options;
    if (params.get('station')) document.getElementById('stationFilter').value = params.get('station');
  }

  async function load() {
    const query = new URLSearchParams();
    const search = document.getElementById('search').value.trim();
    if (search) query.set('search', search);
    ['station', 'status', 'health'].forEach((name) => {
      const el = document.getElementById(`${name}Filter`);
      if (el && el.value) query.set(name === 'health' ? 'healthStatus' : name, el.value);
    });

    const { chargers } = await api.get(`/api/chargers?${query}`);
    const rows = document.getElementById('rows');
    if (!chargers.length) {
      rows.innerHTML = `<tr><td colspan="9">${fmt.empty('No chargers match your filters')}</td></tr>`;
      return;
    }
    rows.innerHTML = chargers.map((c) => `
      <tr data-row="${c._id}">
        <td><a href="/charger.html?id=${c._id}"><strong>${c.chargerId}</strong></a>
          <small class="text-muted-sm d-block">${c.errorCode !== 'NONE' ? c.errorCode : 'no error'}</small></td>
        <td>${c.station?.name || '—'}</td>
        <td>${c.connectorType}<small class="text-muted-sm d-block">${c.chargingStandard} · ${c.maxPower} kW</small></td>
        <td>${fmt.badge(c.status)}</td>
        <td>${fmt.number(c.voltage, 0)} / ${fmt.number(c.current, 0)} / ${fmt.number(c.power)}</td>
        <td>${fmt.number(c.temperature)} °C</td>
        <td>${fmt.healthBar(c.healthScore)}</td>
        <td class="text-muted-sm">${fmt.since(c.lastHeartbeat)}</td>
        <td class="text-end">
          <a class="btn btn-sm btn-outline-secondary" href="/charger.html?id=${c._id}">Open</a>
          ${can('admin') ? `<button class="btn btn-sm btn-outline-danger" data-del="${c._id}" data-name="${c.chargerId}"><i class="bi bi-trash"></i></button>` : ''}
        </td>
      </tr>`).join('');
  }

  document.getElementById('rows').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (!del) return;
    if (!confirmAction(`Delete charger ${del.dataset.name}?`)) return;
    await api.del(`/api/chargers/${del.dataset.del}`);
    toast('Charger deleted', 'success');
    load();
  });

  const newBtn = document.getElementById('newCharger');
  if (newBtn) newBtn.addEventListener('click', () => modal.show());

  document.getElementById('saveCharger').addEventListener('click', async () => {
    const value = (id) => document.getElementById(id).value;
    try {
      await api.post('/api/chargers', {
        chargerId: value('f_chargerId').trim(),
        station: value('f_station'),
        connectorType: value('f_connectorType'),
        chargingStandard: value('f_chargingStandard'),
        maxPower: Number(value('f_maxPower')),
        maxCurrent: Number(value('f_maxCurrent'))
      });
      modal.hide();
      toast('Charger added', 'success');
      load();
    } catch (err) {
      const box = document.getElementById('formError');
      box.textContent = err.details ? err.details.map((d) => d.message).join(' · ') : err.message;
      box.classList.remove('d-none');
    }
  });

  let debounce;
  document.getElementById('search').addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(load, 300);
  });
  ['stationFilter', 'statusFilter', 'healthFilter'].forEach((id) =>
    document.getElementById(id).addEventListener('change', load));

  loadStations().then(load).catch((err) => toast(err.message, 'danger'));
  renderSimulatorBanner(document.getElementById('simBanner'));

  let pending = false;
  connectSocket({
    'charger:update': () => {
      if (pending) return;
      pending = true;
      setTimeout(() => { pending = false; load(); }, 2000);
    }
  });
}

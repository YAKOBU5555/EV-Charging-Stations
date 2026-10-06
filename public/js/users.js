/* User management (admin only): create, edit, disable, reset passwords, delete. */
if (requireAuth()) {
  renderLayout('/users.html', 'Users and roles');

  if (!can('admin')) {
    document.getElementById('appContent').innerHTML = fmt.empty('Only administrators can manage users',
      '<a href="/dashboard.html">Back to the dashboard</a>');
  } else {
    document.getElementById('appContent').innerHTML = `
      <div class="d-flex flex-wrap gap-2 mb-3">
        <input id="search" class="form-control" style="max-width:260px" placeholder="Search name or email">
        <select id="roleFilter" class="form-select" style="max-width:180px">
          <option value="">All roles</option><option value="admin">Admin</option><option value="operator">Operator</option><option value="viewer">Viewer</option>
        </select>
        <button class="btn btn-primary ms-auto" id="newUser"><i class="bi bi-person-plus"></i> Add user</button>
      </div>

      <div class="card"><div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Assigned stations</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead>
          <tbody id="rows"><tr><td colspan="7">${fmt.loading()}</td></tr></tbody>
        </table>
      </div></div>

      <div class="modal fade" id="userModal" tabindex="-1">
        <div class="modal-dialog"><div class="modal-content">
          <div class="modal-header"><h5 class="modal-title" id="modalTitle">Add user</h5>
            <button class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
          <div class="modal-body">
            <div id="formError" class="alert alert-danger py-2 d-none"></div>
            <div class="mb-3"><label class="form-label">Name</label><input id="f_name" class="form-control"></div>
            <div class="mb-3"><label class="form-label">Email</label><input id="f_email" type="email" class="form-control"></div>
            <div class="mb-3" id="passwordField"><label class="form-label">Password</label>
              <input id="f_password" type="password" class="form-control" placeholder="At least 8 characters"></div>
            <div class="mb-3"><label class="form-label">Role</label>
              <select id="f_role" class="form-select"><option value="viewer">Viewer</option><option value="operator">Operator</option><option value="admin">Admin</option></select></div>
            <div class="mb-1"><label class="form-label">Assigned stations <span class="text-muted-sm">(operators only see these)</span></label>
              <select id="f_stations" class="form-select" multiple size="5"></select></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
            <button class="btn btn-primary" id="saveUser">Save user</button>
          </div>
        </div></div>
      </div>`;

    const modal = new bootstrap.Modal(document.getElementById('userModal'));
    let editingId = null;

    async function loadStations() {
      const { stations } = await api.get('/api/stations?limit=200');
      document.getElementById('f_stations').innerHTML = stations.map((s) => `<option value="${s._id}">${s.name}</option>`).join('');
    }

    async function load() {
      const query = new URLSearchParams();
      const search = document.getElementById('search').value.trim();
      const role = document.getElementById('roleFilter').value;
      if (search) query.set('search', search);
      if (role) query.set('role', role);

      const { users } = await api.get(`/api/users?${query}`);
      const rows = document.getElementById('rows');
      if (!users.length) { rows.innerHTML = `<tr><td colspan="7">${fmt.empty('No users match your filters')}</td></tr>`; return; }

      rows.innerHTML = users.map((u) => `
        <tr>
          <td><strong>${u.name}</strong></td>
          <td>${u.email}</td>
          <td><span class="badge text-bg-light border text-capitalize">${u.role}</span></td>
          <td class="text-muted-sm">${u.assignedStations.map((s) => s.name).join(', ') || (u.role === 'operator' ? 'all stations' : '—')}</td>
          <td class="text-muted-sm">${u.lastLoginAt ? fmt.since(u.lastLoginAt) : 'never'}</td>
          <td>${u.isActive ? '<span class="badge-status st-active">Active</span>' : '<span class="badge-status st-offline">Disabled</span>'}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-secondary" data-edit='${JSON.stringify({ _id: u._id, name: u.name, email: u.email, role: u.role, stations: u.assignedStations.map((s) => s._id) })}'><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-secondary" data-toggle="${u._id}" data-active="${u.isActive}">${u.isActive ? 'Disable' : 'Enable'}</button>
            <button class="btn btn-sm btn-outline-secondary" data-reset="${u._id}">Reset password</button>
            <button class="btn btn-sm btn-outline-danger" data-del="${u._id}" data-name="${u.name}"><i class="bi bi-trash"></i></button>
          </td>
        </tr>`).join('');
    }

    function openForm(user) {
      editingId = user ? user._id : null;
      document.getElementById('modalTitle').textContent = user ? 'Edit user' : 'Add user';
      document.getElementById('formError').classList.add('d-none');
      document.getElementById('passwordField').style.display = user ? 'none' : 'block';
      document.getElementById('f_name').value = user?.name || '';
      document.getElementById('f_email').value = user?.email || '';
      document.getElementById('f_email').disabled = Boolean(user);
      document.getElementById('f_password').value = '';
      document.getElementById('f_role').value = user?.role || 'viewer';
      Array.from(document.getElementById('f_stations').options).forEach((option) => {
        option.selected = Boolean(user && user.stations.includes(option.value));
      });
      modal.show();
    }

    document.getElementById('rows').addEventListener('click', async (e) => {
      const edit = e.target.closest('[data-edit]');
      const toggle = e.target.closest('[data-toggle]');
      const reset = e.target.closest('[data-reset]');
      const del = e.target.closest('[data-del]');
      try {
        if (edit) openForm(JSON.parse(edit.dataset.edit));
        if (toggle) {
          await api.put(`/api/users/${toggle.dataset.toggle}`, { isActive: toggle.dataset.active !== 'true' });
          toast('User updated', 'success');
          load();
        }
        if (reset) {
          const password = prompt('New password (at least 8 characters)');
          if (!password) return;
          await api.put(`/api/users/${reset.dataset.reset}/password`, { password });
          toast('Password reset', 'success');
        }
        if (del) {
          if (!confirmAction(`Delete ${del.dataset.name}?`)) return;
          await api.del(`/api/users/${del.dataset.del}`);
          toast('User deleted', 'success');
          load();
        }
      } catch (err) { toast(err.message, 'danger'); }
    });

    document.getElementById('saveUser').addEventListener('click', async () => {
      const stations = Array.from(document.getElementById('f_stations').selectedOptions).map((o) => o.value);
      const payload = {
        name: document.getElementById('f_name').value.trim(),
        role: document.getElementById('f_role').value,
        assignedStations: stations
      };
      try {
        if (editingId) await api.put(`/api/users/${editingId}`, payload);
        else await api.post('/api/users', {
          ...payload,
          email: document.getElementById('f_email').value.trim(),
          password: document.getElementById('f_password').value
        });
        modal.hide();
        toast(editingId ? 'User updated' : 'User created', 'success');
        load();
      } catch (err) {
        const box = document.getElementById('formError');
        box.textContent = err.details ? err.details.map((d) => d.message).join(' · ') : err.message;
        box.classList.remove('d-none');
      }
    });

    document.getElementById('newUser').addEventListener('click', () => openForm(null));
    let debounce;
    document.getElementById('search').addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(load, 300);
    });
    document.getElementById('roleFilter').addEventListener('change', load);

    loadStations().catch(() => {});
    load().catch((err) => toast(err.message, 'danger'));
  }
}

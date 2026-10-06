/* Threshold and scoring configuration, plus simulator control (admin only). */
if (requireAuth()) {
  renderLayout('/settings.html', 'Health thresholds and simulator');

  if (!can('admin')) {
    document.getElementById('appContent').innerHTML = fmt.empty('Only administrators can change thresholds',
      '<a href="/dashboard.html">Back to the dashboard</a>');
  } else {
    document.getElementById('appContent').innerHTML = `
      <div class="row g-3">
        <div class="col-lg-7"><div class="card h-100">
          <div class="card-header">Thresholds</div>
          <div class="card-body">
            <div class="row g-3">
              <div class="col-md-4"><label class="form-label">Temperature warning (°C)</label><input id="t_warn" type="number" class="form-control"></div>
              <div class="col-md-4"><label class="form-label">Temperature critical (°C)</label><input id="t_crit" type="number" class="form-control"></div>
              <div class="col-md-4"><label class="form-label">Max current (A)</label><input id="c_max" type="number" class="form-control"></div>
              <div class="col-md-4"><label class="form-label">Voltage minimum (V)</label><input id="v_min" type="number" class="form-control"></div>
              <div class="col-md-4"><label class="form-label">Voltage maximum (V)</label><input id="v_max" type="number" class="form-control"></div>
              <div class="col-md-4"><label class="form-label">Voltage tolerance (V)</label><input id="v_tol" type="number" class="form-control"></div>
              <div class="col-md-4"><label class="form-label">Heartbeat warning (s)</label><input id="h_warn" type="number" class="form-control"></div>
              <div class="col-md-4"><label class="form-label">Heartbeat offline (s)</label><input id="h_off" type="number" class="form-control"></div>
              <div class="col-md-4"><label class="form-label">Maintenance reminder (days)</label><input id="m_days" type="number" class="form-control"></div>
            </div>
            <hr>
            <h2 class="h6">Health score weights</h2>
            <p class="text-muted-sm">Weights are relative; the score is normalised to 0–100.</p>
            <div class="row g-3" id="weights"></div>
            <button class="btn btn-primary mt-3" id="save">Save configuration</button>
          </div>
        </div></div>

        <div class="col-lg-5"><div class="card h-100">
          <div class="card-header">Telemetry simulator</div>
          <div class="card-body">
            <p class="text-muted-sm">With no hardware connected, the simulator produces readings for every charger and
              occasionally injects a fault so alerting can be demonstrated. Everything it writes is tagged as simulated.</p>
            <div id="simState" class="mb-3">${fmt.loading(1)}</div>
            <div class="row g-2 align-items-end">
              <div class="col-7"><label class="form-label">Interval (seconds)</label><input id="simInterval" type="number" class="form-control" value="5"></div>
              <div class="col-5 d-grid"><button class="btn btn-primary" id="simToggle">Start</button></div>
            </div>
            <div class="mt-3"><label class="form-label">Fault probability per reading</label>
              <input id="faultProb" type="number" step="0.01" min="0" max="1" class="form-control"></div>
          </div>
        </div></div>
      </div>`;

    const WEIGHTS = ['communication', 'temperature', 'voltage', 'current', 'errorStatus', 'maintenance'];
    const value = (id) => Number(document.getElementById(id).value);

    async function load() {
      const { config } = await api.get('/api/monitoring/config');
      const t = config.thresholds;
      document.getElementById('t_warn').value = t.temperature.warning;
      document.getElementById('t_crit').value = t.temperature.critical;
      document.getElementById('c_max').value = t.current.max;
      document.getElementById('v_min').value = t.voltage.min;
      document.getElementById('v_max').value = t.voltage.max;
      document.getElementById('v_tol').value = t.voltage.tolerance;
      document.getElementById('h_warn').value = t.heartbeat.warningMs / 1000;
      document.getElementById('h_off').value = t.heartbeat.offlineMs / 1000;
      document.getElementById('m_days').value = t.maintenance.reminderDays;
      document.getElementById('faultProb').value = config.simulator.faultProbability;

      document.getElementById('weights').innerHTML = WEIGHTS.map((key) => `
        <div class="col-6 col-md-4">
          <label class="form-label text-capitalize">${key.replace(/([A-Z])/g, ' $1')}</label>
          <input id="w_${key}" type="number" class="form-control" value="${config.healthWeights[key]}">
        </div>`).join('');
    }

    async function save() {
      const healthWeights = Object.fromEntries(WEIGHTS.map((key) => [key, value(`w_${key}`)]));
      try {
        await api.put('/api/monitoring/config', {
          thresholds: {
            temperature: { normal: value('t_warn'), warning: value('t_warn'), critical: value('t_crit') },
            voltage: { min: value('v_min'), max: value('v_max'), tolerance: value('v_tol') },
            current: { max: value('c_max') },
            heartbeat: { warningMs: value('h_warn') * 1000, offlineMs: value('h_off') * 1000 },
            maintenance: { reminderDays: value('m_days') }
          },
          healthWeights,
          'simulator.faultProbability': value('faultProb')
        });
        toast('Configuration saved', 'success');
      } catch (err) { toast(err.message, 'danger'); }
    }

    async function refreshSimulator() {
      const { simulator } = await api.get('/api/monitoring/simulator');
      document.getElementById('simState').innerHTML = simulator.running
        ? `<span class="badge-status st-active">Running</span> <span class="text-muted-sm">since ${fmt.dateTime(simulator.startedAt)} · ${simulator.ticks} cycles</span>`
        : '<span class="badge-status st-offline">Stopped</span> <span class="text-muted-sm">no readings are being generated</span>';
      document.getElementById('simToggle').textContent = simulator.running ? 'Stop' : 'Start';
      document.getElementById('simInterval').value = simulator.intervalMs / 1000;
    }

    document.getElementById('save').addEventListener('click', save);
    document.getElementById('simToggle').addEventListener('click', async (e) => {
      const running = e.target.textContent === 'Stop';
      try {
        if (running) await api.post('/api/monitoring/simulator/stop');
        else await api.post('/api/monitoring/simulator/start', { intervalMs: value('simInterval') * 1000 });
        toast(running ? 'Simulator stopped' : 'Simulator started', 'success');
        refreshSimulator();
      } catch (err) { toast(err.message, 'danger'); }
    });

    load().catch((err) => toast(err.message, 'danger'));
    refreshSimulator().catch(() => {});
    connectSocket({ 'simulator:state': refreshSimulator });
  }
}

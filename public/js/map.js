/**
 * Leaflet station map shared by the dashboard and the stations page.
 * Marker colour follows station health: green, amber, red, grey.
 */
const stationMap = (() => {
  let map = null;
  const markers = new Map();

  const colourFor = (station) => {
    if (station.status === 'Offline') return '#6b7686';
    if (station.healthScore >= 90) return '#17a673';
    if (station.healthScore >= 70) return '#f0a020';
    return '#e0443e';
  };

  const icon = (colour) => L.divIcon({
    className: '',
    html: `<span style="display:block;width:16px;height:16px;border-radius:50%;background:${colour};border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });

  const popup = (s) => {
    const c = s.chargerStats || {};
    return `<div style="min-width:190px">
      <strong>${s.name}</strong><br>
      <span style="color:#6b7686;font-size:12px">${s.location}</span>
      <hr style="margin:6px 0">
      <div style="font-size:13px;line-height:1.6">
        Chargers: <strong>${c.total || 0}</strong><br>
        Available: <strong>${c.Available || 0}</strong> · Charging: <strong>${c.Charging || 0}</strong><br>
        Faults: <strong>${(c.Fault || 0) + (c.Offline || 0)}</strong><br>
        Health: <strong>${s.healthScore}/100 (${s.healthStatus})</strong><br>
        <span style="color:#6b7686">Updated ${fmt.since(s.updatedAt)}</span>
      </div>
      <a href="/chargers.html?station=${s._id}" style="font-size:13px">Open station detail</a>
    </div>`;
  };

  function render(elementId, stations) {
    if (!map) {
      map = L.map(elementId, { scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors', maxZoom: 18
      }).addTo(map);
    }
    stations.forEach((s) => {
      const existing = markers.get(s._id);
      if (existing) {
        existing.setIcon(icon(colourFor(s)));
        existing.setPopupContent(popup(s));
      } else {
        const marker = L.marker([s.latitude, s.longitude], { icon: icon(colourFor(s)), title: s.name })
          .addTo(map).bindPopup(popup(s));
        markers.set(s._id, marker);
      }
    });
    if (stations.length) {
      map.fitBounds(L.latLngBounds(stations.map((s) => [s.latitude, s.longitude])).pad(0.25));
    } else {
      map.setView([20.59, 78.96], 4);
    }
  }

  /** Update one marker in place when a socket event arrives. */
  function updateStation(update) {
    const marker = markers.get(update._id);
    if (marker) marker.setIcon(icon(colourFor(update)));
  }

  return { render, updateStation };
})();

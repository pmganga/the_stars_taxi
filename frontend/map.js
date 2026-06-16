const GEOJSON_URL = 'taxi_zones.geojson';

let leafletMap = null;
let zoneLayer = null;
let zonesGeoJSON = null; // cached raw geometry, fetched once

const TILE_URLS = {
  dark:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
};

let tileLayer = null;

// ── Mock metric generation (deterministic per zone_id) ───────────────

function mockMetricValue(zoneId, metric) {
  // simple deterministic pseudo-random based on zone_id so values are
  // stable across re-renders without needing a backend
  const seed = (zoneId * 9301 + 49297) % 233280;
  const rand = seed / 233280;

  if (metric === 'avg_fare') {
    return +(8 + rand * 22).toFixed(2); // $8 - $30
  }
  // pickup_count / dropoff_count
  return Math.round(500 + rand * 49500); // 500 - 50,000
}

// Color scale

function colorForValue(value, min, max) {
  const colors = themeColors ? themeColors() : { teal: '#3F9C8A', amber: '#D9A441', navy: '#3A5A78' };
  if (max === min) return colors.teal;

  const t = (value - min) / (max - min); // 0..1

  // low -> mid -> high : surface-ish -> teal -> navy
  if (t < 0.5) {
    return interpolateColor('#DCE3EC', '#3F9C8A', t / 0.5);
  }
  return interpolateColor('#3F9C8A', '#3A5A78', (t - 0.5) / 0.5);
}

function interpolateColor(hex1, hex2, t) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b = Math.round(c1.b + (c2.b - c1.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgb(hex) {
  const m = hex.replace('#', '');
  return {
    r: parseInt(m.substring(0, 2), 16),
    g: parseInt(m.substring(2, 4), 16),
    b: parseInt(m.substring(4, 6), 16),
  };
}

// ── Data loading ─────────────────────────────────────────────────────

async function loadZoneGeometry() {
  if (zonesGeoJSON) return zonesGeoJSON;
  const res = await fetch(GEOJSON_URL);
  if (!res.ok) throw new Error(`Failed to load ${GEOJSON_URL}: HTTP ${res.status}`);
  zonesGeoJSON = await res.json();
  return zonesGeoJSON;
}

/**
 * Returns a Map of zone_id -> metric_value for the given metric/date/borough.
 * Tries the API first; falls back to deterministic mock values per zone.
 */
async function loadMetricValues(metric, date, borough) {
  const apiResult = await DataAPI.getZones(metric, date, borough);

  const values = new Map();
  if (apiResult && apiResult.features) {
    apiResult.features.forEach(f => {
      values.set(f.properties.zone_id, f.properties.metric_value);
    });
    return values;
  }

  // fallback: mock values for every zone in the local geojson
  const geo = await loadZoneGeometry();
  geo.features.forEach(f => {
    values.set(f.properties.zone_id, mockMetricValue(f.properties.zone_id, metric));
  });
  return values;
}

// Rendering

async function renderZoneLayer() {
  if (!leafletMap) return;

  const metric = document.getElementById('map-metric')?.value || 'pickup_count';
  const borough = document.getElementById('map-borough')?.value || '';
  const date = document.getElementById('global-date')?.value;

  const geo = await loadZoneGeometry();
  const values = await loadMetricValues(metric, date, borough);

  // filter by borough if selected
  const features = borough
    ? geo.features.filter(f => f.properties.borough === borough)
    : geo.features;

  const numericValues = features
    .map(f => values.get(f.properties.zone_id))
    .filter(v => typeof v === 'number');

  const min = numericValues.length ? Math.min(...numericValues) : 0;
  const max = numericValues.length ? Math.max(...numericValues) : 1;

  if (zoneLayer) {
    leafletMap.removeLayer(zoneLayer);
  }

  const filtered = { type: 'FeatureCollection', features };

  zoneLayer = L.geoJSON(filtered, {
    style: feature => {
      const value = values.get(feature.properties.zone_id);
      return {
        fillColor: typeof value === 'number' ? colorForValue(value, min, max) : '#DCE3EC',
        weight: 1,
        color: '#FFFFFF',
        fillOpacity: 0.75,
      };
    },
    onEachFeature: (feature, layer) => {
      const value = values.get(feature.properties.zone_id);
      const metricLabel = {
        pickup_count: 'Pickups',
        dropoff_count: 'Dropoffs',
        avg_fare: 'Avg fare',
      }[metric] || 'Value';

      const displayValue = metric === 'avg_fare'
        ? `$${(value ?? 0).toFixed(2)}`
        : (value ?? 0).toLocaleString();

      layer.bindPopup(
        `<strong>${feature.properties.zone_name}</strong><br>` +
        `${feature.properties.borough}<br>` +
        `${metricLabel}: ${displayValue}`
      );

      layer.on('mouseover', () => layer.setStyle({ weight: 2, fillOpacity: 0.9 }));
      layer.on('mouseout', () => zoneLayer.resetStyle(layer));
    },
  }).addTo(leafletMap);

  // fit bounds on first render or when filtering to a single borough
  if (features.length) {
    leafletMap.fitBounds(zoneLayer.getBounds(), { padding: [10, 10] });
  }
}

// Map init

function initMap() {
  if (leafletMap) return;

  leafletMap = L.map('leaflet-map', { zoomControl: true })
    .setView([40.7128, -73.95], 11);

  const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  tileLayer = L.tileLayer(TILE_URLS[theme], {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(leafletMap);

  renderZoneLayer();
}

window.map_invalidateSize = function () {
  if (!leafletMap) {
    initMap();
  }
  setTimeout(() => leafletMap && leafletMap.invalidateSize(), 50);
};

function updateMapTheme() {
  if (!leafletMap || !tileLayer) return;
  const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  leafletMap.removeLayer(tileLayer);
  tileLayer = L.tileLayer(TILE_URLS[theme], {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(leafletMap);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('apply-map-filters')?.addEventListener('click', () => {
    renderZoneLayer();
  });

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    setTimeout(updateMapTheme, 0);
  });
  document.getElementById('theme-toggle-mobile')?.addEventListener('click', () => {
    setTimeout(updateMapTheme, 0);
  });
});

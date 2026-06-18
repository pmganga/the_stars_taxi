const GEOJSON_URL = 'taxi_zones.geojson';

let leafletMap = null;
let zoneLayer = null;
let zonesGeoJSON = null;
let tileLayer = null;
let currentMetric = 'pickup_count';
let currentBorough = '';
let isMapReady = false;

const TILE_URLS = {
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
};

// Blue -> Green -> Orange -> Brown color scale
function getColor(value, min, max) {
    if (value === null || value === undefined || isNaN(value)) return '#d0d0d0';

    var ratio = (max === min) ? 0.5 : (value - min) / (max - min);
    var clamped = Math.max(0, Math.min(1, ratio));

    var colors = [
        { r: 40, g: 80, b: 160 },
        { r: 60, g: 130, b: 200 },
        { r: 80, g: 180, b: 180 },
        { r: 60, g: 170, b: 100 },
        { r: 140, g: 200, b: 70 },
        { r: 230, g: 180, b: 50 },
        { r: 220, g: 140, b: 50 },
        { r: 180, g: 100, b: 50 },
        { r: 130, g: 70, b: 40 }
    ];

    var idx = clamped * (colors.length - 1);
    var idx0 = Math.floor(idx);
    var idx1 = Math.min(idx0 + 1, colors.length - 1);
    var t = idx - idx0;

    var c0 = colors[idx0];
    var c1 = colors[idx1];

    return 'rgb(' + Math.round(c0.r + (c1.r - c0.r) * t) + ', ' +
        Math.round(c0.g + (c1.g - c0.g) * t) + ', ' +
        Math.round(c0.b + (c1.b - c0.b) * t) + ')';
}

// Generate mock data (fallback)
function generateMockData(features) {
    var values = new Map();
    for (var i = 0; i < features.length; i++) {
        var f = features[i];
        var zoneId = f.properties.zone_id;
        if (zoneId) {
            var seed = (zoneId * 9301 + 49297) % 233280;
            var rand = seed / 233280;
            var base = 500;
            var borough = f.properties.borough || '';
            if (borough === 'Manhattan') base = 5000;
            else if (borough === 'Brooklyn') base = 3000;
            else if (borough === 'Queens') base = 2000;
            else if (borough === 'Bronx') base = 1500;
            else if (borough === 'Staten Island') base = 800;
            values.set(zoneId, Math.round(base + rand * base * 2));
        }
    }
    return values;
}

// Load GeoJSON
async function loadGeoJSON() {
    if (zonesGeoJSON) return zonesGeoJSON;

    try {
        var response = await fetch(GEOJSON_URL);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        zonesGeoJSON = await response.json();
        console.log('Loaded ' + zonesGeoJSON.features.length + ' zones');
        return zonesGeoJSON;
    } catch (error) {
        console.error('Failed to load GeoJSON:', error);
        return { type: 'FeatureCollection', features: [] };
    }
}

// Load metric values
async function loadMetricValues(metric, borough) {
    try {
        var data = await DataAPI.getZones(metric, borough);

        if (Array.isArray(data) && data.length > 0) {
            var values = new Map();
            for (var i = 0; i < data.length; i++) {
                values.set(data[i].zone_id, data[i].metric_value);
            }
            console.log('Loaded ' + values.size + ' metric values');
            return values;
        }
    } catch (error) {
        console.warn('API failed:', error);
    }

    console.log('Using mock data');
    var geo = await loadGeoJSON();
    return generateMockData(geo.features);
}

// Render map - simplified for speed
async function renderMap() {
    if (!leafletMap) {
        console.warn('Map not initialized');
        return;
    }

    currentMetric = document.getElementById('map-metric')?.value || 'pickup_count';
    currentBorough = document.getElementById('map-borough')?.value || '';

    console.log('Rendering map...');

    var geo = await loadGeoJSON();
    var values = await loadMetricValues(currentMetric, currentBorough);

    if (!geo.features || geo.features.length === 0) {
        console.error('No GeoJSON features');
        return;
    }

    var features = geo.features;
    if (currentBorough) {
        features = features.filter(function (f) {
            return f.properties.borough === currentBorough;
        });
    }

    console.log('Showing ' + features.length + ' zones');

    // Group by borough for per-borough coloring
    var boroughRanges = {};
    var boroughGroups = {};

    for (var i = 0; i < features.length; i++) {
        var b = features[i].properties.borough || 'Unknown';
        if (!boroughGroups[b]) boroughGroups[b] = [];
        boroughGroups[b].push(features[i]);
    }

    for (var b in boroughGroups) {
        var vals = [];
        for (var j = 0; j < boroughGroups[b].length; j++) {
            var v = values.get(boroughGroups[b][j].properties.zone_id);
            if (typeof v === 'number' && !isNaN(v)) {
                vals.push(v);
            }
        }
        if (vals.length > 0) {
            boroughRanges[b] = {
                min: Math.min.apply(null, vals),
                max: Math.max.apply(null, vals)
            };
        }
    }

    function getColorForZone(zoneId, boroughName) {
        var value = values.get(zoneId);
        if (typeof value !== 'number' || isNaN(value)) return '#d0d0d0';

        var range = boroughRanges[boroughName];
        if (!range) {
            var allVals = [];
            for (var i = 0; i < features.length; i++) {
                var v = values.get(features[i].properties.zone_id);
                if (typeof v === 'number' && !isNaN(v)) {
                    allVals.push(v);
                }
            }
            var globalMin = allVals.length ? Math.min.apply(null, allVals) : 0;
            var globalMax = allVals.length ? Math.max.apply(null, allVals) : 1;
            return getColor(value, globalMin, globalMax);
        }
        return getColor(value, range.min, range.max);
    }

    // Remove old layer
    if (zoneLayer) {
        leafletMap.removeLayer(zoneLayer);
        zoneLayer = null;
    }

    // Create layer with simplified styling for speed
    zoneLayer = L.geoJSON(
        { type: 'FeatureCollection', features: features },
        {
            style: function (feature) {
                return {
                    fillColor: getColorForZone(feature.properties.zone_id, feature.properties.borough || 'Unknown'),
                    weight: 1,
                    color: '#ffffff',
                    fillOpacity: 0.8,
                    opacity: 0.9
                };
            },
            onEachFeature: function (feature, layer) {
                var value = values.get(feature.properties.zone_id);
                var name = feature.properties.zone_name || 'Unknown';
                var boroughName = feature.properties.borough || 'Unknown';

                var metricLabels = {
                    pickup_count: 'Pickups',
                    dropoff_count: 'Dropoffs',
                    avg_fare: 'Avg Fare'
                };
                var label = metricLabels[currentMetric] || 'Value';

                var displayValue = currentMetric === 'avg_fare'
                    ? '$' + (value || 0).toFixed(2)
                    : (value || 0).toLocaleString();

                layer.bindPopup(
                    '<strong>' + name + '</strong><br>' +
                    boroughName + '<br>' +
                    label + ': ' + displayValue
                );

                layer.on('mouseover', function () {
                    this.setStyle({ weight: 3, fillOpacity: 0.95 });
                    this.bringToFront();
                });

                layer.on('mouseout', function () {
                    if (zoneLayer) zoneLayer.resetStyle(this);
                });
            }
        }
    ).addTo(leafletMap);

    // Fit bounds
    if (features.length > 0 && zoneLayer.getBounds().isValid()) {
        leafletMap.fitBounds(zoneLayer.getBounds(), {
            padding: [30, 30],
            maxZoom: 13
        });
    } else {
        leafletMap.setView([40.7128, -73.95], 11);
    }

    isMapReady = true;
    updateLegend(currentMetric, boroughRanges);
}

// Update legend
function updateLegend(metric, boroughRanges) {
    var container = document.querySelector('.map-legend');
    if (!container) return;

    var labels = {
        pickup_count: 'Pickups',
        dropoff_count: 'Dropoffs',
        avg_fare: 'Avg Fare'
    };

    var label = labels[metric] || 'Value';

    if (currentBorough) {
        var range = boroughRanges[currentBorough];
        if (range) {
            var mid = (range.min + range.max) / 2;
            container.innerHTML =
                '<span><strong>' + label + ' - ' + currentBorough + '</strong></span>' +
                '<span><span class="map-legend__swatch" style="background:' + getColor(range.min, range.min, range.max) + '"></span>Low</span>' +
                '<span><span class="map-legend__swatch" style="background:' + getColor(mid, range.min, range.max) + '"></span>Medium</span>' +
                '<span><span class="map-legend__swatch" style="background:' + getColor(range.max, range.min, range.max) + '"></span>High</span>' +
                '<span class="map-legend__hint">Click a zone</span>';
            return;
        }
    }

    var boroughs = Object.keys(boroughRanges);
    var legendHtml = '<span><strong>' + label + ' (per borough)</strong></span>';

    for (var i = 0; i < Math.min(boroughs.length, 4); i++) {
        var b = boroughs[i];
        var range = boroughRanges[b];
        var mid = (range.min + range.max) / 2;
        var displayName = b.length > 10 ? b.substring(0, 8) + '..' : b;

        legendHtml +=
            '<span style="display:inline-flex;align-items:center;gap:3px;">' +
            '<span style="background:' + getColor(range.min, range.min, range.max) + ';width:12px;height:12px;display:inline-block;border-radius:3px;"></span>' +
            '<span style="background:' + getColor(mid, range.min, range.max) + ';width:12px;height:12px;display:inline-block;border-radius:3px;"></span>' +
            '<span style="background:' + getColor(range.max, range.min, range.max) + ';width:12px;height:12px;display:inline-block;border-radius:3px;"></span>' +
            ' ' + displayName +
            '</span>';
    }

    if (boroughs.length > 4) {
        legendHtml += '<span>+' + (boroughs.length - 4) + ' more</span>';
    }

    legendHtml += '<span class="map-legend__hint">Click a zone</span>';
    container.innerHTML = legendHtml;
}

// Initialize map
function initMap() {
    if (leafletMap) {
        console.log('Map already initialized');
        return;
    }

    console.log('Initializing map...');

    var container = document.getElementById('leaflet-map');
    if (!container) {
        console.error('Map container not found');
        return;
    }

    leafletMap = L.map('leaflet-map', {
        center: [40.7128, -73.95],
        zoom: 11,
        zoomControl: true,
        // ENABLE SMOOTH ZOOM AND SCROLL
        fadeAnimation: true,
        zoomAnimation: true,
        markerZoomAnimation: true,
        inertia: true,
        inertiaDeceleration: 3000,
        inertiaMaxSpeed: 1500,
        wheelDebounceTime: 40,
        wheelPxPerZoomLevel: 60
    });

    var theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    tileLayer = L.tileLayer(TILE_URLS[theme], {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
        // Enable smooth tile loading
        fadeAnimation: true,
        updateWhenIdle: false
    }).addTo(leafletMap);

    console.log('Map initialized with smooth zoom');

    // Also enable smooth zoom on the map container
    container.style.scrollBehavior = 'smooth';

    setTimeout(function () {
        if (leafletMap) leafletMap.invalidateSize();
    }, 100);

    setTimeout(renderMap, 300);
}

// Update map theme
function updateMapTheme() {
    if (!leafletMap || !tileLayer) return;
    var theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    leafletMap.removeLayer(tileLayer);
    tileLayer = L.tileLayer(TILE_URLS[theme], {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 14
    }).addTo(leafletMap);
}

window.map_invalidateSize = function () {
    if (!leafletMap) { initMap(); return; }
    setTimeout(function () {
        if (leafletMap) leafletMap.invalidateSize();
    }, 100);
};

// Event listeners
document.addEventListener('DOMContentLoaded', function () {
    console.log('DOM ready');
    setTimeout(initMap, 200);

    var applyBtn = document.getElementById('apply-map-filters');
    if (applyBtn) {
        applyBtn.addEventListener('click', function (e) {
            e.preventDefault();
            console.log('Apply clicked');
            renderMap();
        });
    }

    document.getElementById('map-metric')?.addEventListener('change', renderMap);
    document.getElementById('map-borough')?.addEventListener('change', renderMap);

    document.getElementById('theme-toggle')?.addEventListener('click', function () {
        setTimeout(updateMapTheme, 50);
        setTimeout(renderMap, 200);
    });
    document.getElementById('theme-toggle-mobile')?.addEventListener('click', function () {
        setTimeout(updateMapTheme, 50);
        setTimeout(renderMap, 200);
    });
});

document.querySelectorAll('[data-section="map"]').forEach(function (link) {
    link.addEventListener('click', function () {
        setTimeout(function () {
            if (leafletMap) {
                leafletMap.invalidateSize();
                if (!isMapReady) renderMap();
            } else {
                initMap();
            }
        }, 300);
    });
});

console.log('Map module loaded');
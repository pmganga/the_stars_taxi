function themeColors() {
  var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    navy: '#3A5A78',
    teal: '#3F9C8A',
    slate: '#7C8DA6',
    amber: '#D9A441',
    text: isDark ? '#E7ECF2' : '#1E2A3A',
    textDim: isDark ? '#9AAAC0' : '#647488',
    grid: isDark ? '#2E3D52' : '#DCE3EC',
    surface: isDark ? '#1A2433' : '#FFFFFF',
  };
}

var hourlyChart, topZonesChart, scatterChart, paymentChart;
var hourlyViewMode = 'bar';

// KPI cards

function renderSummary(summary) {
  var formatNumber = function(val) {
    if (val === null || val === undefined || isNaN(val)) return '0';
    return val.toLocaleString();
  };
  
  var formatCurrency = function(val) {
    if (val === null || val === undefined || isNaN(val)) return '$0.0M';
    return '$' + (val / 1000000).toFixed(1) + 'M';
  };
  
  var formatPercent = function(val) {
    if (val === null || val === undefined || isNaN(val)) return '0%';
    return val.toFixed(1) + '%';
  };
  
  var totalTripsEl = document.querySelector('[data-stat="total-trips"]');
  var totalRevenueEl = document.querySelector('[data-stat="total-revenue"]');
  var avgFareEl = document.querySelector('[data-stat="avg-fare"]');
  var avgDistanceEl = document.querySelector('[data-stat="avg-distance"]');
  var avgTipPctEl = document.querySelector('[data-stat="avg-tip-pct"]');
  var peakHourEl = document.querySelector('[data-stat="peak-hour"]');
  
  if (totalTripsEl) totalTripsEl.textContent = formatNumber(summary.total_trips);
  if (totalRevenueEl) totalRevenueEl.textContent = formatCurrency(summary.total_revenue);
  if (avgFareEl) avgFareEl.textContent = '$' + (summary.avg_fare ? summary.avg_fare.toFixed(2) : '0.00');
  if (avgDistanceEl) avgDistanceEl.textContent = summary.avg_distance ? summary.avg_distance.toFixed(1) : '0.0';
  if (avgTipPctEl) avgTipPctEl.textContent = formatPercent(summary.avg_tip_pct);
  if (peakHourEl) peakHourEl.textContent = summary.peak_hour || '00:00';
}

// Hourly volume

function renderHourlyChart(data) {
  var colors = themeColors();
  var ctx = document.getElementById('hourly-chart');

  if (hourlyChart) hourlyChart.destroy();

  hourlyChart = new Chart(ctx, {
    type: hourlyViewMode,
    data: {
      labels: data.labels,
      datasets: [{
        label: 'Trips',
        data: data.data,
        backgroundColor: hourlyViewMode === 'bar' ? colors.navy : 'transparent',
        borderColor: colors.navy,
        borderWidth: 2,
        borderRadius: hourlyViewMode === 'bar' ? 3 : 0,
        tension: 0.35,
        pointRadius: hourlyViewMode === 'line' ? 2 : 0,
        fill: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: colors.textDim } },
        y: { grid: { color: colors.grid }, ticks: { color: colors.textDim } },
      },
    },
  });
}

function toggleHourlyView() {
  hourlyViewMode = hourlyViewMode === 'bar' ? 'line' : 'bar';
  var btn = document.getElementById('toggle-hourly-view');
  if (btn) btn.textContent = hourlyViewMode === 'bar' ? 'Switch to line' : 'Switch to bar';
  DataAPI.getTripsByHour()
    .then(renderHourlyChart)
    .catch(function(err) { showChartError('hourly-chart', err.message); });
}

// Top pickup zones

function renderTopZonesChart(data) {
  var colors = themeColors();
  if (topZonesChart) topZonesChart.destroy();

  topZonesChart = new Chart(document.getElementById('top-zones-chart'), {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [{
        label: 'Pickups',
        data: data.data,
        backgroundColor: colors.teal,
        borderRadius: 3,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: colors.grid }, ticks: { color: colors.textDim } },
        y: { grid: { display: false }, ticks: { color: colors.textDim } },
      },
    },
  });
}

// Fare vs distance scatter

function linearRegression(points) {
  var n = points.length;
  if (n === 0) return [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  
  var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (var i = 0; i < n; i++) {
    sumX += points[i].x;
    sumY += points[i].y;
    sumXY += points[i].x * points[i].y;
    sumX2 += points[i].x * points[i].x;
  }

  var slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  var intercept = (sumY - slope * sumX) / n;

  var minX = points[0].x;
  var maxX = points[0].x;
  for (var i = 1; i < n; i++) {
    if (points[i].x < minX) minX = points[i].x;
    if (points[i].x > maxX) maxX = points[i].x;
  }

  return [
    { x: minX, y: slope * minX + intercept },
    { x: maxX, y: slope * maxX + intercept },
  ];
}

function renderScatterChart(points, showTrend) {
  var colors = themeColors();
  if (scatterChart) scatterChart.destroy();

  var datasets = [{
    label: 'Trips',
    data: points,
    backgroundColor: colors.amber,
    pointRadius: 3,
    showLine: false,
  }];

  if (showTrend && points.length > 0) {
    datasets.push({
      label: 'Trend',
      data: linearRegression(points),
      borderColor: colors.navy,
      borderWidth: 2,
      pointRadius: 0,
      showLine: true,
      fill: false,
      type: 'line',
    });
  }

  scatterChart = new Chart(document.getElementById('scatter-chart'), {
    type: 'scatter',
    data: { datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: colors.grid },
          ticks: { color: colors.textDim },
          title: { display: true, text: 'Distance (mi)', color: colors.textDim },
        },
        y: {
          grid: { color: colors.grid },
          ticks: { color: colors.textDim },
          title: { display: true, text: 'Fare ($)', color: colors.textDim },
        },
      },
    },
  });
}

// Payment split donut

function renderPaymentChart(data) {
  var colors = themeColors();
  if (paymentChart) paymentChart.destroy();

  paymentChart = new Chart(document.getElementById('payment-chart'), {
    type: 'doughnut',
    data: {
      labels: data.labels,
      datasets: [{
        data: data.data,
        backgroundColor: [colors.navy, colors.amber, colors.teal, colors.slate],
        borderColor: colors.surface,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: colors.textDim } },
      },
    },
  });
}

// Trips table

function renderTripsTable(trips) {
  var tbody = document.querySelector('#trips-table tbody');
  if (!tbody) return;

  if (!trips || trips.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="trips-table__loading">No trips match these filters.</td></tr>';
    return;
  }

  var html = '';
  var maxRows = 50;
  
  for (var i = 0; i < Math.min(trips.length, maxRows); i++) {
    var t = trips[i];
    html += '<tr>' +
      '<td>' + (t.pickup || '') + '</td>' +
      '<td>' + (t.dropoff || '') + '</td>' +
      '<td>' + (t.pu_zone || '-') + '</td>' +
      '<td>' + (t.do_zone || '-') + '</td>' +
      '<td>' + (t.distance ? t.distance.toFixed(1) : '0.0') + '</td>' +
      '<td>' + (t.fare ? t.fare.toFixed(2) : '0.00') + '</td>' +
      '<td>' + (t.tip ? t.tip.toFixed(2) : '0.00') + '</td>' +
      '<td>' + (t.total ? t.total.toFixed(2) : '0.00') + '</td>' +
    '</tr>';
  }
  
  if (trips.length > maxRows) {
    html += '<tr><td colspan="8" class="trips-table__loading">Showing first ' + maxRows + ' of ' + trips.length + ' trips</td></tr>';
  }
  
  tbody.innerHTML = html;
}

// Init / refresh

function getCurrentDate() {
  var dateInput = document.getElementById('global-date');
  return dateInput ? dateInput.value : '';
}

function showChartError(canvasId, message) {
  var canvas = document.getElementById(canvasId);
  var card = canvas ? canvas.closest('.chart-card__body') : null;
  if (!card) return;
  card.innerHTML = '<p class="chart-card__error">Could not load this chart: ' + message + '</p>';
}

function loadDashboard() {
  console.log('Loading dashboard...');
  
  var tbody = document.querySelector('#trips-table tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="8" class="trips-table__loading">Loading trip data...</td></tr>';
  }
  
  var cachedSummary = DataStore.load('summary');
  var cachedHourly = DataStore.load('hourly');
  var cachedTopZones = DataStore.load('topZones');
  var cachedPayment = DataStore.load('payment');
  
  if (cachedSummary) {
    console.log('Rendering cached summary');
    renderSummary(cachedSummary);
  }
  
  if (cachedHourly) {
    console.log('Rendering cached hourly chart');
    renderHourlyChart(cachedHourly);
  }
  
  if (cachedTopZones) {
    console.log('Rendering cached top zones');
    renderTopZonesChart(cachedTopZones);
  }
  
  if (cachedPayment) {
    console.log('Rendering cached payment chart');
    renderPaymentChart(cachedPayment);
  }
  
  console.log('Fetching fresh data...');
  
  DataAPI.getTrips({ date: getCurrentDate() })
    .then(function(trips) {
      console.log('Trips loaded:', trips ? trips.length : 0);
      renderTripsTable(trips);
    })
    .catch(function(err) {
      console.error('Trips failed:', err.message);
      var tbody = document.querySelector('#trips-table tbody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" class="trips-table__loading">Could not load trips: ' + err.message + '</td></tr>';
      }
    });
  
  DataAPI.getSummary()
    .then(function(summary) {
      console.log('Summary loaded:', summary);
      renderSummary(summary);
    })
    .catch(function(err) { 
      console.error('Summary failed:', err.message); 
    });
  
  DataAPI.getTripsByHour()
    .then(function(data) {
      console.log('Hourly data loaded:', data.labels.length);
      renderHourlyChart(data);
    })
    .catch(function(err) { 
      console.error('Hourly failed:', err.message); 
    });
  
  DataAPI.getTopZones()
    .then(function(data) {
      console.log('Top zones loaded:', data.labels.length);
      renderTopZonesChart(data);
    })
    .catch(function(err) { 
      console.error('Top zones failed:', err.message); 
    });
  
  DataAPI.getPaymentSplit()
    .then(function(data) {
      console.log('Payment data loaded:', data.labels.length);
      renderPaymentChart(data);
    })
    .catch(function(err) { 
      console.error('Payment failed:', err.message); 
    });
  
  var showTrend = document.getElementById('trendline-toggle') ? document.getElementById('trendline-toggle').checked : false;
  DataAPI.getFareVsDistance(getCurrentDate())
    .then(function(points) { 
      console.log('Scatter data loaded:', points.length);
      renderScatterChart(points, showTrend); 
    })
    .catch(function(err) { 
      showChartError('scatter-chart', err.message); 
    });
}

document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM ready, loading dashboard...');
  loadDashboard();

  document.getElementById('toggle-hourly-view')?.addEventListener('click', toggleHourlyView);

  document.getElementById('trendline-toggle')?.addEventListener('change', function(e) {
    DataAPI.getFareVsDistance(getCurrentDate())
      .then(function(points) { renderScatterChart(points, e.target.checked); })
      .catch(function(err) { showChartError('scatter-chart', err.message); });
  });

  document.getElementById('theme-toggle')?.addEventListener('click', function() {
    setTimeout(loadDashboard, 0);
  });
  document.getElementById('theme-toggle-mobile')?.addEventListener('click', function() {
    setTimeout(loadDashboard, 0);
  });

  document.getElementById('global-date')?.addEventListener('change', function() {
    var tbody = document.querySelector('#trips-table tbody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="8" class="trips-table__loading">Loading trip data...</td></tr>';
    }
    
    DataAPI.getTrips({ date: getCurrentDate() })
      .then(renderTripsTable)
      .catch(function(err) {
        var tbody = document.querySelector('#trips-table tbody');
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="8" class="trips-table__loading">Could not load trips: ' + err.message + '</td></tr>';
        }
      });

    var showTrend = document.getElementById('trendline-toggle')?.checked || false;
    DataAPI.getFareVsDistance(getCurrentDate())
      .then(function(points) { renderScatterChart(points, showTrend); })
      .catch(function(err) { showChartError('scatter-chart', err.message); });
  });
});

console.log('Charts module loaded');
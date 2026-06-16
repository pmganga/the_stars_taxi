const API_BASE = 'http://localhost:5000/api';

const PAYMENT_LABELS = {
  1: 'Credit card',
  2: 'Cash',
  3: 'No charge',
  4: 'Dispute',
  5: 'Unknown',
  6: 'Voided',
};

// Fetch helper

async function apiGet(path, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  const url = `${API_BASE}${path}${query.toString() ? '?' + query.toString() : ''}`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Public API

const DataAPI = {
    getSummary: async () => {
    const [boroughRows, hourlyRows] = await Promise.all([
      apiGet('/summary/borough'),
      apiGet('/summary/hourly'),
    ]);

    const totalTrips = boroughRows.reduce((sum, r) => sum + r.trip_count, 0);
    const totalRevenue = boroughRows.reduce((sum, r) => sum + r.total_revenue, 0);

    const weighted = (key) =>
      boroughRows.reduce((sum, r) => sum + r[key] * r.trip_count, 0) / totalTrips;

    const avgFare = weighted('avg_fare');
    const avgDistance = weighted('avg_distance');
    const avgTipPct = weighted('avg_tip_pct');

    const peak = hourlyRows.reduce(
      (best, r) => (r.trip_count > best.trip_count ? r : best),
      { hour: 0, trip_count: -1 }
    );
    const peakHour = `${String(peak.hour).padStart(2, '0')}:00`;

    return {
      total_trips: totalTrips,
      total_revenue: totalRevenue,
      avg_fare: avgFare,
      avg_distance: avgDistance,
      avg_tip_pct: avgTipPct,
      peak_hour: peakHour,
    };
  },

  getTripsByHour: async () => {
    const rows = await apiGet('/summary/hourly');
    // ensure all 24 hours present, even if some have zero trips
    const byHour = new Map(rows.map(r => [r.hour, r.trip_count]));
    const labels = Array.from({ length: 24 }, (_, h) => `${h}:00`);
    const data = Array.from({ length: 24 }, (_, h) => byHour.get(h) || 0);
    return { labels, data };
  },

  // Top pickup zones via /api/top-routes (dsa/top_routes.py)
  getTopZones: async (limit = 8) => {
    const rows = await apiGet('/top-routes', { k: limit });
    return {
      labels: rows.map(r => r.zone_name),
      data: rows.map(r => r.trip_count),
    };
  },

  getFareVsDistance: async (date, sample = 150) => {
    const trips = await apiGet('/trips', { date, max_distance: 30, max_fare: 150 });
    return trips
      .slice(0, sample)
      .map(t => ({ x: t.trip_distance, y: t.fare_amount }));
  },

  getPaymentSplit: async () => {
    const rows = await apiGet('/summary/payment');
    const total = rows.reduce((sum, r) => sum + r.trip_count, 0);
    return {
      labels: rows.map(r => PAYMENT_LABELS[r.payment_type] || `Type ${r.payment_type}`),
      data: rows.map(r => +(r.trip_count / total * 100).toFixed(1)),
    };
  },

  getTrips: async (filters = {}) => {
    const params = {
      date: filters.date || undefined,
      borough: filters.borough && filters.borough !== 'all' ? filters.borough : undefined,
      min_fare: filters.minFare || undefined,
      max_fare: filters.maxFare !== Infinity ? filters.maxFare : undefined,
      min_distance: filters.minDistance || undefined,
      max_distance: filters.maxDistance !== Infinity ? filters.maxDistance : undefined,
      // app.py treats "evening" as no filter (only morning/afternoon/night exist)
      time_of_day: filters.hour && filters.hour !== 'all' && filters.hour !== 'evening'
        ? filters.hour
        : undefined,
    };

    const rows = await apiGet('/trips', params);

    return rows.map(t => ({
      pickup: t.pickup_datetime,
      dropoff: t.dropoff_datetime,
      pu_zone: t.pickup_zone || '—',
      do_zone: t.dropoff_zone || '—',
      distance: t.trip_distance,
      fare: t.fare_amount,
      tip: t.tip_amount,
      total: t.total_amount,
    }));
  },

  getZones: (metric, borough) =>
    apiGet('/zones', { metric, borough }),
};
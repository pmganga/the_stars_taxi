const API_BASE = 'http://localhost:5000/api';

const PAYMENT_LABELS = {
    1: 'Credit card',
    2: 'Cash',
    3: 'No charge',
    4: 'Dispute',
    5: 'Unknown',
    6: 'Voided',
};

// Data Store with Session Persistence

const DataStore = {
    cacheTTL: 300000,
    
    save: function(key, data) {
        try {
            const item = {
                data: data,
                timestamp: Date.now()
            };
            sessionStorage.setItem('nyc_mobility_' + key, JSON.stringify(item));
            return true;
        } catch (e) {
            console.warn('Failed to save to sessionStorage:', e);
            return false;
        }
    },
    
    load: function(key) {
        try {
            const item = sessionStorage.getItem('nyc_mobility_' + key);
            if (!item) return null;
            
            const parsed = JSON.parse(item);
            if (Date.now() - parsed.timestamp > this.cacheTTL) {
                sessionStorage.removeItem('nyc_mobility_' + key);
                return null;
            }
            return parsed.data;
        } catch (e) {
            return null;
        }
    },
    
    has: function(key) {
        return this.load(key) !== null;
    },
    
    clear: function() {
        const keys = Object.keys(sessionStorage).filter(function(k) {
            return k.startsWith('nyc_mobility_');
        });
        keys.forEach(function(k) {
            sessionStorage.removeItem(k);
        });
        console.log('Cache cleared');
        return true;
    }
};

// Fetch Helper

async function apiGet(path, params = {}) {
    const query = new URLSearchParams(
        Object.entries(params).filter(function(item) {
            const v = item[1];
            return v !== undefined && v !== null && v !== '';
        })
    );
    const url = API_BASE + path + (query.toString() ? '?' + query.toString() : '');
    
    console.log('Fetching: ' + url);
    
    const res = await fetch(url);
    if (!res.ok) {
        const body = await res.json().catch(function() { return {}; });
        throw new Error(body.message || body.error || 'HTTP ' + res.status);
    }
    return res.json();
}

// Public API

const DataAPI = {
    getSummary: async function() {
        const cached = DataStore.load('summary');
        if (cached) {
            console.log('Using cached summary data');
            return cached;
        }
        
        console.log('Fetching fresh summary data');
        
        try {
            const [boroughRows, hourlyRows] = await Promise.all([
                apiGet('/summary/borough'),
                apiGet('/summary/hourly'),
            ]);

            if (!boroughRows || boroughRows.length === 0) {
                console.warn('No borough data returned from API');
                const emptyResult = {
                    total_trips: 0,
                    total_revenue: 0,
                    avg_fare: 0,
                    avg_distance: 0,
                    avg_tip_pct: 0,
                    peak_hour: '00:00'
                };
                DataStore.save('summary', emptyResult);
                return emptyResult;
            }

            console.log('Borough data sample:', boroughRows[0]);

            var totalTrips = 0;
            var totalRevenue = 0;
            
            for (var i = 0; i < boroughRows.length; i++) {
                totalTrips += (boroughRows[i].trip_count || 0);
                totalRevenue += (boroughRows[i].total_revenue || 0);
            }

            function weighted(key) {
                if (totalTrips === 0) return 0;
                var sum = 0;
                for (var i = 0; i < boroughRows.length; i++) {
                    var val = boroughRows[i][key];
                    if (val !== null && val !== undefined && !isNaN(val)) {
                        sum += val * (boroughRows[i].trip_count || 0);
                    }
                }
                return sum / totalTrips;
            }

            var peakHour = '00:00';
            if (hourlyRows && hourlyRows.length > 0) {
                var peak = hourlyRows[0];
                for (var i = 1; i < hourlyRows.length; i++) {
                    if (hourlyRows[i].trip_count > peak.trip_count) {
                        peak = hourlyRows[i];
                    }
                }
                peakHour = String(peak.hour).padStart(2, '0') + ':00';
            }

            var result = {
                total_trips: totalTrips,
                total_revenue: totalRevenue,
                avg_fare: weighted('avg_fare'),
                avg_distance: weighted('avg_distance'),
                avg_tip_pct: weighted('avg_tip_pct'),
                peak_hour: peakHour,
            };
            
            console.log('Summary result:', result);
            DataStore.save('summary', result);
            return result;
        } catch (error) {
            console.error('Error fetching summary:', error);
            const emptyResult = {
                total_trips: 0,
                total_revenue: 0,
                avg_fare: 0,
                avg_distance: 0,
                avg_tip_pct: 0,
                peak_hour: '00:00'
            };
            DataStore.save('summary', emptyResult);
            return emptyResult;
        }
    },

    getTripsByHour: async function() {
        var cached = DataStore.load('hourly');
        if (cached) {
            console.log('Using cached hourly data');
            return cached;
        }
        
        console.log('Fetching fresh hourly data');
        
        try {
            var rows = await apiGet('/summary/hourly');
            var byHour = new Map();
            for (var i = 0; i < rows.length; i++) {
                byHour.set(rows[i].hour, rows[i].trip_count);
            }
            
            var labels = [];
            var data = [];
            for (var h = 0; h < 24; h++) {
                labels.push(h + ':00');
                data.push(byHour.get(h) || 0);
            }
            
            var result = { labels: labels, data: data };
            DataStore.save('hourly', result);
            return result;
        } catch (error) {
            console.error('Error fetching hourly data:', error);
            var labels = [];
            var data = [];
            for (var h = 0; h < 24; h++) {
                labels.push(h + ':00');
                data.push(0);
            }
            var result = { labels: labels, data: data };
            DataStore.save('hourly', result);
            return result;
        }
    },

    getTopZones: async function(limit = 8) {
        var cached = DataStore.load('topZones');
        if (cached) {
            console.log('Using cached top zones data');
            return cached;
        }
        
        console.log('Fetching fresh top zones data');
        
        try {
            var rows = await apiGet('/top-routes', { k: limit });
            var labels = [];
            var data = [];
            for (var i = 0; i < rows.length; i++) {
                labels.push(rows[i].zone_name || 'Unknown');
                data.push(rows[i].trip_count || 0);
            }
            
            var result = { labels: labels, data: data };
            DataStore.save('topZones', result);
            return result;
        } catch (error) {
            console.error('Error fetching top zones:', error);
            var result = { labels: ['No data'], data: [0] };
            DataStore.save('topZones', result);
            return result;
        }
    },

    getFareVsDistance: async function(date, sample = 150) {
        try {
            var trips = await apiGet('/trips', { 
                date: date, 
                max_distance: 30, 
                max_fare: 150 
            });
            var result = [];
            var count = Math.min(sample, trips.length);
            for (var i = 0; i < count; i++) {
                result.push({ 
                    x: trips[i].trip_distance || 0, 
                    y: trips[i].fare_amount || 0 
                });
            }
            return result;
        } catch (error) {
            console.error('Error fetching fare vs distance:', error);
            return [];
        }
    },

    getPaymentSplit: async function() {
        var cached = DataStore.load('payment');
        if (cached) {
            console.log('Using cached payment data');
            return cached;
        }
        
        console.log('Fetching fresh payment data');
        
        try {
            var rows = await apiGet('/summary/payment');
            var total = 0;
            for (var i = 0; i < rows.length; i++) {
                total += rows[i].trip_count;
            }
            
            var labels = [];
            var data = [];
            for (var i = 0; i < rows.length; i++) {
                var label = PAYMENT_LABELS[rows[i].payment_type] || 'Type ' + rows[i].payment_type;
                labels.push(label);
                data.push(+(rows[i].trip_count / total * 100).toFixed(1));
            }
            
            var result = { labels: labels, data: data };
            DataStore.save('payment', result);
            return result;
        } catch (error) {
            console.error('Error fetching payment data:', error);
            var result = { labels: ['No data'], data: [100] };
            DataStore.save('payment', result);
            return result;
        }
    },

    getTrips: async function(filters = {}) {
        var params = {
            date: filters.date || undefined,
            borough: filters.borough && filters.borough !== 'all' ? filters.borough : undefined,
            min_fare: filters.minFare || undefined,
            max_fare: filters.maxFare !== Infinity ? filters.maxFare : undefined,
            min_distance: filters.minDistance || undefined,
            max_distance: filters.maxDistance !== Infinity ? filters.maxDistance : undefined,
            time_of_day: filters.hour && filters.hour !== 'all' && filters.hour !== 'evening'
                ? filters.hour
                : undefined,
        };

        try {
            var rows = await apiGet('/trips', params);
            var result = [];
            for (var i = 0; i < rows.length; i++) {
                var t = rows[i];
                result.push({
                    pickup: t.pickup_datetime || '',
                    dropoff: t.dropoff_datetime || '',
                    pu_zone: t.pickup_zone || '-',
                    do_zone: t.dropoff_zone || '-',
                    distance: t.trip_distance || 0,
                    fare: t.fare_amount || 0,
                    tip: t.tip_amount || 0,
                    total: t.total_amount || 0,
                });
            }
            return result;
        } catch (error) {
            console.error('Error fetching trips:', error);
            return [];
        }
    },

    getZones: function(metric, borough) {
        return apiGet('/zones', { metric: metric, borough: borough });
    }
};

window.DataAPI = DataAPI;
window.DataStore = DataStore;

console.log('DataAPI loaded with caching');
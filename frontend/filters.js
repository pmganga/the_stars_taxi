// frontend/filters.js


(function () {
    var DEBOUNCE_MS = 400;
    var debounceTimer = null;
    var lastFilteredTrips = [];

    var ids = {
        date: 'global-date',
        borough: 'borough-filter',
        minFare: 'min-fare',
        maxFare: 'max-fare',
        minDistance: 'min-distance',
        maxDistance: 'max-distance',
        hour: 'hour-filter',
        applyBtn: 'apply-filters-btn',
        resetBtn: 'reset-filters-btn',
        exportBtn: 'export-csv-btn',
    };

    // Defaults used by the reset button.
    var defaults = {
        date: '2019-01-15',
        borough: 'all',
        minFare: '0',
        maxFare: '600',
        minDistance: '0',
        maxDistance: '50',
        hour: 'all',
    };

    function el(id) {
        return document.getElementById(id);
    }

    // Reads the panel and returns the shape DataAPI.getTrips() expects:
    // { date, borough, minFare, maxFare, minDistance, maxDistance, hour }
    function readFilters() {
        return {
            date: el(ids.date) ? el(ids.date).value : '',
            borough: el(ids.borough) ? el(ids.borough).value : 'all',
            minFare: el(ids.minFare) && el(ids.minFare).value !== ''
                ? Number(el(ids.minFare).value) : 0,
            maxFare: el(ids.maxFare) && el(ids.maxFare).value !== ''
                ? Number(el(ids.maxFare).value) : Infinity,
            minDistance: el(ids.minDistance) && el(ids.minDistance).value !== ''
                ? Number(el(ids.minDistance).value) : 0,
            maxDistance: el(ids.maxDistance) && el(ids.maxDistance).value !== ''
                ? Number(el(ids.maxDistance).value) : Infinity,
            hour: el(ids.hour) ? el(ids.hour).value : 'all',
        };
    }

    function setTableLoading(message) {
        var tbody = document.querySelector('#trips-table tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="8" class="trips-table__loading">' + message + '</td></tr>';
        }
    }

    // Fetches with the current panel state and re-renders the table.
    function applyFilters() {
        setTableLoading('Loading trip data...');

        var filters = readFilters();

        DataAPI.getTrips(filters)
            .then(function (trips) {
                lastFilteredTrips = trips || [];
                renderTripsTable(lastFilteredTrips);
            })
            .catch(function (err) {
                setTableLoading('Could not load trips: ' + err.message);
            });
    }

    function resetFilters() {
        if (el(ids.date)) el(ids.date).value = defaults.date;
        if (el(ids.borough)) el(ids.borough).value = defaults.borough;
        if (el(ids.minFare)) el(ids.minFare).value = defaults.minFare;
        if (el(ids.maxFare)) el(ids.maxFare).value = defaults.maxFare;
        if (el(ids.minDistance)) el(ids.minDistance).value = defaults.minDistance;
        if (el(ids.maxDistance)) el(ids.maxDistance).value = defaults.maxDistance;
        if (el(ids.hour)) el(ids.hour).value = defaults.hour;

        applyFilters();
    }

    function applyFiltersDebounced() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(applyFilters, DEBOUNCE_MS);
    }

    // Builds a CSV from whatever's currently in lastFilteredTrips 
    function exportCsv() {
        if (!lastFilteredTrips.length) {
            alert('No trips to export - apply a filter first.');
            return;
        }

        var headers = ['pickup', 'dropoff', 'pu_zone', 'do_zone', 'distance', 'fare', 'tip', 'total'];
        var rows = [headers.join(',')];

        for (var i = 0; i < lastFilteredTrips.length; i++) {
            var t = lastFilteredTrips[i];
            var row = headers.map(function (key) {
                var value = t[key] !== undefined && t[key] !== null ? String(t[key]) : '';
                // Quote any value containing a comma so the CSV doesn't break.
                return value.indexOf(',') !== -1 ? '"' + value + '"' : value;
            });
            rows.push(row.join(','));
        }

        var blob = new Blob([rows.join('\n')], { type: 'text/csv' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'filtered_trips.csv';
        link.click();
        URL.revokeObjectURL(url);
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (el(ids.applyBtn)) el(ids.applyBtn).addEventListener('click', applyFilters);
        if (el(ids.resetBtn)) el(ids.resetBtn).addEventListener('click', resetFilters);
        if (el(ids.exportBtn)) el(ids.exportBtn).addEventListener('click', exportCsv);

        // Dropdowns: apply right away, no point debouncing a select.
        if (el(ids.borough)) el(ids.borough).addEventListener('change', applyFilters);
        if (el(ids.hour)) el(ids.hour).addEventListener('change', applyFilters);

        // Number inputs: debounce so typing "150" doesn't fire 3 fetches.
        [ids.minFare, ids.maxFare, ids.minDistance, ids.maxDistance].forEach(function (id) {
            if (el(id)) el(id).addEventListener('input', applyFiltersDebounced);
        });
    });
})();

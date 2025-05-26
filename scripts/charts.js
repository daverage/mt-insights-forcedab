window.renderGoalMetricChart = function(controlData, experimentData, selectedGoal, dateRange) {
    const chartContainer = document.getElementById('goalMetricChartContainer');
    const canvas = document.getElementById('myGoalChart');
    if (!chartContainer || !canvas) return;
    if (window._goalMetricChartInstance) {
        window._goalMetricChartInstance.destroy();
        window._goalMetricChartInstance = null;
    }
    function parseDate(row) {
        const dateKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'offer date' || k.trim().toLowerCase() === 'date');
        if (!dateKey) return null;
        const dateStr = row[dateKey]; if (!dateStr) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return dateStr.trim();
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr.trim())) {
            const [d, m, y] = dateStr.trim().split('/');
            return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
        }
        return null;
    }

    // Build data arrays for Chart.js
    function groupByDay(data) {
        const grouped = {};
        data.forEach(row => {
            const date = parseDate(row);
            if (!date) return;
            if (dateRange && ((date < dateRange.start) || (date > dateRange.end))) return;
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(row);
        });
        return grouped;
    }
    function aggregateMetric(grouped, metric, isPercent) {
        const labels = Object.keys(grouped).sort();
        const values = labels.map(date => {
            const rows = grouped[date];
            const vals = rows.map(r => parseMetricValue(r[metric])).filter(v => v !== null && !isNaN(v));
            if (!vals.length) return null;
            let avg = vals.reduce((a, b) => a + b, 0) / vals.length;
            if (isPercent) avg = avg * 100; // Convert to percent for display
            return isNaN(avg) ? null : avg;
        });
        return { labels, values };
    }
    const isPercent = selectedGoal.trim().toLowerCase().includes('rate') || selectedGoal.trim().toLowerCase().includes('conversion') || selectedGoal.trim().toLowerCase().includes('add to cart') || selectedGoal.trim().toLowerCase().includes('abandonment');
    const groupedControl = groupByDay(controlData);
    const groupedExperiment = groupByDay(experimentData);
    const controlAgg = aggregateMetric(groupedControl, selectedGoal, isPercent);
    const experimentAgg = aggregateMetric(groupedExperiment, selectedGoal, isPercent);
    if ((!controlAgg.labels.length || controlAgg.values.every(v => v == null)) && (!experimentAgg.labels.length || experimentAgg.values.every(v => v == null))) {
        chartContainer.style.display = 'none';
        return;
    }
    chartContainer.style.display = '';
    const allLabels = Array.from(new Set([...controlAgg.labels, ...experimentAgg.labels])).sort();
    const controlVals = allLabels.map(l => {
        const idx = controlAgg.labels.indexOf(l);
        return idx !== -1 ? controlAgg.values[idx] : null;
    });
    const experimentVals = allLabels.map(l => {
        const idx = experimentAgg.labels.indexOf(l);
        return idx !== -1 ? experimentAgg.values[idx] : null;
    });
    window._goalMetricChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: allLabels,
            datasets: [
                {
                    label: 'Control',
                    data: controlVals,
                    borderColor: '#2196f3',
                    backgroundColor: 'rgba(33,150,243,0.1)',
                    spanGaps: true
                },
                {
                    label: 'Experiment',
                    data: experimentVals,
                    borderColor: '#f44336',
                    backgroundColor: 'rgba(244,67,54,0.1)',
                    spanGaps: true
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: true },
                title: { display: true, text: `Trend for ${selectedGoal}` }
            },
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { title: { display: true, text: 'Date' } },
                y: {
                    title: { display: true, text: selectedGoal },
                    ticks: isPercent ? {
                        callback: function(value) { return value + '%'; }
                    } : undefined
                }
            }
        }
    });
};

window.showGoalMetricTrendChart = function(currentAnalysisMode, selectedGoal, controlData, experimentData, scenarioDetails) {
    const chartContainer = document.getElementById('goalMetricChartContainer');
    if (!selectedGoal || !controlData || !experimentData) {
        if (chartContainer) chartContainer.style.display = 'none';
        return;
    }
    let dateRange = null;
    if (currentAnalysisMode === 'smartAB' && scenarioDetails && scenarioDetails.overlapStartDate && scenarioDetails.overlapEndDate) {
        dateRange = { start: scenarioDetails.overlapStartDate, end: scenarioDetails.overlapEndDate };
    }
    if (typeof window.renderGoalMetricChart === 'function') {
        window.renderGoalMetricChart(controlData, experimentData, selectedGoal, dateRange);
    }
};
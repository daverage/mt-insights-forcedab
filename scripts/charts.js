window.renderGoalMetricChart = function(controlData, experimentData, selectedGoal, dateRange, scenario = null) {
    const chartContainer = document.getElementById('goalMetricChartContainer');
    const canvas = document.getElementById('myGoalChart');
    if (!chartContainer || !canvas) return;
      if (window._goalMetricChartInstance) {
        window._goalMetricChartInstance.destroy();
        window._goalMetricChartInstance = null;
    }

    // Check if data is sequential (non-overlapping)
    const isSequential = scenario === 'SEQUENTIAL_NO_OVERLAP';
    
    if (isSequential) {
        // For sequential data, align on relative timeline
        return renderSequentialAlignedChart(controlData, experimentData, selectedGoal, getDateFromRow, chartContainer, canvas);
    } else {
        // For overlapping data, use original date-based charting
        return renderOverlappingChart(controlData, experimentData, selectedGoal, dateRange, getDateFromRow, chartContainer, canvas);
    }
};

// Chart for sequential (non-overlapping) data with relative alignment
function renderSequentialAlignedChart(controlData, experimentData, selectedGoal, getDateFromRowFn, chartContainer, canvas) {
    function getRelativeDataPoints(data, alignmentType = 'day') {
        const sortedData = data
            .map(row => ({ row, date: getDateFromRowFn(row) }))
            .filter(item => item.date)
            .sort((a, b) => a.date - b.date);
            
        if (!sortedData.length) return { labels: [], values: [] };
        
        const startDate = sortedData[0].date;
        const labels = [];
        const values = [];
        
        sortedData.forEach(({ row, date }) => {
            let relativeLabel;
            const daysDiff = Math.floor((date - startDate) / (1000 * 60 * 60 * 24));
            
            switch (alignmentType) {
                case 'week':
                    const weekNum = Math.floor(daysDiff / 7) + 1;
                    relativeLabel = `Week ${weekNum}`;
                    break;
                case 'month':
                    const monthNum = Math.floor(daysDiff / 30) + 1;
                    relativeLabel = `Month ${monthNum}`;
                    break;
                default: // 'day'
                    relativeLabel = `Day ${daysDiff + 1}`;
            }
              const metricValue = parseMetricValue(getCleanedValue(row, selectedGoal));
            if (metricValue !== null && !isNaN(metricValue)) {
                const isPercent = selectedGoal.trim().toLowerCase().includes('rate') || 
                                selectedGoal.trim().toLowerCase().includes('conversion') || 
                                selectedGoal.trim().toLowerCase().includes('add to cart') || 
                                selectedGoal.trim().toLowerCase().includes('abandonment');
                                
                labels.push(relativeLabel);
                values.push(isPercent ? metricValue * 100 : metricValue);
            }
        });
        
        return { labels, values };
    }
    
    // Create alignment selector if it doesn't exist
    window.createAlignmentSelector(chartContainer);
    
    const alignmentType = window.getSelectedAlignment() || 'day';
    const controlData_rel = getRelativeDataPoints(controlData, alignmentType);
    const experimentData_rel = getRelativeDataPoints(experimentData, alignmentType);
    
    if ((!controlData_rel.labels.length || controlData_rel.values.every(v => v == null)) && 
        (!experimentData_rel.labels.length || experimentData_rel.values.every(v => v == null))) {
        chartContainer.style.display = 'none';
        return;
    }
    
    chartContainer.style.display = '';
    
    // Create unified relative timeline
    const maxControlPoints = Math.max(...(controlData_rel.labels.map(l => parseInt(l.split(' ')[1]) || 0)));
    const maxExperimentPoints = Math.max(...(experimentData_rel.labels.map(l => parseInt(l.split(' ')[1]) || 0)));
    const maxPoints = Math.max(maxControlPoints, maxExperimentPoints);
    
    const allLabels = [];
    for (let i = 1; i <= maxPoints; i++) {
        const label = alignmentType === 'week' ? `Week ${i}` : 
                     alignmentType === 'month' ? `Month ${i}` : `Day ${i}`;
        allLabels.push(label);
    }
    
    // Map data to unified timeline
    const controlVals = allLabels.map(label => {
        const idx = controlData_rel.labels.indexOf(label);
        return idx !== -1 ? controlData_rel.values[idx] : null;
    });
    
    const experimentVals = allLabels.map(label => {
        const idx = experimentData_rel.labels.indexOf(label);
        return idx !== -1 ? experimentData_rel.values[idx] : null;
    });
    
    const isPercent = selectedGoal.trim().toLowerCase().includes('rate') || 
                     selectedGoal.trim().toLowerCase().includes('conversion') || 
                     selectedGoal.trim().toLowerCase().includes('add to cart') || 
                     selectedGoal.trim().toLowerCase().includes('abandonment');
    
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
                    spanGaps: true,
                    fill: false
                },
                {
                    label: 'Experiment', 
                    data: experimentVals,
                    borderColor: '#f44336',
                    backgroundColor: 'rgba(244,67,54,0.1)',
                    spanGaps: true,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: true },
                title: { 
                    display: true, 
                    text: `Sequential Trend Comparison: ${selectedGoal} (${alignmentType.charAt(0).toUpperCase() + alignmentType.slice(1)}-Aligned)`
                }
            },
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { 
                    title: { 
                        display: true, 
                        text: `Relative ${alignmentType.charAt(0).toUpperCase() + alignmentType.slice(1)}` 
                    } 
                },
                y: {
                    title: { display: true, text: selectedGoal },
                    ticks: isPercent ? {
                        callback: function(value) { return value + '%'; }
                    } : undefined
                }
            }
        }
    });
}

// Chart for overlapping data (original functionality)
function renderOverlappingChart(controlData, experimentData, selectedGoal, dateRange, getDateFromRowFn, chartContainer, canvas) {

    // Build data arrays for Chart.js
    function groupByDay(data) {
        const grouped = {};
        data.forEach(row => {
            const date = getDateFromRowFn(row);
            if (!date) return;
            if (dateRange && ((date < dateRange.start) || (date > dateRange.end))) return;
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(row);
        });
        return grouped;
    }
    function aggregateMetric(grouped, metric, isPercent) {
        const labels = Object.keys(grouped).sort();        const values = labels.map(date => {
            const rows = grouped[date];
            const vals = rows.map(r => parseMetricValue(getCleanedValue(r, metric))).filter(v => v !== null && !isNaN(v));
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

window.showGoalMetricTrendChart = function(currentAnalysisMode, selectedGoal, controlData, experimentData, scenarioDetails, scenario = null) {
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
        window.renderGoalMetricChart(controlData, experimentData, selectedGoal, dateRange, scenario);
    }
};

// Alignment selector functions for sequential charts
window.createAlignmentSelector = function(chartContainer) {
    // Check if chartContainer exists and alignment selector already exists
    if (!chartContainer || chartContainer.querySelector('.alignment-selector')) {
        return;
    }
    
    const selectorDiv = document.createElement('div');
    selectorDiv.className = 'alignment-selector';
    selectorDiv.style.cssText = 'margin-bottom: 10px; text-align: center;';
    
    const label = document.createElement('label');
    label.textContent = 'Alignment: ';
    label.style.marginRight = '10px';
    
    const select = document.createElement('select');
    select.id = 'timelineAlignment';
    select.style.cssText = 'padding: 5px; border: 1px solid #ccc; border-radius: 4px;';
    
    const options = [
        { value: 'day', text: 'Day-by-Day' },
        { value: 'week', text: 'Week-by-Week' },
        { value: 'month', text: 'Month-by-Month' }
    ];
    
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        select.appendChild(option);
    });
    
    // Add change handler to re-render chart when alignment changes
    select.addEventListener('change', function() {
        // Trigger chart re-render - this will be handled by the chart rendering logic
        const event = new CustomEvent('alignmentChanged', { detail: { alignment: this.value } });
        window.dispatchEvent(event);
    });
    
    selectorDiv.appendChild(label);
    selectorDiv.appendChild(select);
    chartContainer.insertBefore(selectorDiv, chartContainer.firstChild);
};

window.getSelectedAlignment = function() {
    const selector = document.getElementById('timelineAlignment');
    return selector ? selector.value : 'day';
};
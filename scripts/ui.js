// --- Core Functions ---
function handleFileSelect() {
    const controlFile = controlFileInput.files[0];
    const experimentFile = experimentFileInput.files[0];
    runButton.disabled = true; goalDropdown.disabled = true;
    goalDropdown.innerHTML = '<option value="">-- Select Goal --</option>';
    controlDailyData = null; experimentDailyData = null; originalControlDailyData = null; originalExperimentDailyData = null;
    metricHeaders = []; controlSessionsEl.textContent = 'N/A'; experimentSessionsEl.textContent = 'N/A';
    sessionWarningEl.style.display = 'none'; exportButton.style.display = 'none';
    document.querySelector("#comparisonTable tbody").innerHTML = '';
    caveatsEl.style.display = 'none'; caveatsEl.innerHTML = '';
    analysisScenario = null; analysisDetails = {};


    if (controlFile && experimentFile) {
        showLoader('Parsing files and analyzing date ranges...');
        Promise.all([
            parseCSVFromFile(controlFile),
            parseCSVFromFile(experimentFile)
        ]).then(([controlResult, experimentResult]) => {
            // Store original, unaligned daily data
            originalControlDailyData = controlResult.dailyData;
            originalExperimentDailyData = experimentResult.dailyData;

            // Store skipped date row counts in analysisDetails
            analysisDetails.controlSkippedDateRows = controlResult.skippedDateRows || 0;
            analysisDetails.experimentSkippedDateRows = experimentResult.skippedDateRows || 0;

            if (!originalControlDailyData || !originalControlDailyData.length ||
                !originalExperimentDailyData || !originalExperimentDailyData.length) {
                updateLoaderStatus('Error: One or both files lack valid daily data rows.');
                setTimeout(hideLoader, 2000);
                analysisScenario = 'NO_DATA'; // Custom scenario for no data
                analysisDetails = { message: 'One or both files lack valid daily data rows.' };
                displayAnalysisCaveats(analysisScenario, analysisDetails);
                return;
            }

            // For initial display, use date-aligned data as would be used by default 'smartAB' mode
            const strategyResult = determineAnalysisStrategyAndPrepareData(originalControlDailyData, originalExperimentDailyData);
            analysisScenario = strategyResult.scenario; // Store the "default" scenario (for Smart A/B)
            analysisDetails = { ...analysisDetails, ...strategyResult.details };
            displayAnalysisCaveats(analysisScenario, analysisDetails, 'smartAB'); // Display initial caveats as if for Smart A/B

            // Use processed data for session counts and metric headers (for default smartAB mode)
            const controlTotalSessionsForDisplay = aggregateSessions(strategyResult.processedControlData);
            const experimentTotalSessionsForDisplay = aggregateSessions(strategyResult.processedExperimentData);
            controlSessionsEl.textContent = controlTotalSessionsForDisplay ? parseFloat(controlTotalSessionsForDisplay).toLocaleString() : 'N/A';
            experimentSessionsEl.textContent = experimentTotalSessionsForDisplay ? parseFloat(experimentTotalSessionsForDisplay).toLocaleString() : 'N/A';

            // Session warning logic (unchanged)
            const cSess = parseFloat(controlTotalSessionsForDisplay);
            const eSess = parseFloat(experimentTotalSessionsForDisplay);
            if (cSess && eSess && (cSess / eSess > 1.5 || cSess / eSess < 0.66)) {
                sessionWarningEl.style.display = 'block';
            } else {
                sessionWarningEl.style.display = 'none';
            }

            // Metric headers for dropdown (from aligned data)
            if (strategyResult.processedControlData.length > 0 && strategyResult.processedExperimentData.length > 0) {
                const experimentMetricsKeys = Object.keys(strategyResult.processedExperimentData[0] || {}).map(k => k.trim().toLowerCase());
                metricHeaders = Object.keys(strategyResult.processedControlData[0] || {})
                    .filter(k => {
                        const keyLower = k.trim().toLowerCase();
                        return experimentMetricsKeys.includes(keyLower) && !['offer date', 'sessions'].includes(keyLower);
                    });
            } else {
                metricHeaders = []; // Safety net
            }

            if (metricHeaders.length > 0) {
                populateGoalDropdown(metricHeaders);
                runButton.disabled = false;
                updateLoaderStatus('Files loaded. Date ranges analyzed. Ready for analysis.');
            } else {
                runButton.disabled = true;
                if (analysisScenario !== 'NO_VALID_DATES' && analysisScenario !== 'INSUFFICIENT_DATA_AFTER_PROCESSING' && analysisScenario !== 'NO_DATA') {
                    updateLoaderStatus('Error: No common metrics found or essential columns missing after data processing.');
                } else {
                    updateLoaderStatus(analysisDetails.message || 'Error preparing data for analysis.');
                }
            }
            setTimeout(hideLoader, 1500);
        }).catch(error => {
            updateLoaderStatus(`Error processing files: ${error.message}`);
            console.error(error);
            analysisScenario = 'FILE_PARSE_ERROR';
            analysisDetails = { message: `Error parsing files: ${error.message}`};
            displayAnalysisCaveats(analysisScenario, analysisDetails);
            setTimeout(hideLoader, 3000);
        });
    } else {
        hideLoader();
    }
}
function populateGoalDropdown(metrics) {
    goalDropdown.innerHTML = '<option value="">-- Select Goal --</option>';
    metrics.forEach(metric => {
        const option = document.createElement('option'); option.value = metric; option.textContent = metric;
        goalDropdown.appendChild(option);
    });
    goalDropdown.disabled = false;
    if (metrics.length > 0) {
            selectedGoal = metrics[0];
            goalDropdown.value = selectedGoal;
    }
}
function scrollToExportButton() {
    const btn = document.getElementById('exportCsvBtn');
    if (btn && btn.offsetParent !== null) { // Check if button is visible
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}


function formatAbsoluteChangeForDisplay(metricName, value) {
    if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) return "N/A";
    const prefix = value >= 0 ? "+" : ""; // Keep + for positive changes
    const absValue = value; // Use actual value for formatting, not Math.abs yet
    const metricNameLower = metricName.trim().toLowerCase();

    if (metricNameLower.includes("rate") || metricNameLower.includes("conversion") || metricNameLower.includes("add to cart") || metricNameLower.includes("abandonment")) {
        // For percentage metrics, absolute change is in percentage points (pp)
        return `${prefix}${(value * 100).toFixed(2)} pp`; // Use 'pp' to denote percentage points
    }
    if (metricNameLower.includes("revenue") || metricNameLower.includes("value")) {
        return `${prefix}£${value.toFixed(2)}`;
    }
    if (metricNameLower.includes("time")) {
        const sign = value >= 0 ? "+" : "-";
        const val = Math.abs(value);
        const totalSeconds = Math.round(val); const mins = Math.floor(totalSeconds / 60); const secs = totalSeconds % 60;
        return `${sign}${mins}m ${secs}s`;
    }
    if (metricNameLower.includes("page views")) {
        return `${prefix}${value.toFixed(2)}`;
    }
    return `${prefix}${value.toFixed(3)}`;
}

 function displayMetrics(resultsData) {
    const tableBody = document.querySelector("#comparisonTable tbody");
    tableBody.innerHTML = '';
    // Get selected goal from dropdown
    const selectedGoal = document.getElementById('goalSelect').value;
    if (!resultsData || resultsData.length === 0) {
        const row = tableBody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 7; // Match number of columns
        cell.textContent = "No metrics processed or available for display. Please check caveats and input files.";
        cell.style.textAlign = "center";
        return;
    }

    // Sort results (example, your sorting logic might be here)
    resultsData.sort((a, b) => {
        if (a.isSignificant !== b.isSignificant) return b.isSignificant - a.isSignificant;
        // ... your existing sorting logic ...
        return (b.absLift || 0) - (a.absLift || 0); // Fallback sort
    });


    resultsData.forEach(res => {
        const row = document.createElement('tr');
        const isGoal = res.metric === selectedGoal;
        row.className = isGoal ? 'highlight-goal' : '';

        // --- Quick Compare Mode Specific Rendering ---
        if (res._basicModeUsed === 'quick_compare') {
            let uncertaintyCellContent = res.uncertaintyString; // Should be "N/A (Descriptive Comparison)"
            let significanceCellContent = 'N/A';
            const formattedAbsChange = formatAbsoluteChangeForDisplay(res.metric, res.absoluteChange);
            let formattedRelChange = "N/A";
            if (res.relativeChangePercent !== null && !isNaN(res.relativeChangePercent) && isFinite(res.relativeChangePercent)) {
                formattedRelChange = `${res.relativeChangePercent >= 0 ? '+' : ''}${res.relativeChangePercent.toFixed(2)}% ${res.icon || ''}`;
            } else if (isFinite(res.relativeChangePercent)) {
                formattedRelChange = `0.00% ${res.icon || ''}`;
            }

            row.innerHTML = `
                <td>${res.metric}</td>
                <td>${res.controlValFormatted}</td>
                <td>${res.experimentValFormatted}</td>
                <td>${formattedAbsChange}</td>
                <td>${formattedRelChange}</td>
                <td>${uncertaintyCellContent}</td>
                <td>${significanceCellContent}</td>
            `;
            tableBody.appendChild(row);
            return; // Continue to next result for quick_compare
        }

        // --- Smart A/B Mode Rendering (or any mode not 'quick_compare') ---
        let metricStar = '';
        // Adjusted condition: Show star if significant AND not in a scenario where significance is invalid
        const isSignificanceApplicable = !(res.analysisScenario === 'SEQUENTIAL_NO_OVERLAP' || 
                                            res.uncertaintyString === "N/A (Insufficient Data)" ||
                                            res.uncertaintyString === "N/A (Sequential Data)");

        if (res.isSignificant && isSignificanceApplicable) {
            metricStar = ' <span class="metric-star" title="Statistically Significant">⭐</span>';
        }

        let uncertaintyCellContent = res.uncertaintyString;
        let significanceCellContent;
        const alpha = 0.05; // Assuming hardcoded alpha for display consistency

        if (!isSignificanceApplicable || res.uncertaintyString === "N/A (Insufficient Data)" || res.uncertaintyString === "N/A (Sequential Data)") {
            significanceCellContent = "N/A";
            if (res.uncertaintyString === "N/A (Sequential Data)") uncertaintyCellContent = "N/A (Sequential Data)";
            else if (res.uncertaintyString === "N/A (Insufficient Data)") uncertaintyCellContent = "N/A (Insufficient Data)";

        } else {
            significanceCellContent = res.isSignificant
                ? `Yes (${((1 - alpha) * 100).toFixed(0)}%)`
                : 'No';
        }

        // Tooltip for Smart A/B (Optimized View)
        // _isOptimizedViewRun should be true for Smart A/B results
        if (res._isOptimizedViewRun) {
            let supplementalInfoParts = [];
            if (res._ttestResult && res._ttestResult.confidenceFormatted && res._ttestResult.confidenceFormatted !== "N/A (Insufficient Data)") {
                supplementalInfoParts.push(`T-Test P-val: ${res._ttestResult.confidenceFormatted.replace('P: ','')}`);
            }
            if (res._mdeValue !== null && typeof res._mdeValue !== 'undefined') {
                supplementalInfoParts.push(`MDE: ±${res._mdeValue.toFixed(1)}%`);
            }
            if (res._bayesianResult && res._bayesianResult.type === 'rate' && res._bayesianResult.probExpBetter !== null) {
                supplementalInfoParts.push(`Bayes P(Exp>Ctrl): ${(res._bayesianResult.probExpBetter * 100).toFixed(1)}%`);
                supplementalInfoParts.push(`Bayes Lift CI: [${(res._bayesianResult.credibleIntervalLower * 100).toFixed(1)}%, ${(res._bayesianResult.credibleIntervalUpper * 100).toFixed(1)}%]`);
            }
            if (supplementalInfoParts.length > 0) {
                const tooltipText = supplementalInfoParts.join(' | ').replace(/"/g, '"'); // Use "
                uncertaintyCellContent += ` <span class="info-icon" title="${tooltipText}" style="cursor:help; color:blue; font-weight:bold;">ℹ️</span>`;
            }
        }
        
        const formattedAbsChange = formatAbsoluteChangeForDisplay(res.metric, res.absoluteChange);
        let formattedRelChange = "N/A";
        if (res.relativeChangePercent !== null && !isNaN(res.relativeChangePercent) && isFinite(res.relativeChangePercent)) {
            formattedRelChange = `${res.relativeChangePercent >= 0 ? '+' : ''}${res.relativeChangePercent.toFixed(2)}%`;
        } else if (isFinite(res.relativeChangePercent)) {
            formattedRelChange = `0.00%`;
        }

        // Set icon for direction (arrows) for Smart A/B
        let icon = '';
        const NEGATIVE_IS_GOOD_METRICS = [
            'bounce rate', 'abandonment rate', 'exit rate', 'cart abandonment', 'error rate', 'avg. time to error', 'average time to error', 'average time to failure', 'avg. time to failure'
        ];
        if (res.relativeChangePercent !== null && !isNaN(res.relativeChangePercent) && isFinite(res.relativeChangePercent)) {
            const metricKeyLower = res.metric.toLowerCase().trim();
            if (NEGATIVE_IS_GOOD_METRICS.includes(metricKeyLower)) {
                if (res.relativeChangePercent < 0) icon = '<span class="significant-icon lift-up">▼</span>';
                else if (res.relativeChangePercent > 0) icon = '<span class="significant-icon lift-down">▲</span>';
                else icon = '<span class="significant-icon" style="font-weight:1000;color: goldenrod;">–</span>';
            } else {
                if (res.relativeChangePercent > 0) icon = '<span class="significant-icon lift-up">▲</span>';
                else if (res.relativeChangePercent < 0) icon = '<span class="significant-icon lift-down">▼</span>';
                else icon = '<span class="significant-icon" style="font-weight:1000;color: goldenrod;">–</span>';
            }
        }
        res.icon = icon;
        formattedRelChange += ` ${icon}`;

        row.innerHTML = `
            <td>${res.metric}</td>
            <td>${res.controlValFormatted}</td>
            <td>${res.experimentValFormatted}</td>
            <td>${formattedAbsChange}</td>
            <td>${formattedRelChange}</td>
            <td>${uncertaintyCellContent}${metricStar}</td>
            <td>${significanceCellContent}</td>
        `;
        tableBody.appendChild(row);
    });
}
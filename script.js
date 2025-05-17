document.addEventListener('DOMContentLoaded', () => {
    let controlDailyData = null;
    let experimentDailyData = null;
    let controlFileSummary = null;
    let experimentFileSummary = null;
    let selectedGoal = null;
    let metricHeaders = [];

    const controlFileInput = document.getElementById('controlFile');
    const experimentFileInput = document.getElementById('experimentFile');
    const runButton = document.getElementById('runAnalysisBtn');
    const exportButton = document.getElementById('exportCsvBtn');
    const goalDropdown = document.getElementById('goalSelect');
    const analysisModeSelect = document.getElementById('analysisMode');
    const bootstrapOptionsDiv = document.getElementById('bootstrapOptions');
    const bootstrapIterationsInput = document.getElementById('bootstrapIterations');
    const useSessionWeightingCheckbox = document.getElementById('useSessionWeighting');
    const confidenceLevelSelect = document.getElementById('confidenceLevel');

    const sessionWarningEl = document.getElementById('sessionWarning');
    const loaderOverlay = document.getElementById('loaderOverlay');
    const loaderStatusEl = document.getElementById('loaderStatus');
    const controlSessionsEl = document.getElementById('controlSessions');
    const experimentSessionsEl = document.getElementById('experimentSessions');

    function showLoader(message = "Processing...") {
        loaderStatusEl.textContent = message;
        loaderOverlay.style.display = 'flex';
    }
    function hideLoader() {
        loaderOverlay.style.display = 'none';
    }
    function updateLoaderStatus(message) {
        if (loaderOverlay.style.display === 'flex') {
            loaderStatusEl.textContent = message;
        }
    }

    // --- Helper Functions ---
    function getCleanedValue(row, keyName) {
        if (!row) return null;
        const matchedKey = Object.keys(row).find(k => k.trim().toLowerCase() === keyName.toLowerCase());
        return matchedKey ? row[matchedKey] : null;
    }

    function parseValue(val) {
        if (val == null) return 0;
        if (typeof val === 'string') {
            const trimmed = val.trim();
            if (trimmed === '') return 0;
            if (trimmed.includes('%')) return parseFloat(trimmed.replace('%', '')) / 100;
            const num = parseFloat(trimmed.replace(/[^0-9.-]+/g, ''));
            return isNaN(num) ? 0 : num;
        }
        if (typeof val === 'number') return val;
        return 0;
    }

    function aggregateSessions(data) {
        return data.reduce((sum, row) => sum + parseValue(getCleanedValue(row, 'Sessions')), 0); // Use getCleanedValue here
    }

    function bootstrapMetric(controlData, experimentData, metricKey, iterations = 3000, alpha = 0.05) {
        const controlTotalOriginalSessions = aggregateSessions(controlData); // Total sessions from original data
        const expTotalOriginalSessions = aggregateSessions(experimentData);   // Total sessions from original data
        const lifts = [];

        for (let i = 0; i < iterations; i++) {
            // Resample days with replacement
            const sampledControlDays = Array.from({ length: controlData.length }, () => controlData[Math.floor(Math.random() * controlData.length)]);
            const sampledExpDays = Array.from({ length: experimentData.length }, () => experimentData[Math.floor(Math.random() * experimentData.length)]);

            // Calculate sum of (metric * sessions) for resampled days
            const controlSumProduct = sampledControlDays.reduce((sum, row) => sum + parseValue(getCleanedValue(row, metricKey)) * parseValue(getCleanedValue(row, 'Sessions')), 0);
            const expSumProduct = sampledExpDays.reduce((sum, row) => sum + parseValue(getCleanedValue(row, metricKey)) * parseValue(getCleanedValue(row, 'Sessions')), 0);

            // Calculate the overall metric for this bootstrap sample (session-weighted average)
            const controlMetricValue = controlTotalOriginalSessions > 0 ? controlSumProduct / controlTotalOriginalSessions : 0;
            const expMetricValue = expTotalOriginalSessions > 0 ? expSumProduct / expTotalOriginalSessions : 0;

            if (controlMetricValue !== 0) {
                lifts.push((expMetricValue - controlMetricValue) / controlMetricValue);
            } else if (expMetricValue > 0) {
                lifts.push(Infinity);
            } else {
                lifts.push(0); // Both are zero or control is zero and exp is not positive
            }
        }
        lifts.sort((a, b) => a - b);
        const lowerIdx = Math.floor((alpha / 2) * iterations);
        const upperIdx = Math.floor((1 - alpha / 2) * iterations) -1; // -1 for 0-based index and upper percentile
        
        // Ensure indices are within bounds
        const safeLowerIdx = Math.max(0, Math.min(lowerIdx, lifts.length - 1));
        const safeUpperIdx = Math.max(0, Math.min(upperIdx, lifts.length - 1));
        const medianIdx = Math.floor(lifts.length / 2); // Correct median index

        const medianLift = lifts.length > 0 ? lifts[medianIdx] : 0;
        const lowerBoundLift = lifts.length > 0 ? lifts[safeLowerIdx] : 0;
        const upperBoundLift = lifts.length > 0 ? lifts[safeUpperIdx] : 0;

        return {
            lift: medianLift,
            lowerBound: lowerBoundLift,
            upperBound: upperBoundLift,
            significant: (lowerBoundLift > 0 && upperBoundLift > 0) || (lowerBoundLift < 0 && upperBoundLift < 0) // CI does not cross zero
        };
    }

    function benjaminiHochberg(pValues, alpha = 0.05) {
        const m = pValues.length;
        if (m === 0) return [];
        const sorted = pValues
            .map((p, idx) => ({ p, originalIndex: idx }))
            .sort((a, b) => a.p - b.p);

        const adjustedSignificance = Array(m).fill(false);
        let maxK = -1;
        for (let k = 0; k < m; k++) {
            if (sorted[k].p <= ((k + 1) / m) * alpha) {
                maxK = k;
            }
        }

        for (let k = 0; k <= maxK; k++) {
            adjustedSignificance[sorted[k].originalIndex] = true;
        }
        return adjustedSignificance;
    }

    function calculateSummaryRow(dailyData, metricsToCalc, useWeighting) {
        const summary = {};
        if (!dailyData || dailyData.length === 0) return summary;
        metricsToCalc.forEach(metricKey => {
            let totalValue = 0; let totalWeight = 0; let validEntries = 0;
            dailyData.forEach(row => {
                const metricVal = parseValue(getCleanedValue(row, metricKey));
                if (metricVal !== null && !isNaN(metricVal)) {
                    if (useWeighting) {
                        const sessionVal = parseValue(getCleanedValue(row, 'Sessions'));
                        if (sessionVal !== null && !isNaN(sessionVal) && sessionVal > 0) {
                            totalValue += metricVal * sessionVal; totalWeight += sessionVal; validEntries++;
                        }
                    } else {
                        totalValue += metricVal; totalWeight++; validEntries++;
                    }
                }
            });
            summary[metricKey] = (validEntries > 0 && totalWeight > 0) ? totalValue / totalWeight : null;
        });
        summary['Sessions'] = dailyData.reduce((sum, row) => sum + (parseValue(getCleanedValue(row, 'Sessions')) || 0), 0);
        return summary;
    }

    function calculateTTestConfidence(controlDailyVals, experimentDailyVals, alpha) {
        if (controlDailyVals.length < 2 || experimentDailyVals.length < 2) {
            return { pValue: null, isSignificant: false, confidenceFormatted: "N/A (Insufficient Data)" };
        }
        const ctrlMean = jStat.mean(controlDailyVals); const expMean = jStat.mean(experimentDailyVals);
        const ctrlVar = jStat.variance(controlDailyVals, true); const expVar = jStat.variance(experimentDailyVals, true);
        const n1 = controlDailyVals.length; const n2 = experimentDailyVals.length;

        if (ctrlVar === 0 && expVar === 0) {
            return { 
                pValue: (ctrlMean === expMean ? 1 : 0), 
                isSignificant: ctrlMean !== expMean, 
                confidenceFormatted: `P: ${(ctrlMean === expMean ? 1 : 0).toFixed(3)} (No Var${ctrlMean !== expMean ? ", Diff Mean" : ""})`
            };
        }
        const sePooled = Math.sqrt((ctrlVar / n1) + (expVar / n2));
        if (sePooled === 0 || isNaN(sePooled)) {
             return { 
                pValue: (ctrlMean === expMean ? 1 : 0), 
                isSignificant: ctrlMean !== expMean, 
                confidenceFormatted: `P: ${(ctrlMean === expMean ? 1 : 0).toFixed(3)} (Zero/NaN SE)`
            };
        }
        const t = (expMean - ctrlMean) / sePooled;
        
        let df_num = Math.pow((ctrlVar / n1) + (expVar / n2), 2);
        let df_den_part1 = (n1 > 1) ? (Math.pow(ctrlVar / n1, 2) / (n1 - 1)) : 0;
        let df_den_part2 = (n2 > 1) ? (Math.pow(expVar / n2, 2) / (n2 - 1)) : 0;
        let df_den = df_den_part1 + df_den_part2;

        if (df_den === 0 || isNaN(df_den)) df_den = 1e-9; // Avoid division by zero, ensure df is positive
        
        const df = Math.max(1, df_num / df_den); // Welch-Satterthwaite degrees of freedom
        const pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));
        return { pValue, isSignificant: pValue < alpha, confidenceFormatted: `P: ${pValue.toFixed(3)}` };
    }

    // --- Event Listeners ---
    controlFileInput.addEventListener('change', handleFileSelect);
    experimentFileInput.addEventListener('change', handleFileSelect);
    runButton.addEventListener('click', runAnalysisAsync);
    exportButton.addEventListener('click', downloadCSV);

    goalDropdown.addEventListener('change', () => {
      selectedGoal = goalDropdown.value;
      if (document.querySelector("#comparisonTable tbody").innerHTML) { // Check if results are already displayed
        const results = JSON.parse(runButton.dataset.results || '[]');
        displayMetrics(results);
      }
    });

    analysisModeSelect.addEventListener('change', () => {
        bootstrapOptionsDiv.style.display = analysisModeSelect.value === 'bootstrap' ? 'block' : 'none';
    });
    bootstrapOptionsDiv.style.display = analysisModeSelect.value === 'bootstrap' ? 'block' : 'none'; // Initial state

    // --- Core Functions ---
    function handleFileSelect() {
        const controlFile = controlFileInput.files[0];
        const experimentFile = experimentFileInput.files[0];
        runButton.disabled = true; goalDropdown.disabled = true;
        goalDropdown.innerHTML = '<option value="">-- Select Goal --</option>';
        controlDailyData = null; experimentDailyData = null; controlFileSummary = null; experimentFileSummary = null;
        metricHeaders = []; controlSessionsEl.textContent = 'N/A'; experimentSessionsEl.textContent = 'N/A';
        sessionWarningEl.style.display = 'none'; exportButton.style.display = 'none';
        document.querySelector("#comparisonTable tbody").innerHTML = '';

        if (controlFile && experimentFile) {
            showLoader('Parsing files...');
            Promise.all([
                parseCSVFromFile(controlFile),
                parseCSVFromFile(experimentFile)
            ]).then(([controlResult, experimentResult]) => {
                controlDailyData = controlResult.dailyData; controlFileSummary = controlResult.summaryRow;
                experimentDailyData = experimentResult.dailyData; experimentFileSummary = experimentResult.summaryRow;

                if (!controlDailyData || !controlDailyData.length || !experimentDailyData || !experimentDailyData.length) {
                    updateLoaderStatus('Error: One or both files lack valid daily data rows.'); setTimeout(hideLoader, 2000); return;
                }

                const controlTotalSessions = controlFileSummary ? getCleanedValue(controlFileSummary, 'Sessions') : aggregateSessions(controlDailyData);
                const experimentTotalSessions = experimentFileSummary ? getCleanedValue(experimentFileSummary, 'Sessions') : aggregateSessions(experimentDailyData);

                controlSessionsEl.textContent = controlTotalSessions ? parseFloat(controlTotalSessions).toLocaleString() : 'N/A';
                experimentSessionsEl.textContent = experimentTotalSessions ? parseFloat(experimentTotalSessions).toLocaleString() : 'N/A';

                const cSess = parseFloat(controlTotalSessions); const eSess = parseFloat(experimentTotalSessions);
                if (cSess && eSess && (cSess / eSess > 1.5 || cSess / eSess < 0.66)) {
                     sessionWarningEl.style.display = 'block';
                } else {
                     sessionWarningEl.style.display = 'none';
                }

                const controlMetricsKeys = Object.keys(controlDailyData[0] || {}).map(k => k.trim().toLowerCase());
                const experimentMetricsKeys = Object.keys(experimentDailyData[0] || {}).map(k => k.trim().toLowerCase());

                // Find common original metric headers (case-sensitive from control file)
                metricHeaders = Object.keys(controlDailyData[0] || {})
                    .filter(k => {
                        const keyLower = k.trim().toLowerCase();
                        return experimentMetricsKeys.includes(keyLower) && !['offer date', 'sessions'].includes(keyLower);
                    });

                if (metricHeaders.length > 0) {
                    populateGoalDropdown(metricHeaders); runButton.disabled = false; updateLoaderStatus('Files loaded. Ready for analysis.');
                } else { updateLoaderStatus('Error: No common metrics found or essential columns missing (Offer Date, Sessions).'); }
                setTimeout(hideLoader, 1000);
            }).catch(error => { updateLoaderStatus(`Error parsing files: ${error.message}`); console.error(error); setTimeout(hideLoader, 3000); });
        } else { hideLoader(); }
    }

    function parseCSVFromFile(file) {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true, skipEmptyLines: true, dynamicTyping: false, transformHeader: header => header.trim(),
                complete: results => {
                    if (results.errors.length) return reject(new Error(`CSV parsing error in ${file.name}: ${results.errors[0].message}`));
                    let data = results.data; let summaryRow = null; let dailyData = [];
                    if (data.length > 0) {
                        const lastRow = data[data.length - 1];
                        const dateKey = Object.keys(lastRow).find(k => k.trim().toLowerCase() === 'offer date');
                        // Check if last row looks like a summary row (e.g., "Summary" in date field or non-standard date format)
                        if (dateKey && lastRow[dateKey] && (lastRow[dateKey].toLowerCase().includes('summary') || !/^\d{4}-\d{2}-\d{2}$/.test(lastRow[dateKey].trim()))){
                            summaryRow = data.pop();
                        }
                        // Filter for rows with valid 'Sessions' data
                        dailyData = data.filter(row => {
                            const sessionsValStr = getCleanedValue(row, 'Sessions');
                            if (sessionsValStr === null || sessionsValStr.trim() === '') return false;
                            const sessionsValNum = parseFloat(String(sessionsValStr).replace(/[^0-9.-]+/g, ''));
                            return !isNaN(sessionsValNum); // Allow 0 sessions for a day, but must be a number
                        });
                    }
                    resolve({ dailyData, summaryRow });
                }, error: error => reject(error)
            });
        });
    }

    function populateGoalDropdown(metrics) {
        goalDropdown.innerHTML = '<option value="">-- Select Goal --</option>';
        metrics.forEach(metric => {
            // No need to filter 'offer date' or 'sessions' here as metricHeaders already excludes them
            const option = document.createElement('option'); option.value = metric; option.textContent = metric;
            goalDropdown.appendChild(option);
        });
        goalDropdown.disabled = false;
        if (metrics.length > 0) {
             selectedGoal = metrics[0]; // Default to first metric
             goalDropdown.value = selectedGoal;
        }
    }

    function formatValueForDisplay(metricName, value) {
        if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) return "N/A";
        const metricNameLower = metricName.trim().toLowerCase();
        if (metricNameLower.includes("rate") || metricNameLower.includes("conversion") || metricNameLower.includes("add to cart") || metricNameLower.includes("abandonment")) return (value * 100).toFixed(2) + "%";
        if (metricNameLower.includes("revenue") || metricNameLower.includes("value")) return `£${value.toFixed(2)}`;
        if (metricNameLower.includes("time")) {
            const totalSeconds = Math.round(value); const mins = Math.floor(totalSeconds / 60); const secs = totalSeconds % 60;
            return `${mins}m ${secs}s`;
        }
        if (metricNameLower.includes("page views")) return value.toFixed(2); // Assuming page views per session can be fractional
        return typeof value === 'number' ? value.toFixed(3) : String(value); // Default to 3 decimal places for other numbers
    }

    // Helper to format absolute change for display
    function formatAbsoluteChangeForDisplay(metricName, value) {
        if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) return "N/A";
        const prefix = value >= 0 ? "+" : "-";
        const absValue = Math.abs(value);
        const metricNameLower = metricName.trim().toLowerCase();
        if (metricNameLower.includes("rate") || metricNameLower.includes("conversion") || metricNameLower.includes("add to cart") || metricNameLower.includes("abandonment")) {
            return `${prefix}${(absValue * 100).toFixed(2)}%`;
        }
        if (metricNameLower.includes("revenue") || metricNameLower.includes("value")) {
            return `${prefix}£${absValue.toFixed(2)}`;
        }
        if (metricNameLower.includes("time")) {
            return `${prefix}${Math.round(absValue)}s`;
        }
        if (metricNameLower.includes("page views")) {
            return `${prefix}${absValue.toFixed(2)}`;
        }
        return `${prefix}${absValue.toFixed(3)}`;
    }

    function scrollToExportButton() {
        const btn = document.getElementById('exportCsvBtn');
        if (btn && btn.offsetParent !== null) {
            btn.scrollIntoView({ behavior: 'smooth', block: 'start' }); // Align to top
            btn.focus();
        }
    }

    async function runAnalysisAsync() {
        showLoader("Initializing analysis...");
        runButton.disabled = true; exportButton.style.display = 'none';
        document.querySelector("#comparisonTable tbody").innerHTML = '';

        const allResults = [];
        const pValuesForBH = [];
        const resultIndicesForBH = [];

        const alpha = parseFloat(confidenceLevelSelect.value);
        const mode = analysisModeSelect.value;
        const iterations = parseInt(bootstrapIterationsInput.value);
        const useWeightingPointEst = useSessionWeightingCheckbox.checked;

        const controlSummaryOverall = calculateSummaryRow(controlDailyData, metricHeaders, useWeightingPointEst);
        const experimentSummaryOverall = calculateSummaryRow(experimentDailyData, metricHeaders, useWeightingPointEst);

        let metricIndex = 0;
        function processNextMetric() {
            if (metricIndex >= metricHeaders.length) {
                if (mode !== 'ttest' && pValuesForBH.length > 0) {
                    updateLoaderStatus("Applying Benjamini-Hochberg correction...");
                    const correctedSignificanceFlags = benjaminiHochberg(pValuesForBH, alpha);
                    resultIndicesForBH.forEach((originalResultIndex, bhPValueIndex) => {
                        if (allResults[originalResultIndex]) {
                           allResults[originalResultIndex].isSignificant = correctedSignificanceFlags[bhPValueIndex];
                        }
                    });
                }
                runButton.dataset.results = JSON.stringify(allResults);
                displayMetrics(allResults);
                exportButton.style.display = 'inline-block';
                updateLoaderStatus("Analysis complete!");
                setTimeout(hideLoader, 1500);
                runButton.disabled = false;
                scrollToExportButton(); // Scroll to export button when results are ready
                return;
            }

            const metricKey = metricHeaders[metricIndex];
            updateLoaderStatus(`Processing: ${metricKey} (${metricIndex + 1}/${metricHeaders.length})`);

            setTimeout(() => {
                const ctrlOverallMetricVal = controlSummaryOverall[metricKey];
                const expOverallMetricVal = experimentSummaryOverall[metricKey];

                // Absolute Change
                let absoluteChange = null;
                if (ctrlOverallMetricVal !== null && expOverallMetricVal !== null) {
                    absoluteChange = expOverallMetricVal - ctrlOverallMetricVal;
                }

                // Relative Change (Lift)
                let relativeChangePercent = null;
                if (ctrlOverallMetricVal !== null && expOverallMetricVal !== null && ctrlOverallMetricVal !== 0) {
                    relativeChangePercent = ((expOverallMetricVal - ctrlOverallMetricVal) / ctrlOverallMetricVal) * 100;
                } else if (ctrlOverallMetricVal === 0 && expOverallMetricVal > 0) {
                    relativeChangePercent = Infinity;
                } else if (ctrlOverallMetricVal === 0 && expOverallMetricVal === 0) {
                    relativeChangePercent = 0;
                }

                let uncertaintyString = '';
                let isSignificantFlag = false;

                if (mode === 'ttest') {
                    const controlDailyMetricValues = controlDailyData.map(row => parseValue(getCleanedValue(row, metricKey))).filter(v => v !== null && !isNaN(v));
                    const experimentDailyMetricValues = experimentDailyData.map(row => parseValue(getCleanedValue(row, metricKey))).filter(v => v !== null && !isNaN(v));
                    const ttestResult = calculateTTestConfidence(controlDailyMetricValues, experimentDailyMetricValues, alpha);
                    uncertaintyString = ttestResult.confidenceFormatted;
                    isSignificantFlag = ttestResult.isSignificant;
                } else {
                    updateLoaderStatus(`Running bootstrap for "${metricKey}"...`);
                    const bootstrapResult = bootstrapMetric(controlDailyData, experimentDailyData, metricKey, iterations, alpha);
                    relativeChangePercent = bootstrapResult.lift * 100;
                    const lowerCI = bootstrapResult.lowerBound * 100;
                    const upperCI = bootstrapResult.upperBound * 100;
                    uncertaintyString = `CI: (${lowerCI > 0 ? '+' : ''}${lowerCI.toFixed(2)}%, ${upperCI > 0 ? '+' : ''}${upperCI.toFixed(2)}%)`;
                    isSignificantFlag = bootstrapResult.significant;
                    pValuesForBH.push(bootstrapResult.significant ? alpha / (10 * iterations) : 1.0);
                    resultIndicesForBH.push(allResults.length);
                }

                let icon = '';
                const metricKeyLower = metricKey.toLowerCase().trim();
                const negativeIsGoodMetrics = ['bounce rate', 'cart abandonment', 'exit rate'];
                if (relativeChangePercent !== null && !isNaN(relativeChangePercent)) {
                    if (negativeIsGoodMetrics.includes(metricKeyLower)) {
                        if (relativeChangePercent < 0) icon = '<span class="significant-icon lift-up">▼</span>';
                        else if (relativeChangePercent > 0) icon = '<span class="significant-icon lift-down">▲</span>';
                        else icon = '<span class="significant-icon" style="font-weight:1000;color: goldenrod;">–</span>';
                    } else {
                        if (relativeChangePercent > 0) icon = '<span class="significant-icon lift-up">▲</span>';
                        else if (relativeChangePercent < 0) icon = '<span class="significant-icon lift-down">▼</span>';
                        else icon = '<span class="significant-icon" style="font-weight:1000;color: goldenrod;">–</span>';
                    }
                }

                allResults.push({
                    metric: metricKey,
                    controlValFormatted: formatValueForDisplay(metricKey, ctrlOverallMetricVal),
                    experimentValFormatted: formatValueForDisplay(metricKey, expOverallMetricVal),
                    absoluteChange: absoluteChange,
                    relativeChangePercent: relativeChangePercent,
                    uncertaintyString: uncertaintyString,
                    isSignificant: isSignificantFlag,
                    icon: icon,
                    absLift: Math.abs(relativeChangePercent || 0)
                });
                metricIndex++;
                processNextMetric();
            }, 0);
        }
        processNextMetric();
    }

    function displayMetrics(resultsData) {
        const tableBody = document.querySelector("#comparisonTable tbody");
        tableBody.innerHTML = '';
        resultsData.sort((a, b) => {
            if (a.isSignificant !== b.isSignificant) return b.isSignificant - a.isSignificant;
            if (a.isSignificant) {
                const metricALower = a.metric.toLowerCase().trim();
                const metricBLower = b.metric.toLowerCase().trim();
                const negativeIsGoodMetrics = ['bounce rate', 'cart abandonment', 'exit rate'];
                const aIsNegativeGood = negativeIsGoodMetrics.includes(metricALower);
                const bIsNegativeGood = negativeIsGoodMetrics.includes(metricBLower);
                if (aIsNegativeGood && a.relativeChangePercent < 0 && (!bIsNegativeGood || b.relativeChangePercent >= 0)) return -1;
                if (bIsNegativeGood && b.relativeChangePercent < 0 && (!aIsNegativeGood || a.relativeChangePercent >= 0)) return 1;
                if (!aIsNegativeGood && a.relativeChangePercent > 0 && (bIsNegativeGood || b.relativeChangePercent <= 0)) return -1;
                if (!bIsNegativeGood && b.relativeChangePercent > 0 && (aIsNegativeGood || a.relativeChangePercent <= 0)) return 1;
            }
            return b.absLift - a.absLift;
        });

        resultsData.forEach(res => {
            const row = document.createElement('tr');
            const isGoal = res.metric === selectedGoal;
            row.className = isGoal ? 'highlight-goal' : '';
            let significanceDisplay = res.isSignificant ? `Yes` : 'No';
            const formattedAbsChange = formatAbsoluteChangeForDisplay(res.metric, res.absoluteChange);
            const formattedRelChange = res.relativeChangePercent !== null && !isNaN(res.relativeChangePercent) && isFinite(res.relativeChangePercent)
                ? `${res.relativeChangePercent >= 0 ? '+' : ''}${res.relativeChangePercent.toFixed(2)}% ${res.icon}`
                : (isFinite(res.relativeChangePercent) ? `0.00% ${res.icon}` : `N/A ${res.icon}`);
            row.innerHTML = `
              <td>${res.metric}${res.isSignificant ? ' <span class="metric-star" title="Statistically Significant">⭐</span>' : ''}</td>
              <td>${res.controlValFormatted}</td>
              <td>${res.experimentValFormatted}</td>
              <td>${formattedAbsChange}</td>
              <td>${formattedRelChange}</td>
              <td>${res.uncertaintyString}</td>
              <td>${significanceDisplay}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    function downloadCSV() {
        const header = [[
            'Metric',
            'Control',
            'Experiment',
            'Absolute Change',
            'Relative Change (%)',
            'Uncertainty (CI/P-value)',
            'Significant?'
        ]];
        const tableRows = Array.from(document.querySelectorAll("#comparisonTable tbody tr"));
        const dataRows = tableRows.map(tr => {
            const tds = Array.from(tr.querySelectorAll('td'));
            let metric = tds[0].textContent.replace('⭐', '').trim();
            let control = tds[1].textContent.trim();
            let experiment = tds[2].textContent.trim();
            let absChange = tds[3].textContent.trim();
            let relChange = tds[4].textContent.trim();
            let uncertainty = tds[5].textContent.trim();
            let significant = tds[6].textContent.trim();
            return [metric, control, experiment, absChange, relChange, uncertainty, significant].map(text => `"${text.replace(/"/g, '""')}"`);
        });
        const csvContent = header.concat(dataRows).map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'ab_test_analysis_results.csv';
        link.style.display = 'none'; document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
});
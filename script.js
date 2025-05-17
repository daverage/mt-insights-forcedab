document.addEventListener('DOMContentLoaded', () => {
    let controlDailyData = null;
    let experimentDailyData = null;
    let originalControlDailyData = null; // To keep a copy before potential filtering
    let originalExperimentDailyData = null; // To keep a copy before potential filtering
    // fileSummary variables are less critical if we always calculate summaries from daily data
    // let controlFileSummary = null;
    // let experimentFileSummary = null;
    let selectedGoal = null;
    let metricHeaders = [];
    let analysisScenario = null;
    let analysisDetails = {};

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
    const caveatsEl = document.getElementById('analysisCaveats'); // Get the caveats display element
    const insightsEl = document.getElementById('generatedInsights');

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
        if (!data || data.length === 0) return 0;
        return data.reduce((sum, row) => sum + parseValue(getCleanedValue(row, 'Sessions')), 0);
    }

    function bootstrapMetric(controlDataForBootstrap, experimentDataForBootstrap, metricKey, iterations = 3000, alpha = 0.05) {
        // Ensure data is not empty for bootstrapping
        if (!controlDataForBootstrap || controlDataForBootstrap.length === 0 || !experimentDataForBootstrap || experimentDataForBootstrap.length === 0) {
            console.warn("Bootstrap called with empty data for metric:", metricKey);
            return { lift: 0, lowerBound: 0, upperBound: 0, significant: false };
        }

        const controlTotalOriginalSessions = aggregateSessions(controlDataForBootstrap);
        const expTotalOriginalSessions = aggregateSessions(experimentDataForBootstrap);
        const lifts = [];

        for (let i = 0; i < iterations; i++) {
            const sampledControlDays = Array.from({ length: controlDataForBootstrap.length }, () => controlDataForBootstrap[Math.floor(Math.random() * controlDataForBootstrap.length)]);
            const sampledExpDays = Array.from({ length: experimentDataForBootstrap.length }, () => experimentDataForBootstrap[Math.floor(Math.random() * experimentDataForBootstrap.length)]);

            const controlSumProduct = sampledControlDays.reduce((sum, row) => sum + parseValue(getCleanedValue(row, metricKey)) * parseValue(getCleanedValue(row, 'Sessions')), 0);
            const expSumProduct = sampledExpDays.reduce((sum, row) => sum + parseValue(getCleanedValue(row, metricKey)) * parseValue(getCleanedValue(row, 'Sessions')), 0);

            const controlMetricValue = controlTotalOriginalSessions > 0 ? controlSumProduct / controlTotalOriginalSessions : 0;
            const expMetricValue = expTotalOriginalSessions > 0 ? expSumProduct / expTotalOriginalSessions : 0;

            if (controlMetricValue !== 0) {
                lifts.push((expMetricValue - controlMetricValue) / controlMetricValue);
            } else if (expMetricValue > 0) {
                lifts.push(Infinity);
            } else {
                lifts.push(0);
            }
        }
        lifts.sort((a, b) => a - b);
        const lowerIdx = Math.floor((alpha / 2) * iterations);
        const upperIdx = Math.floor((1 - alpha / 2) * iterations) - 1;

        const safeLowerIdx = Math.max(0, Math.min(lowerIdx, lifts.length - 1));
        const safeUpperIdx = Math.max(0, Math.min(upperIdx, lifts.length - 1));
        const medianIdx = Math.floor(lifts.length / 2);

        const medianLift = lifts.length > 0 ? lifts[medianIdx] : 0;
        const lowerBoundLift = lifts.length > 0 ? lifts[safeLowerIdx] : 0;
        const upperBoundLift = lifts.length > 0 ? lifts[safeUpperIdx] : 0;

        return {
            lift: medianLift,
            lowerBound: lowerBoundLift,
            upperBound: upperBoundLift,
            significant: (lowerBoundLift > 0 && upperBoundLift > 0) || (lowerBoundLift < 0 && upperBoundLift < 0)
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

    function calculateSummaryRow(dailyDataForSummary, metricsToCalc, useWeighting) {
        const summary = {};
        if (!dailyDataForSummary || dailyDataForSummary.length === 0) return summary;

        metricsToCalc.forEach(metricKey => {
            let totalValue = 0; let totalWeight = 0; let validEntries = 0;
            dailyDataForSummary.forEach(row => {
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
        summary['Sessions'] = aggregateSessions(dailyDataForSummary); // Use aggregateSessions for consistency
        return summary;
    }

    function calculateTTestConfidence(controlDailyVals, experimentDailyVals, alpha) {
        if (!controlDailyVals || controlDailyVals.length < 2 || !experimentDailyVals || experimentDailyVals.length < 2) {
            return { pValue: null, isSignificant: false, confidenceFormatted: "N/A (Insufficient Data)" };
        }
        // ... (rest of t-test logic is fine)
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

        if (df_den === 0 || isNaN(df_den)) df_den = 1e-9;

        const df = Math.max(1, df_num / df_den);
        const pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));
        return { pValue, isSignificant: pValue < alpha, confidenceFormatted: `P: ${pValue.toFixed(3)}` };
    }

    // --- Date Helper Functions ---
    function getDateFromRow(row) {
        const dateStr = getCleanedValue(row, 'Offer Date');
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr).trim())) return null;
        // Adding T00:00:00Z ensures the date is parsed as UTC midnight, avoiding timezone issues
        // that can shift the date depending on the user's local timezone.
        return new Date(String(dateStr).trim() + "T00:00:00Z");
    }

    function formatDate(date) {
        if (!date || !(date instanceof Date) || isNaN(date.getTime())) return 'N/A';
        return date.toISOString().split('T')[0];
    }

    // --- Analysis Strategy and Caveat Functions ---
    function determineAnalysisStrategyAndPrepareData(ctrlDataInput, expDataInput) {
        let processedControlData = [...ctrlDataInput];
        let processedExperimentData = [...expDataInput];
        let scenario = 'UNKNOWN';
        let details = {};

        const ctrlDates = ctrlDataInput.map(getDateFromRow).filter(d => d).sort((a, b) => a - b);
        const expDates = expDataInput.map(getDateFromRow).filter(d => d).sort((a, b) => a - b);

        if (ctrlDates.length === 0 || expDates.length === 0) {
            scenario = 'NO_VALID_DATES';
            details = { message: "One or both files lack valid 'Offer Date' entries (YYYY-MM-DD format) for comparison." };
            return { processedControlData: [], processedExperimentData: [], scenario, details };
        }

        const ctrlStartDate = ctrlDates[0];
        const ctrlEndDate = ctrlDates[ctrlDates.length - 1];
        const expStartDate = expDates[0];
        const expEndDate = expDates[expDates.length - 1];

        details.controlFullRange = `${formatDate(ctrlStartDate)} to ${formatDate(ctrlEndDate)} (${ctrlDates.length} days)`;
        details.experimentFullRange = `${formatDate(expStartDate)} to ${formatDate(expEndDate)} (${expDates.length} days)`;

        const overlapStart = new Date(Math.max(ctrlStartDate, expStartDate));
        const overlapEnd = new Date(Math.min(ctrlEndDate, expEndDate));

        if (overlapStart <= overlapEnd) {
            details.overlapStartDate = formatDate(overlapStart);
            details.overlapEndDate = formatDate(overlapEnd);
            const overlapDuration = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            details.overlapDuration = overlapDuration;

            const ctrlIsPerfectMatch = ctrlStartDate.getTime() === overlapStart.getTime() && ctrlEndDate.getTime() === overlapEnd.getTime();
            const expIsPerfectMatch = expStartDate.getTime() === overlapStart.getTime() && expEndDate.getTime() === overlapEnd.getTime();

            if (ctrlIsPerfectMatch && expIsPerfectMatch && ctrlDates.length === expDates.length) {
                scenario = 'IDEAL_OVERLAP';
                details.message = "Data ranges perfectly align for a direct A/B comparison.";
            } else {
                scenario = 'PARTIAL_OVERLAP_ALIGNED';
                details.message = `Data has been aligned to the overlapping period: ${details.overlapStartDate} to ${details.overlapEndDate}.`;
                details.isShortOverlap = overlapDuration < 7; // Example threshold

                processedControlData = ctrlDataInput.filter(row => {
                    const d = getDateFromRow(row);
                    return d && d >= overlapStart && d <= overlapEnd;
                });
                processedExperimentData = expDataInput.filter(row => {
                    const d = getDateFromRow(row);
                    return d && d >= overlapStart && d <= overlapEnd;
                });
            }
        } else {
            scenario = 'SEQUENTIAL_NO_OVERLAP';
            details.message = "Critical: Data ranges do not overlap. Analysis will be sequential.";
        }
        
        // Check if after processing, data is still valid for statistical tests (min 2 days)
        if (processedControlData.length < 2 || processedExperimentData.length < 2) {
            scenario = 'INSUFFICIENT_DATA_AFTER_PROCESSING';
            details.message = `After processing dates (overlap: ${details.overlapStartDate || 'N/A'} to ${details.overlapEndDate || 'N/A'}), one or both datasets have insufficient daily data points (less than 2) for reliable statistical analysis. Original full datasets will be used for descriptive purposes if possible, but significance testing may be unreliable or disabled.`;
            // Fallback: use original data but ensure caveats reflect this issue.
            // Or, block analysis if truly too little data.
            // For now, the message above is the primary output. The actual statistical functions will return N/A.
            // Let's decide if we should revert or not. For now, let's stick to the processed data if any.
            // If scenario became INSUFFICIENT_DATA_AFTER_PROCESSING due to alignment,
            // it means the overlap was too small. The user needs to know this.
        }

        return { processedControlData, processedExperimentData, scenario, details };
    }

    function displayAnalysisCaveats(currentScenario, currentDetails) {
        caveatsEl.innerHTML = '';
        if (!currentScenario) return;

        let html = '<h4>Analysis Notes & Caveats:</h4><ul>';
        const warningIcon = '<span style="color:orange;font-weight:bold;">⚠️</span>';
        const criticalIcon = '<span style="color:red;font-weight:bold;">🚨</span>';

        html += `<li>Control data originally parsed as: ${currentDetails.controlFullRange || 'N/A'}.</li>`;
        html += `<li>Experiment data originally parsed as: ${currentDetails.experimentFullRange || 'N/A'}.</li>`;

        switch (currentScenario) {
            case 'IDEAL_OVERLAP':
                html += `<li><strong style="color:green;">Ideal Scenario:</strong> Both datasets cover the identical period: <strong>${currentDetails.overlapStartDate} to ${currentDetails.overlapEndDate}</strong>. This is best for A/B testing.</li>`;
                break;
            case 'PARTIAL_OVERLAP_ALIGNED':
                html += `<li>${warningIcon} <strong>Data Aligned:</strong> Analysis has been automatically focused on the strictly overlapping period: <strong>${currentDetails.overlapStartDate} to ${currentDetails.overlapEndDate}</strong> (${currentDetails.overlapDuration} days).</li>`;
                html += `<li>Data outside this concurrent period has been excluded from significance testing to ensure a fairer comparison.</li>`;
                if (currentDetails.isShortOverlap) {
                    html += `<li>${warningIcon} The overlapping period of ${currentDetails.overlapDuration} days is relatively short. This may result in lower statistical power, making it harder to detect true differences. Consider a longer test if possible.</li>`;
                }
                break;
            case 'SEQUENTIAL_NO_OVERLAP':
                html += `<li>${criticalIcon} <strong>CRITICAL WARNING: SEQUENTIAL COMPARISON!</strong></li>`;
                html += `<li>The provided data for 'Control' and 'Experiment' <strong>do not overlap in time.</strong></li>`;
                html += `<li>Any observed differences are highly likely to be influenced by time-based factors (e.g., day of week, seasonality, marketing campaigns, external events during their respective periods) rather than solely by the experimental change.</li>`;
                html += `<li><strong>Results from this analysis CANNOT conclusively determine the causal impact of the experiment.</strong> They are descriptive of two different time periods. Interpret with extreme caution.</li>`;
                break;
            case 'NO_VALID_DATES':
                html += `<li>${criticalIcon} Error: ${currentDetails.message} Cannot proceed with comparison. Please check that 'Offer Date' columns are present and in YYYY-MM-DD format.</li>`;
                runButton.disabled = true; // Explicitly disable run if no valid dates
                break;
            case 'INSUFFICIENT_DATA_AFTER_PROCESSING':
                 html += `<li>${criticalIcon} <strong>Error: Insufficient Data for Reliable Analysis.</strong></li>`;
                 html += `<li>${currentDetails.message}</li>`;
                 html += `<li>Significance testing (T-test, Bootstrap CIs) requires at least 2 daily data points per group after date alignment. Results shown might be based on fewer points and are not statistically robust.</li>`;
                // Do not disable run button here, let the statistical functions handle N/A.
                break;
            default:
                html += `<li>${warningIcon} Analysis scenario could not be fully determined or is a fallback. Please review your data and the notes carefully.</li>`;
        }

        if (currentScenario === 'IDEAL_OVERLAP' || currentScenario === 'PARTIAL_OVERLAP_ALIGNED') {
            html += `<li>Ensure that the 'Sessions' count for Control and Experiment (over the analyzed period) are reasonably balanced. Significant imbalances can affect test interpretation.</li>`;
        }
        if (currentScenario !== 'NO_VALID_DATES'){
             html += `<li>The statistical significance (e.g., P-value or Confidence Interval) indicates the likelihood that the observed difference is not due to random chance, assuming all other A/B testing best practices were followed *for the analyzed period*.</li>`;
        }


        html += '</ul>';
        caveatsEl.innerHTML = html;
        caveatsEl.style.display = 'block';
    }


    // --- Event Listeners ---
    controlFileInput.addEventListener('change', handleFileSelect);
    experimentFileInput.addEventListener('change', handleFileSelect);
    runButton.addEventListener('click', runAnalysisAsync);
    exportButton.addEventListener('click', downloadCSV);

    goalDropdown.addEventListener('change', () => {
      selectedGoal = goalDropdown.value;
      if (document.querySelector("#comparisonTable tbody").innerHTML) {
        const results = JSON.parse(runButton.dataset.results || '[]');
        displayMetrics(results);
      }
    });

    analysisModeSelect.addEventListener('change', () => {
        bootstrapOptionsDiv.style.display = analysisModeSelect.value === 'bootstrap' ? 'block' : 'none';
    });
    bootstrapOptionsDiv.style.display = analysisModeSelect.value === 'bootstrap' ? 'block' : 'none';

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
                originalControlDailyData = controlResult.dailyData;
                originalExperimentDailyData = experimentResult.dailyData;

                if (!originalControlDailyData || !originalControlDailyData.length ||
                    !originalExperimentDailyData || !originalExperimentDailyData.length) {
                    updateLoaderStatus('Error: One or both files lack valid daily data rows.');
                    setTimeout(hideLoader, 2000);
                    analysisScenario = 'NO_DATA'; // Custom scenario for no data
                    analysisDetails = { message: 'One or both files lack valid daily data rows.' };
                    displayAnalysisCaveats(analysisScenario, analysisDetails);
                    return;
                }

                const strategyResult = determineAnalysisStrategyAndPrepareData(originalControlDailyData, originalExperimentDailyData);
                controlDailyData = strategyResult.processedControlData;
                experimentDailyData = strategyResult.processedExperimentData;
                analysisScenario = strategyResult.scenario;
                analysisDetails = strategyResult.details;

                displayAnalysisCaveats(analysisScenario, analysisDetails);

                // Use processed data for session counts and metric headers
                const controlTotalSessionsForDisplay = aggregateSessions(controlDailyData);
                const experimentTotalSessionsForDisplay = aggregateSessions(experimentDailyData);

                controlSessionsEl.textContent = controlTotalSessionsForDisplay ? parseFloat(controlTotalSessionsForDisplay).toLocaleString() : 'N/A';
                experimentSessionsEl.textContent = experimentTotalSessionsForDisplay ? parseFloat(experimentTotalSessionsForDisplay).toLocaleString() : 'N/A';

                const cSess = parseFloat(controlTotalSessionsForDisplay);
                const eSess = parseFloat(experimentTotalSessionsForDisplay);
                if (cSess && eSess && (cSess / eSess > 1.5 || cSess / eSess < 0.66)) {
                    sessionWarningEl.style.display = 'block';
                } else {
                    sessionWarningEl.style.display = 'none';
                }
                
                // If no valid dates found, or insufficient data after processing, metricHeaders might be empty or run button disabled
                if (analysisScenario === 'NO_VALID_DATES' || (analysisScenario === 'INSUFFICIENT_DATA_AFTER_PROCESSING' && (controlDailyData.length < 2 || experimentDailyData.length <2)) ) {
                     metricHeaders = []; // No metrics to analyze
                } else if (controlDailyData.length > 0 && experimentDailyData.length > 0) {
                    const controlMetricsKeys = Object.keys(controlDailyData[0] || {}).map(k => k.trim().toLowerCase());
                    const experimentMetricsKeys = Object.keys(experimentDailyData[0] || {}).map(k => k.trim().toLowerCase());
                    metricHeaders = Object.keys(controlDailyData[0] || {})
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

    function parseCSVFromFile(file) {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true, skipEmptyLines: true, dynamicTyping: false, transformHeader: header => header.trim(),
                complete: results => {
                    if (results.errors.length) return reject(new Error(`CSV parsing error in ${file.name}: ${results.errors[0].message}`));
                    let data = results.data;
                    let summaryRow = null; // Summary row extraction from original file is less important now.
                    let dailyData = [];
                    if (data.length > 0) {
                        const dateKeyName = Object.keys(data[0]).find(k => k.trim().toLowerCase() === 'offer date');
                        if (!dateKeyName) {
                             // Reject if 'Offer Date' column is missing, as it's crucial for date processing
                             return reject(new Error(`'Offer Date' column not found in ${file.name}. This column is required.`));
                        }

                        const lastRow = data[data.length - 1];
                        const dateValLastRow = getCleanedValue(lastRow, 'Offer Date');
                        if (dateValLastRow && (String(dateValLastRow).toLowerCase().includes('summary') || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateValLastRow).trim()))){
                            // summaryRow = data.pop(); // We might not need this if we always calculate from daily.
                            data.pop(); // Still remove it from daily data
                        }
                        dailyData = data.filter(row => {
                            const sessionsValStr = getCleanedValue(row, 'Sessions');
                            if (sessionsValStr === null || String(sessionsValStr).trim() === '') return false;
                            const sessionsValNum = parseFloat(String(sessionsValStr).replace(/[^0-9.-]+/g, ''));
                            // Also ensure 'Offer Date' is present and somewhat valid for this row
                            const offerDateVal = getDateFromRow(row);
                            return !isNaN(sessionsValNum) && offerDateVal !== null;
                        });
                    }
                    resolve({ dailyData /*, summaryRow */ });
                }, error: error => reject(error)
            });
        });
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

    function formatValueForDisplay(metricName, value) {
        if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) return "N/A";
        const metricNameLower = metricName.trim().toLowerCase();
        if (metricNameLower.includes("rate") || metricNameLower.includes("conversion") || metricNameLower.includes("add to cart") || metricNameLower.includes("abandonment")) return (value * 100).toFixed(2) + "%";
        if (metricNameLower.includes("revenue") || metricNameLower.includes("value")) return `£${value.toFixed(2)}`;
        if (metricNameLower.includes("time")) {
            const totalSeconds = Math.round(value); const mins = Math.floor(totalSeconds / 60); const secs = totalSeconds % 60;
            return `${mins}m ${secs}s`;
        }
        if (metricNameLower.includes("page views")) return value.toFixed(2);
        return typeof value === 'number' ? value.toFixed(3) : String(value);
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


    function scrollToExportButton() {
        const btn = document.getElementById('exportCsvBtn');
        if (btn && btn.offsetParent !== null) { // Check if button is visible
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    async function runAnalysisAsync() {
        // Ensure caveats are displayed if run is clicked without re-uploading
        if (analysisScenario && Object.keys(analysisDetails).length > 0) {
            displayAnalysisCaveats(analysisScenario, analysisDetails);
        } else if (!analysisScenario && (originalControlDailyData && originalExperimentDailyData)) {
            // Edge case: files were somehow loaded but scenario not set, try to set it.
            // This is defensive coding.
            const strategyResult = determineAnalysisStrategyAndPrepareData(originalControlDailyData, originalExperimentDailyData);
            controlDailyData = strategyResult.processedControlData;
            experimentDailyData = strategyResult.processedExperimentData;
            analysisScenario = strategyResult.scenario;
            analysisDetails = strategyResult.details;
            displayAnalysisCaveats(analysisScenario, analysisDetails);
        }


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

        // Calculate summaries based on the (potentially filtered) controlDailyData and experimentDailyData
        const controlSummaryOverall = calculateSummaryRow(controlDailyData, metricHeaders, useWeightingPointEst);
        const experimentSummaryOverall = calculateSummaryRow(experimentDailyData, metricHeaders, useWeightingPointEst);

        let metricIndex = 0;
        function processNextMetric() {
            if (metricIndex >= metricHeaders.length || !controlDailyData || controlDailyData.length < 2 || !experimentDailyData || experimentDailyData.length < 2) {
                // If not enough data after filtering, B-H might not be applicable or results are limited
                if (analysisScenario === 'INSUFFICIENT_DATA_AFTER_PROCESSING' || (controlDailyData && controlDailyData.length < 2) || (experimentDailyData && experimentDailyData.length < 2) ) {
                     updateLoaderStatus("Analysis limited due to insufficient daily data points after date alignment.");
                } else if (mode !== 'ttest' && pValuesForBH.length > 0) {
                    updateLoaderStatus("Applying Benjamini-Hochberg correction...");
                    const correctedSignificanceFlags = benjaminiHochberg(pValuesForBH, alpha);
                    resultIndicesForBH.forEach((originalResultIndex, bhPValueIndex) => {
                        if (allResults[originalResultIndex]) {
                           allResults[originalResultIndex].isSignificant = correctedSignificanceFlags[bhPValueIndex];
                        }
                    });
                } else if (metricHeaders.length === 0) {
                    updateLoaderStatus("No common metrics to analyze.");
                }


                runButton.dataset.results = JSON.stringify(allResults);
                displayMetrics(allResults); // Display whatever results were processed
                if (allResults.length > 0) {
                    exportButton.style.display = 'inline-block';
                    generateAndDisplayInsights(allResults, analysisScenario, analysisDetails, selectedGoal, confidenceLevelSelect.value);
                }
                if (metricIndex >= metricHeaders.length && metricHeaders.length > 0 && analysisScenario !== 'INSUFFICIENT_DATA_AFTER_PROCESSING') {
                     updateLoaderStatus("Analysis complete!");
                } else if (metricHeaders.length === 0) {
                    // No change in status, already set by handleFileSelect
                }
                setTimeout(hideLoader, 1500);
                runButton.disabled = false;
                if (allResults.length > 0) scrollToExportButton();
                return;
            }

            const metricKey = metricHeaders[metricIndex];
            updateLoaderStatus(`Processing: ${metricKey} (${metricIndex + 1}/${metricHeaders.length})`);

            setTimeout(() => {
                const ctrlOverallMetricVal = controlSummaryOverall[metricKey];
                const expOverallMetricVal = experimentSummaryOverall[metricKey];
                let absoluteChange = null;
                if (ctrlOverallMetricVal !== null && expOverallMetricVal !== null) {
                    absoluteChange = expOverallMetricVal - ctrlOverallMetricVal;
                }

                let relativeChangePercent = null; // Point estimate lift
                if (ctrlOverallMetricVal !== null && expOverallMetricVal !== null && ctrlOverallMetricVal !== 0) {
                    relativeChangePercent = ((expOverallMetricVal - ctrlOverallMetricVal) / ctrlOverallMetricVal) * 100;
                } else if (ctrlOverallMetricVal === 0 && expOverallMetricVal > 0) {
                    relativeChangePercent = Infinity;
                } else if (ctrlOverallMetricVal === 0 && expOverallMetricVal === 0) {
                    relativeChangePercent = 0;
                }

                let uncertaintyString = 'N/A';
                let isSignificantFlag = false;
                let finalLiftForDisplay = relativeChangePercent; // Default for t-test

                // Only run t-test/bootstrap if enough data points
                if (controlDailyData.length >= 2 && experimentDailyData.length >= 2) {
                    if (mode === 'ttest') {
                        const controlDailyMetricValues = controlDailyData.map(row => parseValue(getCleanedValue(row, metricKey))).filter(v => v !== null && !isNaN(v));
                        const experimentDailyMetricValues = experimentDailyData.map(row => parseValue(getCleanedValue(row, metricKey))).filter(v => v !== null && !isNaN(v));
                        // Ensure enough valid numeric values for t-test after parsing metric
                        if (controlDailyMetricValues.length >=2 && experimentDailyMetricValues.length >=2){
                            const ttestResult = calculateTTestConfidence(controlDailyMetricValues, experimentDailyMetricValues, alpha);
                            uncertaintyString = ttestResult.confidenceFormatted;
                            isSignificantFlag = ttestResult.isSignificant;
                        }
                    } else { // Bootstrap mode
                        updateLoaderStatus(`Running bootstrap for "${metricKey}"...`);
                        const bootstrapResult = bootstrapMetric(controlDailyData, experimentDailyData, metricKey, iterations, alpha);
                        finalLiftForDisplay = bootstrapResult.lift * 100; // Bootstrap median lift
                        const lowerCI = bootstrapResult.lowerBound * 100;
                        const upperCI = bootstrapResult.upperBound * 100;
                        uncertaintyString = `CI: (${lowerCI >= 0 ? '+' : ''}${lowerCI.toFixed(2)}%, ${upperCI >= 0 ? '+' : ''}${upperCI.toFixed(2)}%)`;
                        isSignificantFlag = bootstrapResult.significant;
                        pValuesForBH.push(bootstrapResult.significant ? alpha / (10 * iterations) : 1.0); // Heuristic p-value for B-H
                        resultIndicesForBH.push(allResults.length);
                    }
                }


                let icon = '';
                const metricKeyLower = metricKey.toLowerCase().trim();
                const negativeIsGoodMetrics = ['bounce rate', 'cart abandonment', 'exit rate'];
                const liftForIcon = finalLiftForDisplay; // Use bootstrap lift if available, else point estimate lift

                if (liftForIcon !== null && !isNaN(liftForIcon) && isFinite(liftForIcon)) {
                    if (negativeIsGoodMetrics.includes(metricKeyLower)) {
                        if (liftForIcon < 0) icon = '<span class="significant-icon lift-up">▼</span>';
                        else if (liftForIcon > 0) icon = '<span class="significant-icon lift-down">▲</span>';
                        else icon = '<span class="significant-icon" style="font-weight:1000;color: goldenrod;">–</span>';
                    } else {
                        if (liftForIcon > 0) icon = '<span class="significant-icon lift-up">▲</span>';
                        else if (liftForIcon < 0) icon = '<span class="significant-icon lift-down">▼</span>';
                        else icon = '<span class="significant-icon" style="font-weight:1000;color: goldenrod;">–</span>';
                    }
                } else if (isFinite(liftForIcon)) { // Handle 0 lift specifically
                     icon = '<span class="significant-icon" style="font-weight:1000;color: goldenrod;">–</span>';
                }


                allResults.push({
                    metric: metricKey,
                    controlValFormatted: formatValueForDisplay(metricKey, ctrlOverallMetricVal),
                    experimentValFormatted: formatValueForDisplay(metricKey, expOverallMetricVal),
                    absoluteChange: absoluteChange,
                    relativeChangePercent: finalLiftForDisplay, // Display bootstrap lift if used, or point estimate lift
                    uncertaintyString: uncertaintyString,
                    isSignificant: isSignificantFlag,
                    icon: icon,
                    absLift: Math.abs(finalLiftForDisplay || 0) // Sort by this lift
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
        if (!resultsData || resultsData.length === 0) {
            const row = tableBody.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 7; // Match number of columns
            cell.textContent = "No metrics processed or available for display. Please check caveats and input files.";
            cell.style.textAlign = "center";
            return;
        }

        resultsData.sort((a, b) => {
            if (a.isSignificant !== b.isSignificant) return b.isSignificant - a.isSignificant;
            if (a.isSignificant) {
                const metricALower = a.metric.toLowerCase().trim();
                const metricBLower = b.metric.toLowerCase().trim();
                const negativeIsGoodMetrics = ['bounce rate', 'cart abandonment', 'exit rate'];
                const aIsNegativeGood = negativeIsGoodMetrics.includes(metricALower);
                const bIsNegativeGood = negativeIsGoodMetrics.includes(metricBLower);
                const liftA = a.relativeChangePercent; // Use the displayed lift
                const liftB = b.relativeChangePercent;

                if (aIsNegativeGood && liftA < 0 && (!bIsNegativeGood || liftB >= 0)) return -1;
                if (bIsNegativeGood && liftB < 0 && (!aIsNegativeGood || liftA >= 0)) return 1;
                if (!aIsNegativeGood && liftA > 0 && (bIsNegativeGood || liftB <= 0)) return -1;
                if (!bIsNegativeGood && liftB > 0 && (aIsNegativeGood || liftA <= 0)) return 1;
            }
            return b.absLift - a.absLift;
        });

        resultsData.forEach(res => {
            const row = document.createElement('tr');
            const isGoal = res.metric === selectedGoal;
            row.className = isGoal ? 'highlight-goal' : '';
            let significanceDisplay = res.isSignificant ? `Yes (${((1 - parseFloat(confidenceLevelSelect.value)) * 100).toFixed(0)}%)` : 'No';
             if (res.uncertaintyString === "N/A (Insufficient Data)") {
                significanceDisplay = "N/A";
            }


            const formattedAbsChange = formatAbsoluteChangeForDisplay(res.metric, res.absoluteChange);
            let formattedRelChange = "N/A";
            if (res.relativeChangePercent !== null && !isNaN(res.relativeChangePercent) && isFinite(res.relativeChangePercent)) {
                 formattedRelChange = `${res.relativeChangePercent >= 0 ? '+' : ''}${res.relativeChangePercent.toFixed(2)}% ${res.icon}`;
            } else if (isFinite(res.relativeChangePercent)) { // Handles 0 correctly
                 formattedRelChange = `0.00% ${res.icon}`;
            }


            row.innerHTML = `
              <td>${res.metric}${res.isSignificant && res.uncertaintyString !== "N/A (Insufficient Data)" ? ' <span class="metric-star" title="Statistically Significant">⭐</span>' : ''}</td>
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

        // Add caveats to CSV
        let csvCaveats = [["Analysis Notes & Caveats"]];
        if(caveatsEl && caveatsEl.style.display !== 'none' && caveatsEl.querySelector('ul')) {
            const caveatItems = Array.from(caveatsEl.querySelectorAll('li'));
            caveatItems.forEach(item => {
                csvCaveats.push([`"${item.textContent.replace(/"/g, '""').replace(/⚠️|🚨/g, '').trim()}"`]);
            });
            csvCaveats.push([]); // Add an empty row for spacing
        } else {
            csvCaveats = []; // No caveats to add
        }


        const dataRows = tableRows.map(tr => {
            // Check if this row is the "No metrics" message
            if (tr.cells.length === 1 && tr.cells[0].colSpan === 7) {
                return [`"${tr.cells[0].textContent.replace(/"/g, '""')}"`];
            }
            const tds = Array.from(tr.querySelectorAll('td'));
            let metric = tds[0].textContent.replace('⭐', '').trim();
            let control = tds[1].textContent.trim();
            let experiment = tds[2].textContent.trim();
            let absChange = tds[3].textContent.trim();
            let relChangeText = tds[4].textContent.trim();
            // Extract just the percentage for CSV to make it numeric-friendly
            let relChangeVal = relChangeText.split('%')[0].replace('+', '').trim();


            let uncertainty = tds[5].textContent.trim();
            let significant = tds[6].textContent.trim();
            return [metric, control, experiment, absChange, relChangeVal, uncertainty, significant].map(text => `"${String(text).replace(/"/g, '""')}"`);
        });

        const csvContent = csvCaveats.map(e=>e.join(",")).join("\n") + header.concat(dataRows).map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'ab_test_analysis_results.csv';
        link.style.display = 'none'; document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
    // Add a new div in your HTML for these insights, perhaps below the table or caveats
// <div id="generatedInsights" class="insights-section" style="display:none; margin-top: 20px; padding:15px; border: 1px solid #4CAF50; background-color: #e8f5e9; border-radius: 4px;"></div>
function generateAndDisplayInsights(results, scenario, details, goalMetricName, confidence) {
    insightsEl.innerHTML = ''; // Clear previous insights
    insightsEl.style.display = 'none';

    if (!results || results.length === 0) {
        return;
    }

    let insightsHtml = '<h4>Key Observations & Potential Insights:</h4><ul style="list-style-type: disc; padding-left: 20px;">';
    let generatedInsightCount = 0;

    const alpha = parseFloat(confidenceLevelSelect.value); // Get alpha for confidence level string
    const confidencePctString = `${((1 - alpha) * 100).toFixed(0)}%`;

    // --- Overall Test Condition Insights (from existing caveats logic) ---
    if (scenario === 'SEQUENTIAL_NO_OVERLAP') {
        insightsHtml += `<li style="color: red;"><strong>Critical Warning:</strong> This was a sequential comparison, not a concurrent A/B test. Observed differences are highly likely influenced by time-based factors. Causal conclusions about the experiment's impact cannot be reliably made.</li>`;
        generatedInsightCount++;
    }
    if (scenario === 'PARTIAL_OVERLAP_ALIGNED' && details.isShortOverlap) {
        insightsHtml += `<li><strong>Consideration:</strong> The analyzed overlapping period of ${details.overlapDuration} days is relatively short. This may limit the statistical power to detect smaller, true effects. Longer tests are generally more reliable.</li>`;
        generatedInsightCount++;
    }
    if (document.getElementById('sessionWarning').style.display !== 'none') {
        insightsHtml += `<li><strong>Observation:</strong> A notable imbalance in session counts between Control and Experiment was detected. This can sometimes affect test interpretation, especially if the imbalance is very large.</li>`;
        generatedInsightCount++;
    }


    // --- Goal Metric Specific Insights ---
    const goalResult = results.find(r => r.metric === goalMetricName);
    if (goalResult) {
        const metricName = goalResult.metric;
        const relChange = goalResult.relativeChangePercent;
        const absChangeFormatted = formatAbsoluteChangeForDisplay(metricName, goalResult.absoluteChange); // Assuming this is available
        const isSig = goalResult.isSignificant;
        const uncertainty = goalResult.uncertaintyString;
        const isNegativeGood = ['bounce rate', 'cart abandonment', 'exit rate'].includes(metricName.toLowerCase().trim());

        if (isSig) {
            let liftDirection = relChange > 0 ? "increase" : "decrease";
            let impact = (isNegativeGood && relChange < 0) || (!isNegativeGood && relChange > 0) ? "positive" : "negative";
            let absRelDesc = `${absChangeFormatted} (a ${Math.abs(relChange).toFixed(2)}% relative ${liftDirection})`;

            insightsHtml += `<li>For your primary goal, <strong>${metricName}</strong>, the experiment showed a <strong>statistically significant ${impact} impact</strong> at the ${confidencePctString} confidence level.
                             It changed by approximately ${absRelDesc}.
                             The uncertainty is ${uncertainty}.</li>`;
            generatedInsightCount++;

            if (impact === "positive" && Math.abs(relChange) < 5) { // Example threshold for small significant lift
                insightsHtml += `<li style="color: darkgoldenrod;">While significant, the change in ${metricName} (${Math.abs(relChange).toFixed(2)}%) is relatively small. Evaluate if this magnitude of change meets business objectives.</li>`;
                generatedInsightCount++;
            }

        } else {
            insightsHtml += `<li>The change observed for your primary goal, <strong>${metricName}</strong>, was <strong>not statistically significant</strong> at the ${confidencePctString} confidence level.
                             The data suggests the experiment did not produce a reliably detectable effect on this metric (Uncertainty: ${uncertainty}).
                             This could mean there's no true difference, or the test lacked sufficient power to detect it.</li>`;
            generatedInsightCount++;
        }
    } else if (goalMetricName) {
        insightsHtml += `<li>Your selected goal metric "${goalMetricName}" was not found in the processed results. Please check the metric name or file contents.</li>`;
        generatedInsightCount++;
    }


    // --- General Significant Metric Insights ---
    const otherSignificantResults = results.filter(r => r.isSignificant && r.metric !== goalMetricName);
    if (otherSignificantResults.length > 0) {
        insightsHtml += `<li><strong>Other Notable Significant Changes:</strong>`;
        insightsHtml += `<ul style="list-style-type: circle; padding-left: 20px;">`;
        otherSignificantResults.slice(0, 3).forEach(res => { // Show top 3
            const metricName = res.metric;
            const relChange = res.relativeChangePercent;
            const isNegativeGood = ['bounce rate', 'cart abandonment', 'exit rate'].includes(metricName.toLowerCase().trim());
            let impact = (isNegativeGood && relChange < 0) || (!isNegativeGood && relChange > 0) ? "positive" : "negative";
            let liftDirection = relChange > 0 ? "increase" : "decrease";
            insightsHtml += `<li><strong>${metricName}</strong> saw a significant ${impact} ${liftDirection} of ${Math.abs(relChange).toFixed(2)}%.</li>`;
        });
        insightsHtml += `</ul></li>`;
        generatedInsightCount++;
    }

    // --- Conflicting Signals (Example) ---
    if (goalResult && goalResult.isSignificant && ((!['bounce rate', 'cart abandonment', 'exit rate'].includes(goalResult.metric.toLowerCase().trim()) && goalResult.relativeChangePercent > 0) || (['bounce rate', 'cart abandonment', 'exit rate'].includes(goalResult.metric.toLowerCase().trim()) && goalResult.relativeChangePercent < 0) )) { // Goal was positive
        const conflictingBadMetric = results.find(r =>
            r.isSignificant &&
            r.metric !== goalMetricName &&
            ( (['bounce rate', 'cart abandonment', 'exit rate'].includes(r.metric.toLowerCase().trim()) && r.relativeChangePercent > 0) || // Bad metric increased
              (!['bounce rate', 'cart abandonment', 'exit rate'].includes(r.metric.toLowerCase().trim()) && r.relativeChangePercent < 0 && r.metric.toLowerCase().includes("revenue")) // e.g. Revenue decreased
            )
        );
        if (conflictingBadMetric) {
            insightsHtml += `<li style="color: orange;"><strong>Potential Trade-off:</strong> While your goal metric <strong>${goalResult.metric}</strong> improved, there was a significant negative change in <strong>${conflictingBadMetric.metric}</strong> (${conflictingBadMetric.relativeChangePercent.toFixed(2)}%). This might indicate a trade-off to consider.</li>`;
            generatedInsightCount++;
        }
    }


    // --- Concluding Remark ---
    if (generatedInsightCount === 0) {
        insightsHtml += `<li>No specific automated insights generated. Please review the table data and caveats carefully.</li>`;
    } else {
        insightsHtml += `<li style="margin-top: 10px; font-style: italic;">These are automated observations. Always combine with your domain knowledge and the specific context of the test for final decision-making.</li>`;
    }

    insightsHtml += '</ul>';
    insightsEl.innerHTML = insightsHtml;
    insightsEl.style.display = 'block';

    // Scroll to insights if generated
    if (generatedInsightCount > 0) {
        insightsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}
});
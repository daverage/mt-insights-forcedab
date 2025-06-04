// Function to dynamically detect if a metric is "negative is good" (lower values are better)
function isNegativeGoodMetric(metricName) {
    const name = metricName.toLowerCase().trim();
    return name.includes('bounce') || name.includes('abandon');
}

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
    const smartABRadio = document.getElementById('smartABRadio');
    const quickCompareRadio = document.getElementById('quickCompareRadio');
    const quickCompareWeightingContainer = document.getElementById('quickCompareWeightingContainer');
    const quickCompareWeightingCheckbox = document.getElementById('quickCompareWeightingCheckbox');
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

    controlFileInput.addEventListener('change', handleFileSelect);
    experimentFileInput.addEventListener('change', handleFileSelect);
    runButton.addEventListener('click', runAnalysisAsync);
    exportButton.addEventListener('click', downloadCSV);

    // --- Core UI Handlers ---
    function handleFileSelect() {
        const controlFile = controlFileInput.files[0];
        const experimentFile = experimentFileInput.files[0];
        runButton.disabled = true;
        goalDropdown.disabled = true;
        goalDropdown.innerHTML = '<option value="">-- Select Goal --</option>';
        controlDailyData = null; experimentDailyData = null;
        originalControlDailyData = null; originalExperimentDailyData = null;
        metricHeaders = [];
        controlSessionsEl.textContent = 'N/A'; experimentSessionsEl.textContent = 'N/A';
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
                // Defensive check for parse errors or missing data
                if (!controlResult || !Array.isArray(controlResult.dailyData) || !experimentResult || !Array.isArray(experimentResult.dailyData)) {
                    throw new Error('One or both files could not be parsed or are missing valid daily data rows.');
                }
                originalControlDailyData = controlResult.dailyData;
                originalExperimentDailyData = experimentResult.dailyData;
                analysisDetails.controlSkippedDateRows = controlResult.skippedDateRows || 0;
                analysisDetails.experimentSkippedDateRows = experimentResult.skippedDateRows || 0;                let strategyResult;
                try {
                    strategyResult = determineAnalysisStrategyAndPrepareData(originalControlDailyData, originalExperimentDailyData);
                    console.log('DEBUG: strategyResult from determineAnalysisStrategyAndPrepareData:', strategyResult);
                } catch (error) {
                    console.error('ERROR: Exception in determineAnalysisStrategyAndPrepareData:', error, error.stack);
                    throw new Error('Failed to determine analysis strategy due to exception: ' + error.message);
                }
                
                if (!strategyResult) {
                    console.error('ERROR: strategyResult is null or undefined');
                    throw new Error('Failed to determine analysis strategy - strategyResult is null or undefined');
                }
                
                analysisScenario = strategyResult.scenario;
                analysisDetails = { ...analysisDetails, ...strategyResult.details };
                displayAnalysisCaveats(analysisScenario, analysisDetails, 'smartAB');
                const cTotal = aggregateSessions(strategyResult.processedControlData);
                const eTotal = aggregateSessions(strategyResult.processedExperimentData);
                controlSessionsEl.textContent = cTotal ? cTotal.toLocaleString() : 'N/A';
                experimentSessionsEl.textContent = eTotal ? eTotal.toLocaleString() : 'N/A';
                const cSess = parseFloat(cTotal), eSess = parseFloat(eTotal);
                sessionWarningEl.style.display = (cSess && eSess && (cSess/eSess>1.5||cSess/eSess<0.66)) ? 'block' : 'none';
                if (strategyResult.processedControlData.length && strategyResult.processedExperimentData.length) {
                    const expKeys = Object.keys(strategyResult.processedExperimentData[0]).map(k=>k.trim().toLowerCase());
                    metricHeaders = Object.keys(strategyResult.processedControlData[0])
                        .filter(k=>expKeys.includes(k.trim().toLowerCase()) && !['offer date','sessions'].includes(k.trim().toLowerCase()))
                        .map(k => k.trim()); // TRIM the actual header names to remove trailing spaces
                }
                if (metricHeaders.length) {
                    populateGoalDropdown(metricHeaders);
                    selectedGoal = goalDropdown.value;  // Set default goal metric
                    runButton.disabled = false;
                    updateLoaderStatus('Files loaded. Date ranges analyzed. Ready for analysis.');
                } else {
                    runButton.disabled = true;
                    updateLoaderStatus('Error: No common metrics found.');
                }
                setTimeout(hideLoader, 1500);
            }).catch(err=>{
                // Debugging: log error and stack
                console.error('Error processing files:', err, err && err.stack);
                updateLoaderStatus(`Error processing files: ${err}`);
                displayAnalysisCaveats('FILE_PARSE_ERROR',{message:err && err.toString ? err.toString() : String(err)});
                setTimeout(hideLoader, 3000);
            });
        } else {
            hideLoader();
        }
    }    function populateGoalDropdown(metrics) {
        goalDropdown.innerHTML = '<option value="">-- Select Goal --</option>';
        metrics.forEach(metric => {
            const option = document.createElement('option');
            option.value = metric;
            option.textContent = metric;
            goalDropdown.appendChild(option);
        });
        goalDropdown.disabled = false;
        if (metrics.length > 0) {
            selectedGoal = metrics[0];
            goalDropdown.value = selectedGoal;
        }
    }

    function scrollToExportButton() {
        const exportBtn = document.getElementById('exportCsvBtn');
        if (exportBtn) {
            exportBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    goalDropdown.addEventListener('change', () => {
      selectedGoal = goalDropdown.value;
      if (document.querySelector("#comparisonTable tbody").innerHTML) {
        const results = JSON.parse(runButton.dataset.results || '[]');
        displayMetrics(results);
      }
    });
async function runAnalysisAsync() {
    selectedGoal = goalDropdown.value;  // Capture current goal selection for charting
    const currentAnalysisMode = document.querySelector('input[name="analysisMode"]:checked')?.value;
    let controlDataForCurrentAnalysis, experimentDataForCurrentAnalysis;
    let currentScenario, currentDetailsForChart;

    showLoader("Initializing analysis...");
    runButton.disabled = true;
    exportButton.style.display = 'none';
    document.querySelector("#comparisonTable tbody").innerHTML = '';
    insightsEl.innerHTML = ''; insightsEl.style.display = 'none';

    if (currentAnalysisMode === 'smartAB') {
        const strategyResult = determineAnalysisStrategyAndPrepareData(originalControlDailyData, originalExperimentDailyData);
        controlDataForCurrentAnalysis = strategyResult.processedControlData;
        experimentDataForCurrentAnalysis = strategyResult.processedExperimentData;
        currentScenario = strategyResult.scenario;
        currentDetailsForChart = { ...analysisDetails, ...strategyResult.details };

        // --- Smart A/B Analysis logic STARTS HERE ---
        const allResults = [];
        const pValuesForBH = [];
        const resultIndicesForBH = [];        const useSessionWeightingForPointEstimates = document.getElementById('useSessionWeighting').checked;
        
        const controlSummaryOverall = calculateSummaryRow(controlDataForCurrentAnalysis, metricHeaders, useSessionWeightingForPointEstimates);
        const experimentSummaryOverall = calculateSummaryRow(experimentDataForCurrentAnalysis, metricHeaders, useSessionWeightingForPointEstimates);
        
        for (let i = 0; i < metricHeaders.length; i++) {            const metricKey = metricHeaders[i];
            updateLoaderStatus(`Smart A/B Analysis for "${metricKey}"... (${i+1}/${metricHeaders.length})`); // Progress update
            
            // Point estimates
            const ctrlOverallMetricVal = controlSummaryOverall[metricKey];
            const expOverallMetricVal = experimentSummaryOverall[metricKey];
            
            let absoluteChange = null;
            if (ctrlOverallMetricVal !== null && expOverallMetricVal !== null) {
                absoluteChange = expOverallMetricVal - ctrlOverallMetricVal;
            }
            let relativeChangePercent = null;
            if (ctrlOverallMetricVal !== null && expOverallMetricVal !== null && ctrlOverallMetricVal !== 0) {
                relativeChangePercent = ((expOverallMetricVal - ctrlOverallMetricVal) / ctrlOverallMetricVal) * 100;
            } else if (ctrlOverallMetricVal === 0 && expOverallMetricVal > 0) {
                relativeChangePercent = Infinity;
            } else if (ctrlOverallMetricVal === 0 && expOverallMetricVal === 0) {
                relativeChangePercent = 0;
            }
            
            const alpha = 0.05; 
            const iterations = 3000; 
            let an_bootstrapResult = bootstrapMetric(controlDataForCurrentAnalysis, experimentDataForCurrentAnalysis, metricKey, iterations, alpha);
            let finalLiftForDisplay = relativeChangePercent;
            let uncertaintyString = 'N/A';
            let isSignificantFlag = false;

            if (an_bootstrapResult) {
                finalLiftForDisplay = an_bootstrapResult.lift * 100;
                const lowerCI_b = an_bootstrapResult.lowerBound * 100;
                const upperCI_b = an_bootstrapResult.upperBound * 100;
                uncertaintyString = `Bootstrap CI: (${lowerCI_b >= 0 ? '+' : ''}${lowerCI_b.toFixed(2)}%, ${upperCI_b >= 0 ? '+' : ''}${upperCI_b.toFixed(2)}%)`; // Explicitly state Bootstrap
                isSignificantFlag = an_bootstrapResult.significant; // Use pre-BH significance
                if (typeof an_bootstrapResult.pValue === 'number') {
                    pValuesForBH.push(an_bootstrapResult.pValue);
                    resultIndicesForBH.push(allResults.length);
                }
            }
            
            let an_bayesianResult = runBayesianBetaBinomial(controlDataForCurrentAnalysis, experimentDataForCurrentAnalysis, metricKey, alpha);
              let an_ttestResult = null;
            let an_mdeValue = null;
            const controlVals = controlDataForCurrentAnalysis.map(row => parseMetricValue(getCleanedValue(row, metricKey))).filter(v => v !== null && !isNaN(v));
            const experimentVals = experimentDataForCurrentAnalysis.map(row => parseMetricValue(getCleanedValue(row, metricKey))).filter(v => v !== null && !isNaN(v));
            if (controlVals.length >= 2 && experimentVals.length >= 2) {
                an_ttestResult = calculateTTestConfidence(controlVals, experimentVals, alpha);
                const power = 0.8;
                const n1 = controlVals.length;
                const n2 = experimentVals.length;
                const var1 = jStat.variance(controlVals, true);
                const var2 = jStat.variance(experimentVals, true);
                const baselineMeanControl = ctrlOverallMetricVal; // from summary
                const mdeCalc = calculatePostHocMDE(alpha, power, n1, var1, n2, var2, baselineMeanControl);
                if (mdeCalc && mdeCalc.relativeMDEPercent !== null) {
                    an_mdeValue = mdeCalc.relativeMDEPercent;
                }
            }            allResults.push({
                metric: metricKey,
                controlValFormatted: formatValueForDisplay(metricKey, ctrlOverallMetricVal),
                experimentValFormatted: formatValueForDisplay(metricKey, expOverallMetricVal),
                absoluteChange: absoluteChange,
                relativeChangePercent: finalLiftForDisplay,
                uncertaintyString: uncertaintyString,
                isSignificant: isSignificantFlag, // pre-BH
                absLift: Math.abs(finalLiftForDisplay || 0),
                icon: '', // Will be set in displayMetrics
                _isOptimizedViewRun: true, // Indicates Smart A/B or similar comprehensive run
                _bootstrapResult: an_bootstrapResult,
                _ttestResult: an_ttestResult,
                _mdeValue: an_mdeValue,
                _bayesianResult: an_bayesianResult,
                analysisScenario: currentScenario // <-- Add scenario context for UI
            });
              // Yield to UI for responsiveness
            if (i % 1 === 0) await new Promise(r => setTimeout(r, 0));
        }
        
        if (pValuesForBH.length > 0) {
            updateLoaderStatus('Applying Benjamini-Hochberg correction...');
            const correctedSignificanceFlags = benjaminiHochberg(pValuesForBH, 0.05);
            resultIndicesForBH.forEach((resultArrayIndex, pValueIndex) => {
                if (allResults[resultArrayIndex]) {
                    allResults[resultArrayIndex].isSignificant = correctedSignificanceFlags[pValueIndex];
                }
            });
        }
        
        runButton.dataset.results = JSON.stringify(allResults);
        displayMetrics(allResults);
        // Debugging: Log allResults to check for analysisScenario property
        console.log('DEBUG: allResults', allResults);
        // Also log each result's analysisScenario for clarity
        allResults.forEach((r, idx) => {
            console.log(`DEBUG: result[${idx}].analysisScenario =`, r.analysisScenario);
        });
        if (allResults.length > 0) {
            exportButton.style.display = 'inline-block';
            generateAndDisplayInsights(allResults, currentScenario, currentDetailsForChart, selectedGoal, currentAnalysisMode);
            scrollToExportButton();            // >>>>>>>>>>>> CALL CHART DISPLAY HERE FOR SMART A/B <<<<<<<<<<<<<<<
            window.showGoalMetricTrendChart(
                currentAnalysisMode,
                selectedGoal,
                controlDataForCurrentAnalysis,
                experimentDataForCurrentAnalysis,
                currentDetailsForChart,
                currentScenario
            );
        } else {
            if (document.getElementById('goalMetricChartContainer')) {
                document.getElementById('goalMetricChartContainer').style.display = 'none';
            }
        }    } else if (currentAnalysisMode === 'quickCompare') {
        controlDataForCurrentAnalysis = originalControlDailyData;
        experimentDataForCurrentAnalysis = originalExperimentDailyData;
        currentScenario = analysisScenario;
        currentDetailsForChart = analysisDetails;
        
        // Quick Compare analysis logic
        const useWeightingQuickCompare = quickCompareWeightingCheckbox ? quickCompareWeightingCheckbox.checked : false;
        const allResults = [];
        
        for (let i = 0; i < metricHeaders.length; i++) {
            const metricKey = metricHeaders[i];
            updateLoaderStatus(`Quick Compare for "${metricKey}"... (${i+1}/${metricHeaders.length})`); // Progress update            
            
            const ctrlOverallMetricVal = calculateSummaryRow(controlDataForCurrentAnalysis, [metricKey], useWeightingQuickCompare)[metricKey];
            const expOverallMetricVal = calculateSummaryRow(experimentDataForCurrentAnalysis, [metricKey], useWeightingQuickCompare)[metricKey];
            
            let absoluteChange = null;
            if (ctrlOverallMetricVal !== null && expOverallMetricVal !== null) {
                absoluteChange = expOverallMetricVal - ctrlOverallMetricVal;
            }
            let relativeChangePercent = null;
            if (ctrlOverallMetricVal !== null && expOverallMetricVal !== null && ctrlOverallMetricVal !== 0) {
                relativeChangePercent = ((expOverallMetricVal - ctrlOverallMetricVal) / ctrlOverallMetricVal) * 100;
            } else if (ctrlOverallMetricVal === 0 && expOverallMetricVal > 0) {
                relativeChangePercent = Infinity;
            } else if (ctrlOverallMetricVal === 0 && expOverallMetricVal === 0) {
                relativeChangePercent = 0;
            }

            const finalLiftForDisplay = relativeChangePercent;
            const uncertaintyString = 'N/A (Descriptive Comparison)';
            const isSignificantFlag = false; // Significance is not applicable
              let icon = '';
            if (finalLiftForDisplay !== null && !isNaN(finalLiftForDisplay) && isFinite(finalLiftForDisplay)) {
                const metricKeyLower = metricKey.toLowerCase().trim();
                if (isNegativeGoodMetric(metricKey)) {
                    if (finalLiftForDisplay < 0) icon = '<span class="significant-icon lift-up">▼</span>';
                    else if (finalLiftForDisplay > 0) icon = '<span class="significant-icon lift-down">▲</span>';
                    else icon = '<span class="significant-icon" style="font-weight:1000;color: goldenrod;">–</span>';
                } else {
                    if (finalLiftForDisplay > 0) icon = '<span class="significant-icon lift-up">▲</span>';
                    else if (finalLiftForDisplay < 0) icon = '<span class="significant-icon lift-down">▼</span>';
                    else icon = '<span class="significant-icon" style="font-weight:1000;color: goldenrod;">–</span>';
                }
            }

            allResults.push({
                metric: metricKey,
                controlValFormatted: formatValueForDisplay(metricKey, ctrlOverallMetricVal),
                experimentValFormatted: formatValueForDisplay(metricKey, expOverallMetricVal),
                absoluteChange: absoluteChange,
                relativeChangePercent: finalLiftForDisplay,
                uncertaintyString: uncertaintyString,
                isSignificant: isSignificantFlag,
                absLift: Math.abs(finalLiftForDisplay || 0),
                icon: icon,
                _isOptimizedViewRun: false, // Not an "optimized" statistical run
                _basicModeUsed: 'quick_compare',
                _bootstrapResult: null,
                _ttestResult: null,
                _mdeValue: null,
                _bayesianResult: null,
                analysisScenario: currentScenario // <-- Add scenario context for UI
            });
            // Yield to UI for responsiveness
            if (i % 1 === 0) await new Promise(r => setTimeout(r, 0));
        }
        
        runButton.dataset.results = JSON.stringify(allResults);
        displayMetrics(allResults);
        // Debugging: Log allResults to check for analysisScenario property
        console.log('DEBUG: allResults', allResults);
        // Also log each result's analysisScenario for clarity
        allResults.forEach((r, idx) => {
            console.log(`DEBUG: result[${idx}].analysisScenario =`, r.analysisScenario);
        });
        if (allResults.length > 0) {
            exportButton.style.display = 'inline-block';
            generateAndDisplayInsights(allResults, currentScenario, currentDetailsForChart, selectedGoal, currentAnalysisMode);
            scrollToExportButton();            // >>>>>>>>>>>> CALL CHART DISPLAY HERE FOR QUICK COMPARE <<<<<<<<<<<<<<<
            window.showGoalMetricTrendChart(
                currentAnalysisMode,
                selectedGoal,
                originalControlDailyData,
                originalExperimentDailyData,
                currentDetailsForChart,
                currentScenario
            );
        } else {
            if (document.getElementById('goalMetricChartContainer')) {
                document.getElementById('goalMetricChartContainer').style.display = 'none';
            }
        }
    } else {
        if (document.getElementById('goalMetricChartContainer')) {
            document.getElementById('goalMetricChartContainer').style.display = 'none';
        }
    }
    updateLoaderStatus("Analysis complete!");
    setTimeout(hideLoader, 1500);
    runButton.disabled = false;
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
});
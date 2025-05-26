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

function displayAnalysisCaveats(currentScenario, currentDetails, currentAnalysisMode = 'smartAB') {
    const caveatsEl = document.getElementById('analysisCaveats');
    const controlSessionsEl = document.getElementById('controlSessions');
    const experimentSessionsEl = document.getElementById('experimentSessions');
    const runButton = document.getElementById('runAnalysisBtn');
    if (!caveatsEl) return;
    caveatsEl.innerHTML = '';

    let html = '<h4>Analysis Notes & Caveats:</h4><ul>';
    const warningIcon = '<span style="color:orange;font-weight:bold;">⚠️</span>';
    const criticalIcon = '<span style="color:red;font-weight:bold;">🚨</span>';

    if (currentAnalysisMode === 'quickCompare') {
        html += `<li>${criticalIcon} <strong style="color:red;font-size:1.2em;">Quick Data Comparison Mode</strong><br>
        You are in <strong>Quick Data Comparison</strong> mode. Data for Control and Experiment are analyzed as provided, <strong>without aligning to an overlap period</strong>.<br>
        <strong>Results are descriptive only</strong> and differences may be due to time-based factors, not necessarily the experimental change.<br>
        <strong>Statistical significance is not applicable.</strong></li>`;
        html += `<li>Control data full date range: <strong>${currentDetails.controlFullRange || 'N/A'}</strong></li>`;
        html += `<li>Experiment data full date range: <strong>${currentDetails.experimentFullRange || 'N/A'}</strong></li>`;
        if ((currentDetails.controlSkippedDateRows > 0) || (currentDetails.experimentSkippedDateRows > 0)) {
            html += `<li>${warningIcon} Note: ${currentDetails.controlSkippedDateRows || 0} rows in Control file and ${currentDetails.experimentSkippedDateRows || 0} rows in Experiment file were ignored due to unparseable or missing dates.</li>`;
        }
        html += '</ul>';
        caveatsEl.innerHTML = html;
        caveatsEl.style.display = 'block';
        return;
    }

    // --- Smart A/B Mode (existing logic) ---
    html += `<li>Control data originally parsed as: ${currentDetails.controlFullRange || 'N/A'}.</li>`;
    html += `<li>Experiment data originally parsed as: ${currentDetails.experimentFullRange || 'N/A'}.</li>`;

    // Show skipped date rows if any
    if ((currentDetails.controlSkippedDateRows > 0) || (currentDetails.experimentSkippedDateRows > 0)) {
        html += `<li>${warningIcon} Note: ${currentDetails.controlSkippedDateRows || 0} rows in Control file and ${currentDetails.experimentSkippedDateRows || 0} rows in Experiment file were ignored due to unparseable or missing dates.</li>`;
    }

    // --- Session Imbalance Caveat ---
    // Only show if both session counts are available and >0
    const cSess = parseFloat(controlSessionsEl.textContent.replace(/[^0-9.-]+/g, ''));
    const eSess = parseFloat(experimentSessionsEl.textContent.replace(/[^0-9.-]+/g, ''));
    if (cSess && eSess && (cSess / eSess > 1.5 || cSess / eSess < 0.66)) {
        html += `<li>${warningIcon} <strong>Session Imbalance:</strong> When session counts are highly imbalanced (e.g., more than a 50% difference), carefully consider if the user populations are truly comparable beyond the tested change. Such imbalances might hint at issues in test setup, traffic allocation, or an external factor disproportionately affecting one group. While session weighting is applied to mitigate statistical impact on rate metrics, the underlying population comparability remains a key consideration.</li>`;
    }

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
            html += `<li>${criticalIcon} <strong style="color:red;font-size:1.2em;">CRITICAL WARNING: SEQUENTIAL COMPARISON!</strong><br>
            <strong>${currentDetails.message}</strong><br>
            The data ranges for Control and Experiment do not overlap. This is not a valid A/B test comparison. Observed differences are highly likely to be due to time-based confounding factors, not the experimental change.</li>`;
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
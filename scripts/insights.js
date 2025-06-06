function generateAndDisplayInsights(results, scenario, details, goalMetricName, currentAnalysisMode = 'smartAB') {
    const insightsEl = document.getElementById('generatedInsights');
    insightsEl.innerHTML = '';
    insightsEl.style.display = 'none';

    if (!results || results.length === 0) {
        return;
    }

    // Function to dynamically detect if a metric is "negative is good" (lower values are better)
    function isNegativeGoodMetric(metricName) {
        const name = metricName.toLowerCase().trim();
        return name.includes('bounce') || name.includes('abandon');
    }

    let insightsHtml = '<h4>Key Observations & Potential Insights:</h4><ul style="list-style-type: disc; padding-left: 20px;">';
    let generatedInsightCount = 0;

    if (currentAnalysisMode === 'quickCompare') {
        // Descriptive, non-causal, non-statistical insights
        results.forEach(res => {
            const metricName = res.metric;
            const relChange = res.relativeChangePercent;
            const absChangeFormatted = formatAbsoluteChangeForDisplay(metricName, res.absoluteChange);
            let direction = relChange > 0 ? 'higher' : (relChange < 0 ? 'lower' : 'no difference in');
            let relChangeText = (relChange !== null && isFinite(relChange)) ? Math.abs(relChange).toFixed(2) + '%' : 'N/A';
            if (relChange !== null && isFinite(relChange) && relChange !== 0) {
                insightsHtml += `<li>Experiment showed a <strong>${relChangeText} ${direction}</strong> <strong>${metricName}</strong> compared to Control during their respective periods (absolute change: ${absChangeFormatted}).</li>`;
            } else {
                insightsHtml += `<li>No meaningful difference in <strong>${metricName}</strong> between Experiment and Control during their respective periods.</li>`;
            }
            generatedInsightCount++;
        });
        insightsHtml += `<li style="margin-top: 10px; color: #b36b00;"><em>Note: These are descriptive observations only. Because the data periods may not align, differences may reflect time-based factors or other confounders, not necessarily the experimental change. No statistical significance or confidence intervals are calculated in this mode.</em></li>`;
        insightsHtml += '</ul>';
        insightsEl.innerHTML = insightsHtml;
        insightsEl.style.display = 'block';
        if (generatedInsightCount > 0) {
            insightsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        return;
    }

    // --- Smart A/B Mode (existing logic) ---
    const alpha = 0.05; // Hardcoded for now
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

        // --- Bayesian-specific insight ---
        if (goalResult && goalResult._isOptimizedViewRun && goalResult._bayesianResult && goalResult._bayesianResult.type === 'rate') {
            // Extract Bayesian results directly
            const probExpBetter = goalResult._bayesianResult.probExpBetter * 100;
            const ciLower = goalResult._bayesianResult.credibleIntervalLower * 100;
            const ciUpper = goalResult._bayesianResult.credibleIntervalUpper * 100;
            insightsHtml += `<li>Bayesian analysis for <strong>${metricName}</strong> suggests a <strong>${probExpBetter !== null ? probExpBetter.toFixed(1) : '?'}%</strong> probability that the Experiment outperforms Control.<br>
            The estimated lift is likely between <strong>${ciLower !== null ? ciLower.toFixed(1) : '?'}%</strong> and <strong>${ciUpper !== null ? ciUpper.toFixed(1) : '?'}%</strong> (at 95% credibility).</li>`;
            generatedInsightCount++;
        }        if (isSig) {
            let liftDirection = relChange > 0 ? "increase" : "decrease";
            const metricNameLower = metricName.toLowerCase().trim();
            const isNegativeGood = isNegativeGoodMetric(metricName);
            let impact = (isNegativeGood && relChange < 0) || (!isNegativeGood && relChange > 0) ? "positive" : "negative";
            let absRelDesc = `${absChangeFormatted} (a ${Math.abs(relChange).toFixed(2)}% relative ${liftDirection})`;

            insightsHtml += `<li>For your primary goal, <strong>${metricName}</strong>, the experiment showed a <strong>statistically significant ${impact} impact</strong> at the ${confidencePctString} confidence level.
                             It changed by approximately ${absRelDesc}.
                             The uncertainty is ${uncertainty}.</li>`;
            generatedInsightCount++;

            if (impact === "positive" && Math.abs(relChange) < 5) // Example threshold for small significant lift
                insightsHtml += `<li style="color: darkgoldenrod;">While significant, the change in ${metricName} (${Math.abs(relChange).toFixed(2)}%) is relatively small. Evaluate if this magnitude of change meets business objectives.</li>`;
            generatedInsightCount++;
        } else {
            insightsHtml += `<li>The change observed for your primary goal, <strong>${metricName}</strong>, was <strong>not statistically significant</strong> at the ${confidencePctString} confidence level.
                             The data suggests the experiment did not produce a reliably detectable effect on this metric (Uncertainty: ${uncertainty}).
                             This could mean there's no true difference, or the test lacked sufficient power to detect it.</li>`;
            generatedInsightCount++;

            // --- MDE/Power Explanation for Non-Significant Result (T-Test Mode) ---
            // Try to extract MDE from the uncertainty string (e.g., "(MDE: ±5.5%)")
            let mdeMatch = uncertainty && uncertainty.match(/MDE: ±([\d.]+)%/);
            let mdeValue = mdeMatch ? parseFloat(mdeMatch[1]) : null;
            const powerValue = 0.8;
            if (mdeValue !== null && !isNaN(mdeValue)) {
                insightsHtml += `<li>For <strong>${metricName}</strong>, the observed difference was not statistically significant.<br>
                This test had approximately <strong>${(powerValue * 100).toFixed(0)}%</strong> power to detect a relative change of at least <strong>${mdeValue.toFixed(1)}%</strong>.<br>
                The true effect, if any, might be smaller than this, or the test may have been underpowered.</li>`;
                generatedInsightCount++;
            }
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
            const isNegativeGood = isNegativeGoodMetric(metricName);
            let impact = (isNegativeGood && relChange < 0) || (!isNegativeGood && relChange > 0) ? "positive" : "negative";
            let liftDirection = relChange > 0 ? "increase" : "decrease";
            insightsHtml += `<li><strong>${metricName}</strong> saw a significant ${impact} ${liftDirection} of ${Math.abs(relChange).toFixed(2)}%.</li>`;
        });
        insightsHtml += `</ul></li>`;
        generatedInsightCount++;
    }    // --- Conflicting Signals (Example) ---
    if (goalResult && goalResult.isSignificant && ((!isNegativeGoodMetric(goalResult.metric) && goalResult.relativeChangePercent > 0) || (isNegativeGoodMetric(goalResult.metric) && goalResult.relativeChangePercent < 0) )) { // Goal was positive
        const conflictingBadMetric = results.find(r =>
            r.isSignificant &&
            r.metric !== goalMetricName &&
            ( (isNegativeGoodMetric(r.metric) && r.relativeChangePercent > 0) || // Bad metric increased (bounce/abandon went up)
              (!isNegativeGoodMetric(r.metric) && r.relativeChangePercent < 0 && r.metric.toLowerCase().includes("revenue")) // e.g. Revenue decreased
            )
        );
        if (conflictingBadMetric) {
            insightsHtml += `<li style="color: orange;"><strong>Potential Trade-off:</strong> While your goal metric <strong>${goalResult.metric}</strong> improved, there was a significant negative change in <strong>${conflictingBadMetric.metric}</strong> (${conflictingBadMetric.relativeChangePercent.toFixed(2)}%). This might indicate a trade-off to consider.</li>`;
            generatedInsightCount++;
        }
    }


    // --- General Concluding Remark ---
    insightsHtml += `<li style="margin-top: 10px; font-style: italic; color: #444;">If results are inconclusive (e.g., not statistically significant, MDE is high, or Bayesian P(Exp > Ctrl) is near 50%), consider if the test duration was sufficient, if the change implemented was too subtle, or if there's high variability in the data.</li>`;


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
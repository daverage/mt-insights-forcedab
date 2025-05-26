function runBayesianBetaBinomial(controlDailyDataForMetric, experimentDailyDataForMetric, metricKey, alphaCredibleInterval = 0.05) {
// Helper to check if metric is likely a rate
const isLikelyRateMetric = (mKey, sampleValue) => {
    const mKeyLower = mKey.toLowerCase();
    if (mKeyLower.includes("rate") || mKeyLower.includes("conversion")) return true;
    if (typeof sampleValue === 'number' && sampleValue >= 0 && sampleValue <= 1.0001) return true;
    return false;
};
let sampleCtrlVal, sampleExpVal;
if (controlDailyDataForMetric.length > 0) sampleCtrlVal = parseValue(getCleanedValue(controlDailyDataForMetric[0], metricKey));
if (experimentDailyDataForMetric.length > 0) sampleExpVal = parseValue(getCleanedValue(experimentDailyDataForMetric[0], metricKey));
if (!isLikelyRateMetric(metricKey, sampleCtrlVal) && !isLikelyRateMetric(metricKey, sampleExpVal)) {
    return { type: 'not_rate', probExpBetter: null, medianLift: null, credibleIntervalLower: null, credibleIntervalUpper: null, message: "Metric not identified as a rate for Beta-Binomial." };
}
let totalControlConversions = 0, totalControlSessions = 0;
controlDailyDataForMetric.forEach(row => {
    const sessions = parseValue(getCleanedValue(row, 'Sessions'));
    const metricVal = parseValue(getCleanedValue(row, metricKey));
    if (sessions > 0 && metricVal !== null && !isNaN(metricVal)) {
        totalControlConversions += metricVal * sessions;
        totalControlSessions += sessions;
    }
});
let totalExperimentConversions = 0, totalExperimentSessions = 0;
experimentDailyDataForMetric.forEach(row => {
    const sessions = parseValue(getCleanedValue(row, 'Sessions'));
    const metricVal = parseValue(getCleanedValue(row, metricKey));
    if (sessions > 0 && metricVal !== null && !isNaN(metricVal)) {
        totalExperimentConversions += metricVal * sessions;
        totalExperimentSessions += sessions;
    }
});
if (totalControlSessions === 0 || totalExperimentSessions === 0) {
    return { type: 'rate', probExpBetter: null, medianLift: null, credibleIntervalLower: null, credibleIntervalUpper: null, message: "No sessions or conversions for Bayesian analysis." };
}
const priorAlpha = 1, priorBeta = 1;
const alpha_c_post = priorAlpha + totalControlConversions;
const beta_c_post = priorBeta + totalControlSessions - totalControlConversions;
const alpha_e_post = priorAlpha + totalExperimentConversions;
const beta_e_post = priorBeta + totalExperimentSessions - totalExperimentConversions;
const numSamples = 10000;
const ctrlSamples = [];
const expSamples = [];
for (let i = 0; i < numSamples; i++) {
    ctrlSamples.push(jStat.beta.sample(alpha_c_post, beta_c_post));
    expSamples.push(jStat.beta.sample(alpha_e_post, beta_e_post));
}
let expBetterCount = 0;
const liftSamples = [];
for (let i = 0; i < numSamples; i++) {
    if (expSamples[i] > ctrlSamples[i]) expBetterCount++;
    // Avoid division by zero
    if (ctrlSamples[i] > 0) {
        liftSamples.push((expSamples[i] - ctrlSamples[i]) / ctrlSamples[i]);
    } else {
        liftSamples.push(0);
    }
}
liftSamples.sort((a, b) => a - b);
const lowerIdx = Math.floor((alphaCredibleInterval / 2) * numSamples);
const upperIdx = Math.floor((1 - alphaCredibleInterval / 2) * numSamples) - 1;
const medianIdx = Math.floor(numSamples / 2);
return {
    type: 'rate',
    probExpBetter: expBetterCount / numSamples,
    medianLift: liftSamples[medianIdx],
    credibleIntervalLower: liftSamples[lowerIdx],
    credibleIntervalUpper: liftSamples[upperIdx]
};
}
function bootstrapMetric(controlDataForBootstrap, experimentDataForBootstrap, metricKey, iterations = 5000, alpha = 0.05) {
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

    let p_value_bootstrap;
    if (lifts.length === 0) {
        p_value_bootstrap = 1.0;
    } else {
        const iterations = lifts.length;
        // Sort lifts to get the median
        const sortedLifts = [...lifts].sort((a, b) => a - b);
        const medianLift = sortedLifts[Math.floor(iterations / 2)];
        let countOtherSide;
        if (medianLift > 0) {
            countOtherSide = lifts.filter(l => l <= 0).length;
        } else {
            countOtherSide = lifts.filter(l => l > 0).length;
        }
        p_value_bootstrap = 2 * (countOtherSide / iterations);
        if (p_value_bootstrap > 1.0) p_value_bootstrap = 1.0;
    }

    return {
        lift: medianLift,
        lowerBound: lowerBoundLift,
        upperBound: upperBoundLift,
        significant: (lowerBoundLift > 0 && upperBoundLift > 0) || (lowerBoundLift < 0 && upperBoundLift < 0),
        pValue: p_value_bootstrap
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

function calculatePostHocMDE(alpha, power, n1, var1, n2, var2, baselineMeanControl) {
    // Robust jStat dependency check
    if (!window.jStat || !window.jStat.studentt || typeof window.jStat.studentt.inv !== 'function') {
        console.warn("jStat is not available for MDE calculation.");
        return { absoluteMDE: null, relativeMDEPercent: null };
    }
    if (n1 < 2 || n2 < 2 || var1 < 0 || var2 < 0) return { absoluteMDE: null, relativeMDEPercent: null };
    if (!isFinite(baselineMeanControl) || baselineMeanControl === 0) return { absoluteMDE: null, relativeMDEPercent: null };
    const beta = 1 - power;
    const df_welch = Math.pow(var1 / n1 + var2 / n2, 2) /
        ((Math.pow(var1 / n1, 2) / (n1 - 1)) + (Math.pow(var2 / n2, 2) / (n2 - 1)));
    const t_alpha_half = window.jStat.studentt.inv(1 - alpha / 2, df_welch);
    const t_beta = window.jStat.studentt.inv(1 - beta, df_welch);
    // Absolute MDE
    const absMDE = (t_alpha_half + t_beta) * Math.sqrt(var1 / n1 + var2 / n2);
    // Relative MDE
    const relMDE = absMDE / Math.abs(baselineMeanControl);
    return {
        absoluteMDE: absMDE,
        relativeMDEPercent: relMDE * 100
    };
}
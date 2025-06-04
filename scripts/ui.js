// UI utility functions - contains only unique display functions not duplicated in main.js

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
            metricStar = ' <span class="significance-star">★</span>';
        }

        let formattedAbsChange = formatAbsoluteChangeForDisplay(res.metric, res.absoluteChange);
        let formattedRelChange = "N/A";
        if (res.relativeChangePercent !== null && !isNaN(res.relativeChangePercent) && isFinite(res.relativeChangePercent)) {
            formattedRelChange = `${res.relativeChangePercent >= 0 ? '+' : ''}${res.relativeChangePercent.toFixed(2)}%`;
        } else if (isFinite(res.relativeChangePercent)) {
            formattedRelChange = "0.00%";
        }

        let uncertaintyCellContent = res.uncertaintyString || 'N/A';
        let significanceCellContent = res.isSignificant ? 'Yes' : 'No';
        if (!isSignificanceApplicable) {
            significanceCellContent = 'N/A';
        }

        let icon = '';
        function isNegativeGoodMetric(metricName) {
            const name = metricName.toLowerCase().trim();
            return name.includes('bounce') || name.includes('abandon');
        }
        
        if (res.relativeChangePercent !== null && !isNaN(res.relativeChangePercent) && isFinite(res.relativeChangePercent)) {
            const metricKeyLower = res.metric.toLowerCase().trim();
            if (isNegativeGoodMetric(res.metric)) {
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
# A/B Test Results Analyzer

A modern, robust, and transparent tool for analyzing A/B test results from daily CSV data. Designed for clarity, statistical rigor, and practical decision-making.

## Features
- **Upload & Compare:** Upload two CSV files (Control & Experiment) with daily data for the same date range.
- **Clear Change Breakdown:** For each metric, see absolute change (e.g., +£0.15, +2.5pp), relative change (lift, %), and uncertainty (confidence interval or p-value).
- **Statistical Rigor:**
  - **Bootstrap Mode (Recommended):** Robust resampling to estimate a confidence interval for the lift. No normality assumption required.
  - **Welch's T-Test Mode:** Compares daily means, providing a p-value. Assumes daily values are approximately normal.
- **Significance Highlighted:** Statistically significant results (at your chosen confidence level) are clearly marked with a star and "Yes" in the table. Arrows indicate direction and whether a change is good or bad for each metric.
- **Multiple Metrics Correction:** Adjusts for multiple comparisons using the Benjamini-Hochberg procedure to control false discoveries.
- **CSV Export:** Download the full results table for further analysis or reporting.

## How to Use
1. Prepare two CSV files with daily data for the same date range (one for Control, one for Experiment).
2. Open `test.html` in your browser (no server required).
3. Upload your files, select your analysis mode and confidence level, and run the analysis.
4. Review the results table for each metric:
   - **Abs. Change:** The absolute difference (e.g., +£0.15, +2.5pp).
   - **Rel. Change (%):** The percentage lift/drop, with arrows and color cues.
   - **Uncertainty:** Confidence interval (bootstrap) or p-value (t-test).
   - **Significant?:** Whether the result is statistically significant at your chosen level.
5. Download the results as CSV if needed.

## Best Practices & Caveats
- **Data Quality:** Ensure both CSVs have accurate, daily data for the same date range. Remove outliers and anomalies from both files before upload.
- **Significance ≠ Importance:** "Significant? Yes" means the result is unlikely due to random chance, but always consider the size and business impact of the change. "No" means the test was inconclusive, not that there is no effect.
- **Multiple Metrics:** Testing many metrics increases the chance of a false positive. Focus on your primary goal metric(s) for decisions.
- **Assumptions:** Bootstrap is robust to non-normality; t-test assumes daily values are roughly normal. Both require representative daily data.
- **External Factors:** The tool cannot account for outside events that may have influenced results.

---

This tool provides statistical evidence. Always combine with business context and judgment for decisions.
# Monetate A/B Test Analysis Tool

A modern, robust, and accessible tool for analyzing A/B test results with clear statistics, Monetate branding, and contextual insights.

## Features

- **Flexible CSV Input:**
  - Accepts two CSV files (Control & Experiment) with daily data.
  - Accepts either an `Offer Date` or `Date` column (YYYY-MM-DD format, case-insensitive) for date alignment.
  - `Sessions` column is recommended for accurate weighting, but not strictly required. If missing, a warning is shown and some features may be limited.
- **Automatic Data Alignment:**
  - Detects and aligns overlapping date ranges for fair comparison.
  - Provides clear caveats and warnings for sequential (non-overlapping) or short overlap scenarios.
- **Statistical Rigor:**
  - **Bootstrap Mode (Recommended):** Robust resampling for confidence intervals (CI) on lift.
  - **Welch's T-Test Mode:** Compares daily means, provides p-value (assumes normality).
  - **Multiple Metrics Correction:** Benjamini-Hochberg procedure controls false discoveries in bootstrap mode.
- **Clear Results Table:**
  - Shows absolute change (e.g., +£0.15, +2.5pp), relative change (lift, %), uncertainty (CI or p-value), and significance for each metric.
  - Arrows and stars indicate direction and significance.
- **Automated Contextual Insights:**
  - Generates natural-language, scenario-aware insights and warnings based on your results, test scenario, and selected goal metric.
- **Accessibility & Monetate Branding:**
  - Fully accessible (ARIA, skip links, table captions, keyboard navigation).
  - Monetate brand palette, modern UI, and responsive design.
- **Export:**
  - Download results and caveats as a CSV file.

## How to Use

1. **Prepare Your Data:**
   - Each CSV should have daily rows with at least a date column (`Offer Date` or `Date`, format YYYY-MM-DD).
   - A `Sessions` column is recommended for accurate weighting, but not required.
   - Remove summary rows, outliers, and anomalies for best results.
2. **Upload Files:**
   - Use the form to upload your Control and Experiment CSVs.
3. **Configure Analysis:**
   - Select your primary goal metric, analysis mode, and confidence level.
   - Adjust bootstrap iterations and session weighting as needed.
4. **Run Analysis:**
   - Click **Run Analysis**. The tool will align dates, analyze metrics, and display results, caveats, and insights.
5. **Review Results:**
   - Review the results table, caveats, and automated insights.
   - Download the results as CSV if needed.

## Best Practices & Caveats

- **Data Quality:** Ensure accurate, daily data. The only required column is a date column (`Offer Date` or `Date`). `Sessions` is recommended.
- **Significance ≠ Importance:** "Significant? Yes" means the result is unlikely due to random chance under the analysis conditions, but always consider business impact.
- **Multiple Metrics:** Testing many metrics increases the chance of a false positive. Focus on your primary goal metric(s).
- **Assumptions:** Bootstrap is robust to non-normality; t-test assumes daily values are roughly normal. Both require representative daily data for the analyzed period.
- **External Factors:** The tool cannot account for outside events that may have influenced results during the test period.
- **Sequential Tests:** If data is from non-overlapping periods, the tool will warn you. Such results are highly susceptible to time-based confounding factors.
- **Column Flexibility:** If `Sessions` is missing, weighting and some features will be limited, and a warning will be shown.

## Accessibility

- Skip links, ARIA roles/labels, table captions, and keyboard navigation are fully supported.
- All colors and fonts use Monetate's accessible brand palette and typography.

## Limitations

- This tool does not run a true LLM (Large Language Model) in the browser. Automated insights are rule-based and template-driven, not generative AI.
- For advanced statistical consulting or custom metrics, consult a data scientist.

## License

MIT License. For demonstration and internal use.
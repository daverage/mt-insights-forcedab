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

    // Fix: avoid redeclaring csvContent
    const csvContentFinal = csvCaveats.map(e=>e.join(",")).join("\n") + header.concat(dataRows).map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContentFinal], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ab_test_analysis_results.csv';
    link.style.display = 'none'; document.body.appendChild(link); link.click(); document.body.removeChild(link);
}
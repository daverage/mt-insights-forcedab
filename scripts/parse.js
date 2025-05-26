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
function parseMetricValue(val) {
    if (val == null) return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        let v = val.trim();
        if (v.endsWith('%')) return parseFloat(v.replace('%',''))/100;
        if (v.match(/^[£$€]/)) return parseFloat(v.replace(/[^0-9.\-]+/g,''));
        if (v.match(/minutes?/i)) return parseFloat(v.replace(/[^0-9.\-]+/g,''));
    }
    return parseFloat(val) || null;
}
function parseCSVFromFile(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: results => {
                if (results.errors.length) return reject("CSV parse error: " + results.errors[0].message);
                let rawData = results.data;
                let skippedDateRows = 0;

                // Remove summary row from rawData if necessary (existing logic)
                const lastRow = rawData[rawData.length - 1];
                if (lastRow) {
                    // Find a column named 'Offer Date' or 'Date' (case-insensitive)
                    const dateKey = Object.keys(lastRow).find(k => k.trim().toLowerCase() === 'offer date' || k.trim().toLowerCase() === 'date');
                    if (dateKey) {
                        const dateColumnValue = lastRow[dateKey];
                        // If the content of this column in the last row is a string and includes "summary"
                        if (dateColumnValue && typeof dateColumnValue === 'string' && dateColumnValue.trim().toLowerCase().includes('summary')) {
                            rawData.pop(); // Remove this row
                        }
                    }
                }

                // Count rows skipped solely due to date issues
                rawData.forEach(row => {
                    if (getDateFromRow(row) === null) {
                        skippedDateRows++;
                    }
                });

                // Now, filter for dailyData based on valid dates AND other criteria (like sessions)
                const dailyData = rawData.filter(row => {
                    const offerDateVal = getDateFromRow(row);
                    if (offerDateVal === null) return false; // Already counted

                    const sessionsKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'sessions');
                    if (!sessionsKey) return false;
                    const sessionsValStr = row[sessionsKey];
                    if (sessionsValStr === null || String(sessionsValStr).trim() === '') return false;
                    const sessionsValNum = parseFloat(String(sessionsValStr).replace(/[^0-9.-]+/g, ''));
                    return !isNaN(sessionsValNum); // offerDateVal is implicitly valid here
                });

                // Warn if 'Sessions' column is missing
                const hasSessions = results.data.length > 0 && Object.keys(results.data[0] || {}).some(k => k.trim().toLowerCase() === 'sessions');
                if (!hasSessions) {
                    alert(`Warning: No 'Sessions' column found in ${file.name}. Some features and weighting will be unavailable. Results may be less accurate.`);
                }
                resolve({ dailyData, skippedDateRows });
            },
            error: err => reject("CSV parse error: " + err.message)
        });
    });
}

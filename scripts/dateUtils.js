function getDateFromRow(row) {
    // Accept both 'Offer Date' and 'Date' (case-insensitive)
    const dateKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'offer date' || k.trim().toLowerCase() === 'date');
    if (!dateKey) return null;
    const dateStr = row[dateKey];
    if (!dateStr) return null;
    // Try to parse ISO, UK, and US formats
    let parsedDate = null;
    // Try YYYY-MM-DD (ISO)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
        parsedDate = new Date(dateStr.trim() + "T00:00:00Z");
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr.trim())) {
        // Try DD/MM/YYYY or MM/DD/YYYY (ambiguous, default to UK: DD/MM/YYYY)
        const [d1, d2, y] = dateStr.trim().split('/').map(Number);
        // If d1 > 12, it's definitely DD/MM/YYYY
        if (d1 > 12) {
            parsedDate = new Date(Date.UTC(y, d2 - 1, d1));
        } else {
            // If d2 > 12, it's MM/DD/YYYY (US)
            if (d2 > 12) {
                parsedDate = new Date(Date.UTC(y, d1 - 1, d2));
            } else {
                // Ambiguous, default to UK (DD/MM/YYYY)
                parsedDate = new Date(Date.UTC(y, d2 - 1, d1));
            }
        }
    } else if (/^\d{4}\/\d{2}\/\d{2}$/.test(dateStr.trim())) {
        // Try YYYY/MM/DD
        const [y, m, d] = dateStr.trim().split('/').map(Number);
        parsedDate = new Date(Date.UTC(y, m - 1, d));
    } else {
        // Try Date.parse fallback (may be locale-dependent)
        const tryDate = new Date(dateStr.trim());
        if (!isNaN(tryDate.getTime())) parsedDate = tryDate;
    }
    if (!parsedDate || isNaN(parsedDate.getTime())) return null;
    return parsedDate;
}

function formatDate(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return 'N/A';
    return date.toISOString().split('T')[0];
}
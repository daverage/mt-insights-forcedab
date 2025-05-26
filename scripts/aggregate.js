function aggregateSessions(data) {
    if (!data || data.length === 0) return 0;
    return data.reduce((sum, row) => sum + parseValue(getCleanedValue(row, 'Sessions')), 0);
}
/** Day numbers: yyyy-mm-dd dates as whole days since 1970 and back, for counting and stepping days. */
export const DAY_MS = 86400000;
export const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY_MS; };
export const dayStr = n => new Date(n * DAY_MS).toISOString().slice(0, 10);

export const isoOf = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

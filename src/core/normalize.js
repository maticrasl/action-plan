/** Stored data made safe to use: plans from storage, Drive and files checked and repaired. */
// Ids go into the page's HTML unescaped, so only items with a plain id are kept (a shared file could
// hide markup in one); relationships need plain ids at both ends too.
export const safeId = id => typeof id === 'string' && /^[\w-]{1,64}$/.test(id);

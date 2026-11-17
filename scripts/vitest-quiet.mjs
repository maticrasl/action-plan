/** Vitest reporter for the quiet checks: each failure with its message, then one summary line. */
// For one failure in full, run `npx vitest run <file>` (the default reporter).
export default class Quiet {
  onTestRunEnd(modules, unhandled) {
    const fails = [];
    let tests = 0;
    for (const m of modules) {
      for (const e of m.errors()) fails.push(`FAIL ${m.relativeModuleId}: ${e.message}`);
      for (const t of m.children.allTests()) {
        tests++;
        const r = t.result();
        if (r.state !== 'failed') continue;
        const why = r.errors.map(e => [e.message, e.diff].filter(Boolean).join('\n')).join('\n');
        fails.push(`FAIL ${m.relativeModuleId} > ${t.fullName}\n${why}`);
      }
    }
    for (const e of unhandled) fails.push(`ERROR ${e.message}`);
    fails.forEach(f => console.log(f));
    console.log(`unit: ${tests} tests in ${modules.length} files, ${fails.length} failed`);
  }
}

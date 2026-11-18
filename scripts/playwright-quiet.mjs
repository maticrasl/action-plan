/** Playwright reporter for the quiet checks: each failure with its message, then one summary line. */
// For one failure in full, run `npx playwright test <file> --reporter=list`.
export default class Quiet {
  tests = 0;
  fails = [];
  onTestEnd(test, result) {
    if (result.status === 'skipped') return;
    this.tests++;
    if (result.status === test.expectedStatus) return;
    const why = result.errors.map(e => e.message ?? String(e.value)).join('\n');
    this.fails.push(`FAIL ${test.location.file.split(/[\\/]/).pop()} > ${test.title}\n${why}`);
  }
  onError(error) {
    this.fails.push(`ERROR ${error.message ?? error.value}`);
  }
  onEnd() {
    this.fails.forEach(f => console.log(f));
    console.log(`e2e: ${this.tests} tests, ${this.fails.length} failed`);
  }
  printsToStdio() {
    return true;
  }
}

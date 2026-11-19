/** Checks the `layers/order` rule against made-up imports: each case lints one line as if it were in that file. */
// usage: node scripts/lib/eslint-layers.test.mjs
import { ESLint } from 'eslint';

const cases = [
  // [file, import line, expect an error]
  ['src/core/x.ts', "import { esc } from '../ui/dom';", true],
  ['src/ui/x.ts', "import { render } from '../views/index';", true],
  ['src/views/x.ts', "import { clearSpotlight } from '../tutorial/spotlight';", true],
  ['src/views/goals.ts', "import { renderMap } from './map/render';", true],
  ['src/views/filters.ts', "import { renderMap } from './map/render';", true],
  ['src/views/dashboard.ts', "import { render } from './index';", true],
  ['src/main.ts', "import { modules } from './test-modules';", true],
  ['src/boot.ts', "import './test-bridge';", true],
  ['src/views/map/x.ts', "import { MAP } from './layout';", false],
  ['src/views/map/x.ts', "import { searchBox } from '../filters';", false],
  ['src/views/map/x.ts', "import { ui } from '../../store/state';", false],
  ['src/views/events.ts', "import { renderMap } from './map/render';", false],
  ['src/views/index.ts', "import { renderGoals } from './goals';", false],
  ['src/tutorial/x.ts', "import { render } from '../views/index';", false],
  ['src/boot.ts', "import { clearSpotlight } from './tutorial/spotlight';", false],
  ['src/test-bridge.ts', "import { modules } from './test-modules';", false],
  ['src/views/map/zoom.ts', "import { tlDrag } from '../timeline/drag';", false], // allowed in eslint.config.js
];

const eslint = new ESLint();
let failed = 0;
for (const [file, line, bad] of cases) {
  const [result] = await eslint.lintText(`${line}\n`, { filePath: file });
  const hit = result.messages.some(m => m.ruleId === 'layers/order');
  if (hit !== bad) failed++, console.log(`FAIL ${file}: ${line} (expected ${bad ? 'an error' : 'none'})`);
}
console.log(`layers rule: ${cases.length} cases, ${failed} failed`);
process.exitCode = failed ? 1 : 0;

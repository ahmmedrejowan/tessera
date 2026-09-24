/**
 * The end to end tests, in order, against the built app.
 *   npm run build && npm run test:e2e
 * One file can be run on its own:  node test/e2e/run.mjs first-run
 */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const files = readdirSync(here)
  .filter((f) => f.endsWith('.spec.mjs'))
  .filter((f) => !only.length || only.some((o) => f.includes(o)))
  .sort();

let passed = 0;
let failed = 0;
const start = Date.now();
for (const file of files) {
  const { name, run } = await import(join(here, file));
  process.stdout.write(`\n${name}\n`);
  const t = { pass: 0, fail: 0 };
  const ok = (what, condition, detail = '') => {
    if (condition) {
      t.pass += 1;
      console.log(`  ok    ${what}${detail ? `  (${detail})` : ''}`);
    } else {
      t.fail += 1;
      console.log(`  FAIL  ${what}${detail ? `  (${detail})` : ''}`);
    }
  };
  try {
    await run(ok);
  } catch (e) {
    t.fail += 1;
    console.log(`  FAIL  the test itself stopped: ${e instanceof Error ? e.message : String(e)}`);
  }
  passed += t.pass;
  failed += t.fail;
}
const seconds = Math.round((Date.now() - start) / 1000);
console.log(`\n${passed} passed, ${failed} failed, in ${seconds}s`);
process.exit(failed ? 1 : 0);

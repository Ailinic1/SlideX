// A test runner in forty lines, so the tests need nothing installed.
import assert from 'assert';

const tests = [];
export const test = (name, fn) => tests.push({ name, fn });
export { assert };

export async function run(title) {
  let failed = 0;
  console.log('\n' + title);
  for (const t of tests) {
    try {
      await t.fn();
      console.log('  ok    ' + t.name);
    } catch (e) {
      failed++;
      console.log('  FAIL  ' + t.name + '\n        ' + String(e && e.stack || e).split('\n').slice(0, 4).join('\n        '));
    }
  }
  console.log('\n' + (tests.length - failed) + ' of ' + tests.length + ' passed');
  tests.length = 0;
  if (failed) process.exitCode = 1;
}

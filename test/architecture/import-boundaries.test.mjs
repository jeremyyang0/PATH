import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

test('architecture import boundaries stay intact', () => {
  const script = path.join(process.cwd(), 'scripts/architecture/check-import-boundaries.mjs');
  const output = execFileSync(process.execPath, [script], { encoding: 'utf8' });
  assert.match(output, /passed/i);
});

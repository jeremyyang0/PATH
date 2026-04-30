import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
      continue;
    }
    files.push(full);
  }
  return files;
}

test('PATH Sniff no longer references Python sidecar artifacts', () => {
  const checkedFiles = [
    ...walk(path.join(process.cwd(), 'src/modules/sniff')),
    path.join(process.cwd(), 'package.json'),
  ];
  const forbidden = /SniffSidecarService|SCOUT_ROOT|path-sniff-cli|build:sniff-sidecar|sidecar\.logLevel/;
  const offenders = checkedFiles
    .filter((file) => /\.(ts|json)$/.test(file))
    .filter((file) => forbidden.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(process.cwd(), file));

  assert.deepEqual(offenders, []);
});

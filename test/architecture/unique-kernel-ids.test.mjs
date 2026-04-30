import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function extractIds(relativeFile) {
  const source = readFileSync(path.join(process.cwd(), relativeFile), 'utf8');
  return [...source.matchAll(/:\s*'([^']+)'/g)].map((match) => match[1]);
}

function readPackageJson() {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
}

test('command ids remain unique', () => {
  const ids = extractIds('src/kernel/ids/commands.ts');
  assert.equal(new Set(ids).size, ids.length);
});

test('view ids remain unique', () => {
  const ids = extractIds('src/kernel/ids/views.ts');
  assert.equal(new Set(ids).size, ids.length);
});

test('kernel command ids stay aligned with package contributions', () => {
  const ids = extractIds('src/kernel/ids/commands.ts').sort();
  const pkg = readPackageJson();
  const contributed = pkg.contributes.commands.map((item) => item.command).sort();
  assert.deepEqual(ids, contributed);
});

test('kernel view ids stay aligned with package contributions', () => {
  const ids = extractIds('src/kernel/ids/views.ts').sort();
  const pkg = readPackageJson();
  const contributed = Object.values(pkg.contributes.views)
    .flat()
    .map((item) => item.id)
    .sort();
  assert.deepEqual(ids, contributed);
});

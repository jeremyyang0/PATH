import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      workspace: {
        getConfiguration: () => ({
          get: (_name, fallback) => fallback,
        }),
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { needleRuntimeServiceTestOnly } = require(
  path.join(process.cwd(), 'out/modules/sniff/services/needleRuntimeService.js'),
);

Module._load = originalLoad;

test('Needle runtime parses successful controller JSON output', () => {
  const result = needleRuntimeServiceTestOnly.parseControllerStdout(
    JSON.stringify({ ok: true, result: { host: '127.0.0.1', port: 59738, pid: 7 } }),
    '',
    0,
  );
  assert.deepEqual(result, { host: '127.0.0.1', port: 59738, pid: 7 });
});

test('Needle runtime rejects failed controller JSON output', () => {
  assert.throws(
    () => needleRuntimeServiceTestOnly.parseControllerStdout(
      JSON.stringify({ ok: false, error: 'boom' }),
      '',
      1,
    ),
    /boom/,
  );
});

test('Needle runtime keeps quoted target args together', () => {
  assert.deepEqual(
    needleRuntimeServiceTestOnly.splitCommandLineArgs('--name "hello world" --flag'),
    ['--name', 'hello world', '--flag'],
  );
});

test('Needle runtime normalizes enum fallbacks', () => {
  assert.equal(needleRuntimeServiceTestOnly.normalizeRuntimePolicy('prefer-target'), 'prefer-target');
  assert.equal(needleRuntimeServiceTestOnly.normalizeRuntimePolicy('bad'), 'auto');
  assert.equal(needleRuntimeServiceTestOnly.normalizeTargetProfile('sailwind'), 'sailwind');
  assert.equal(needleRuntimeServiceTestOnly.normalizeTargetProfile('bad'), 'auto');
});

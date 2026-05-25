import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

test('workspace code index service builds package, element and method indexes', async () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'path-code-index-'));
  const methodDir = path.join(tempRoot, 'method', 'login_app');
  mkdirSync(methodDir, { recursive: true });

  writeFileSync(path.join(methodDir, '__init__.py'), [
    'class LoginApp:',
    '    """登录应用"""',
    '    pass',
    ''
  ].join('\n'), 'utf8');
  writeFileSync(path.join(methodDir, 'login_ele.py'), [
    'class LoginEle:',
    '    @ele',
    '    def submit_btn(self):',
    '        return Ele(desc="登录按钮")',
    ''
  ].join('\n'), 'utf8');
  writeFileSync(path.join(methodDir, 'login.py'), [
    'class LoginPage:',
    '    def submit(self):',
    '        """点击登录"""',
    '        return True',
    ''
  ].join('\n'), 'utf8');

  const { workspaceCodeIndexService } = await import(
    pathToFileURL(path.join(process.cwd(), 'out/modules/code-index/index.js')).href
  );
  const index = await workspaceCodeIndexService.build(tempRoot);

  assert.equal(index.packageNames['method.login_app'], '登录应用');
  assert.equal(index.elementFiles.length, 1);
  assert.equal(index.elementFiles[0].elements[0].desc, '登录按钮');
  assert.equal(index.methodFiles.length, 1);
  assert.equal(index.methodFiles[0].methods[0].doc, '点击登录');

  rmSync(tempRoot, { recursive: true, force: true });
});

import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

test('sync case steps use case only updates when remote steps differ', async () => {
  const { SyncCaseStepsFromDocument } = await import(
    pathToFileURL(
      path.join(process.cwd(), 'out/modules/zentao/application/use-cases/sync-case-steps-from-document.js')
    ).href
  );

  const updateCalls = [];
  const useCase = new SyncCaseStepsFromDocument(
    {
      async execute() {
        return {
          id: '123',
          title: '登录用例',
          precondition: '',
          steps: [
            { desc: '1: 输入账号', expect: '1: 显示账号' }
          ]
        };
      }
    },
    {
      async execute(caseId, steps) {
        updateCalls.push({ caseId, steps });
      }
    }
  );

  const unchanged = await useCase.execute('123', [
    { desc: '输入账号', expect: '显示账号' }
  ], {
    async approve() {
      return true;
    },
    async notifySynced() {}
  });
  assert.equal(unchanged.status, 'no-changes');

  let notified = 0;
  const changed = await useCase.execute('123', [
    { desc: '输入账号', expect: '显示账号' },
    { desc: '点击登录', expect: '进入首页' }
  ], {
    async approve() {
      return true;
    },
    async notifySynced() {
      notified += 1;
    }
  });

  assert.equal(changed.status, 'synced');
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].caseId, '123');
  assert.equal(updateCalls[0].steps.length, 2);
  assert.equal(notified, 1);
});

test('zentao session resolver logs in for every operation with current config', async () => {
  const { ZentaoSessionResolver } = await import(
    pathToFileURL(
      path.join(process.cwd(), 'out/modules/zentao/application/use-cases/zentao-session-resolver.js')
    ).href
  );

  let account = 'automation';
  let loginCalls = 0;
  const resolver = new ZentaoSessionResolver(
    {
      async read() {
        return {
          baseUrl: 'http://zentao.local',
          account,
          password: 'secret'
        };
      }
    },
    {
      async login(baseUrl, account) {
        loginCalls += 1;
        return {
          baseUrl,
          account,
          token: `${account}-token-${loginCalls}`
        };
      }
    }
  );

  const firstToken = await resolver.executeWithSession(async session => session.token);
  account = 'tester';
  const secondToken = await resolver.executeWithSession(async session => session.token);

  assert.equal(firstToken, 'automation-token-1');
  assert.equal(secondToken, 'tester-token-2');
  assert.equal(loginCalls, 2);
});

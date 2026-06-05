import assert from 'node:assert/strict';
import http from 'node:http';
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
          precondition: '条件: A >< B',
          steps: [
            { desc: '1: 输入账号', expect: '1: 显示账号' }
          ]
        };
      }
    },
    {
      async execute(caseId, update) {
        updateCalls.push({ caseId, update });
      }
    }
  );

  const unchanged = await useCase.execute('123', {
    precondition: '条件: A >< B',
    steps: [
      { desc: '输入账号', expect: '显示账号' }
    ]
  }, {
    async approve() {
      return true;
    },
    async notifySynced() {}
  });
  assert.equal(unchanged.status, 'no-changes');

  let notified = 0;
  const changed = await useCase.execute('123', {
    precondition: '条件: A >< C',
    steps: [
      { desc: '输入账号', expect: '显示账号' },
      { desc: '点击登录', expect: '进入首页' }
    ]
  }, {
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
  assert.equal(updateCalls[0].update.precondition, '条件: A >< C');
  assert.equal(updateCalls[0].update.steps.length, 2);
  assert.equal(notified, 1);
});

test('zentao gateway sends raw precondition text without html escaping', async () => {
  const { ZentaoRestGateway } = await import(
    pathToFileURL(
      path.join(process.cwd(), 'out/modules/zentao/infrastructure/http/zentao-rest-gateway.js')
    ).href
  );

  let receivedBody = '';
  const server = http.createServer((request, response) => {
    request.setEncoding('utf8');
    request.on('data', chunk => {
      receivedBody += chunk;
    });
    request.on('end', () => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ id: '123' }));
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.equal(typeof address, 'object');

  try {
    const gateway = new ZentaoRestGateway();
    await gateway.updateCaseSteps(
      {
        baseUrl: `http://127.0.0.1:${address.port}`,
        account: 'automation',
        token: 'token'
      },
      '123',
      {
        precondition: '窗口A >< 窗口B',
        steps: []
      }
    );

    const payload = JSON.parse(receivedBody);
    assert.equal(payload.precondition, '窗口A >< 窗口B');
    assert.equal(receivedBody.includes('&gt;'), false);
    assert.equal(receivedBody.includes('&lt;'), false);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
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

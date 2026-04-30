import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { NeedleTcpTransport, needleTcpTransportTestOnly } = require(
  path.join(process.cwd(), 'out/modules/sniff/services/needleTcpTransport.js'),
);

function startOneShotServer(handler) {
  const server = net.createServer((socket) => {
    let request = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      request += chunk;
      if (!request.includes('\n')) return;
      handler(request, socket);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

test('Needle TCP transport sends UTF-8 POST route and JSON body', async () => {
  let captured = '';
  const server = await startOneShotServer((request, socket) => {
    captured = request;
    socket.end(JSON.stringify({ ok: true, text: '中文' }));
  });
  try {
    const transport = new NeedleTcpTransport();
    const response = await transport.post(
      { host: '127.0.0.1', port: server.port },
      'search_widgets',
      { widget_def: { text: '中文' } },
      { timeoutMs: 1000 },
    );

    assert.deepEqual(response, { ok: true, text: '中文' });
    assert.equal(captured, 'POST /search_widgets\n{"widget_def":{"text":"中文"}}');
  } finally {
    await server.close();
  }
});

test('Needle TCP transport reports invalid JSON responses', async () => {
  const server = await startOneShotServer((_request, socket) => {
    socket.end('not-json');
  });
  try {
    const transport = new NeedleTcpTransport();
    await assert.rejects(
      () => transport.post({ host: '127.0.0.1', port: server.port }, 'hello', {}, { timeoutMs: 1000 }),
      /Invalid JSON from Needle server/,
    );
  } finally {
    await server.close();
  }
});

test('Needle TCP transport supports long pick timeouts', async () => {
  const server = await startOneShotServer((_request, socket) => {
    setTimeout(() => {
      socket.end(JSON.stringify({ accepted: false, widget_ids: [], widgets: [] }));
    }, 80);
  });
  try {
    const transport = new NeedleTcpTransport();
    const response = await transport.post(
      { host: '127.0.0.1', port: server.port },
      'pick_widgets',
      { timeout_ms: 0 },
      { timeoutMs: 1000 },
    );
    assert.deepEqual(response, { accepted: false, widget_ids: [], widgets: [] });
  } finally {
    await server.close();
  }
});

test('Needle TCP request formatter keeps route semantics stable', () => {
  assert.equal(needleTcpTransportTestOnly.normalizeRoute('///hello'), '/hello');
  assert.equal(needleTcpTransportTestOnly.encodeRequest('hello', { pid: 7 }), 'POST /hello\n{"pid":7}');
});

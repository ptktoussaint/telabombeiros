'use strict';

const test = require('node:test');
const assert = require('node:assert');
const session = require('express-session');

const { createApp } = require('../server');
const config = require('../lib/config');

// Sobe o Express de verdade com store de sessao em memoria: cobre roteamento,
// arquivos estaticos e as regras de acesso sem precisar de banco.
async function withServer(fn) {
  const { app } = await createApp({ sessionStore: new session.MemoryStore() });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

function get(base, path, cookie) {
  return fetch(base + path, { headers: cookie ? { cookie } : undefined });
}

function postJson(base, path, body, cookie) {
  return fetch(base + path, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { cookie } : {}),
    body: JSON.stringify(body),
  });
}

test('paginas publicas e arquivos estaticos respondem', async () => {
  await withServer(async (base) => {
    for (const path of ['/', '/admin', '/admin/login', '/shared/base.css', '/js/rtc.js']) {
      const res = await get(base, path);
      assert.strictEqual(res.status, 200, path);
    }
  });
});

test('sala exige identificacao: sem token e sem sessao da 403', async () => {
  await withServer(async (base) => {
    const id = '507f1f77bcf86cd799439011';
    assert.strictEqual((await get(base, `/t/${id}`)).status, 403);
    assert.strictEqual((await get(base, `/v/${id}`)).status, 403);
  });
});

test('credenciais TURN nao saem para quem nao tem sessao identificada', async () => {
  await withServer(async (base) => {
    assert.strictEqual((await get(base, '/api/ice-servers')).status, 401);
    assert.strictEqual((await get(base, '/api/admin/rooms')).status, 401);
    assert.strictEqual((await get(base, '/api/admin/live')).status, 401);
  });
});

test('login do admin recusa senha errada e aceita a correta', async () => {
  await withServer(async (base) => {
    const errada = await postJson(base, '/api/admin/login', {
      username: config.admin.username,
      password: 'senha-errada-de-proposito',
    });
    assert.strictEqual(errada.status, 401);

    const certa = await postJson(base, '/api/admin/login', {
      username: config.admin.username,
      password: config.admin.password,
    });
    assert.strictEqual(certa.status, 200);

    const cookie = certa.headers.get('set-cookie').split(';')[0];
    const sessao = await (await get(base, '/api/session', cookie)).json();
    assert.strictEqual(sessao.role, 'admin');

    const ice = await (await get(base, '/api/ice-servers', cookie)).json();
    assert.ok(Array.isArray(ice.iceServers));
  });
});

test('logout do admin apaga o papel da sessao', async () => {
  await withServer(async (base) => {
    const login = await postJson(base, '/api/admin/login', {
      username: config.admin.username,
      password: config.admin.password,
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    await postJson(base, '/api/admin/logout', {}, cookie);

    const sessao = await (await get(base, '/api/session', cookie)).json();
    assert.strictEqual(sessao.role, null);
    assert.strictEqual((await get(base, '/api/ice-servers', cookie)).status, 401);
  });
});

test('rota de API inexistente devolve JSON 404', async () => {
  await withServer(async (base) => {
    const res = await get(base, '/api/nao-existe');
    assert.strictEqual(res.status, 404);
    assert.strictEqual((await res.json()).error, 'Rota nao encontrada.');
  });
});

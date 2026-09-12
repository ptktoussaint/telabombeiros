'use strict';

const http = require('http');
const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { Server } = require('socket.io');

const config = require('./lib/config');
const db = require('./lib/db');
const { warnIfNoTurn } = require('./lib/turn');
const { attachSignaling } = require('./lib/signaling');
const { startSweeper } = require('./lib/roomLifecycle');
const pagesRouter = require('./routes/pages');
const { router: roomsRouter } = require('./routes/rooms');
const { router: adminRouter } = require('./routes/admin');

async function createApp(options = {}) {
  const app = express();
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));

  const sessionMiddleware = session({
    name: 'tb.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: true,
    // O store e injetavel para permitir teste de fumaca sem banco.
    store: options.sessionStore || MongoStore.create({ mongoUrl: config.mongoUri, ttl: 60 * 60 * 12 }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: 12 * 60 * 60 * 1000,
    },
  });
  app.use(sessionMiddleware);

  app.use(express.static(path.join(__dirname, 'public'), { index: false }));

  app.use(roomsRouter);
  app.use(adminRouter);
  app.use(pagesRouter);

  app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Rota nao encontrada.' });
    return res.status(404).sendFile(path.join(__dirname, 'public', 'sem-acesso.html'));
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[erro]', err.message);
    if (res.headersSent) return;
    res.status(500).json({ error: err.message || 'Erro interno.' });
  });

  return { app, sessionMiddleware };
}

async function start() {
  await db.connect(config.mongoUri);
  console.log('[db] conectado ao MongoDB');

  const { app, sessionMiddleware } = await createApp();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: false } });
  app.set('io', io);

  attachSignaling(io, sessionMiddleware);
  startSweeper(io);
  warnIfNoTurn(process.env);

  if (config.admin.password === 'admin123' && !config.admin.passwordHash) {
    console.warn('[admin] Usando a senha padrao. Defina ADMIN_PASSWORD nas variaveis de ambiente.');
  }

  server.listen(config.port, () => {
    console.log(`[http] Tela Bombeiros ouvindo na porta ${config.port}`);
  });

  return server;
}

if (require.main === module) {
  start().catch((err) => {
    console.error('[fatal]', err.message);
    process.exit(1);
  });
}

module.exports = { createApp, start };

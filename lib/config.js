'use strict';

require('dotenv').config();

const config = {
  port: Number(process.env.PORT || 3000),
  mongoUri: process.env.MONGODB_URI || '',
  sessionSecret: process.env.SESSION_SECRET || 'tela-bombeiros-dev-secret',
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
    passwordHash: process.env.ADMIN_PASSWORD_HASH || '',
  },
  isProduction: process.env.NODE_ENV === 'production',
};

module.exports = config;

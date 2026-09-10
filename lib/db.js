'use strict';

const mongoose = require('mongoose');

async function connect(uri) {
  if (!uri) {
    throw new Error(
      'MONGODB_URI nao configurada. Defina a string de conexao do MongoDB Atlas nas variaveis de ambiente.'
    );
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  return mongoose.connection;
}

module.exports = { connect, mongoose };

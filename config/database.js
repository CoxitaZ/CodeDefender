const mongoose = require('mongoose');

function getMongoUri() {
  return process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
}

module.exports = async function connectDatabase() {
  const uri = getMongoUri();
  if (!uri) {
    throw new Error(
      'MongoDB URI nao definida. Configure MONGO_URI no Render com a connection string do MongoDB Atlas.'
    );
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('MongoDB conectado');
};

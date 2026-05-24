const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI is not set');
    const connection = await mongoose.connect(uri);
    console.log(` MongoDB connected: ${connection.connection.host}`);
  } catch (err) {
    console.error(` MongoDB connection error: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;

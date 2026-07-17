const app = require('../app');
const connectDB = require('../src/config/db');

let databaseConnected = false;

const connect = async () => {
  if (!databaseConnected) {
    await connectDB();
    databaseConnected = true;
  }
};

module.exports = async (req, res) => {
  try {
    await connect();
    return app(req, res);
  } catch (error) {
    console.error('Vercel API connection error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

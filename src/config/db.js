const mongoose = require('mongoose');

const cached = global.mongoose || { conn: null, promise: null };
if (!global.mongoose) {
  global.mongoose = cached;
}

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    // Simply remove the legacy options object here
    cached.promise = mongoose.connect(process.env.MONGODB_URI)
      .then((mongooseInstance) => {
        cached.conn = mongooseInstance;
        console.log(`✅ MongoDB Connected: ${mongooseInstance.connection.host}`);
        return mongooseInstance;
      });
  }

  return cached.promise;
};

module.exports = connectDB;
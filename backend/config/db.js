const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const options = {
      serverSelectionTimeoutMS: 5000, // Reduced to 5 seconds
      socketTimeoutMS: 30000,
      connectTimeoutMS: 5000         // Reduced to 5 seconds
    };

    console.log('Attempting to connect to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGO_URI, options);
    console.log('MongoDB Connected Successfully to Atlas...');
    return true;
  } catch (err) {
    console.error('MongoDB Connection Error:', err.message);
    console.log('Switching to Emergency Mode (DB Offline)...');
    return false;
  }
};

module.exports = connectDB;

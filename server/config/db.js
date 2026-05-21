import mongoose from "mongoose";

const connectDB = async () => {
  const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || "mongodb://127.0.0.1:27017/support-hub";

  if (!process.env.MONGODB_URI && !process.env.MONGO_URL) {
    console.warn("!!! Warning: no MongoDB connection string found in environment variables. Falling back to localhost.");
  }

  try {
    mongoose.set('bufferCommands', false);
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(">>> Connected to MongoDB Successfully");
  } catch (err) {
    console.error("!!! MongoDB Connection Error:", err.message);
    process.exit(1);
  }
};

export default connectDB;

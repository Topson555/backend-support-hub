import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'agent', 'admin'], default: 'user', index: true },
  avatar: { type: String, default: "" },
  phoneNumber: { type: String, default: "" },
  jobTitle: { type: String, default: "" },
  department: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);
export default User;

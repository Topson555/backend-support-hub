import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const signup = async (req, res) => {
  console.log(`>>> Signup Request: ${req.body.email}`);
  try {
    const { name, email, password, staffCode } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email }).lean();
    if (existingUser) return res.status(400).json({ error: "User already exists" });

    // Role Logic
    let role = 'user';
    
    // Optimization: Check for staff code first
    if (staffCode && staffCode === process.env.STAFF_SIGNUP_CODE) {
      role = 'agent';
    } else {
      // If no staff code, check if it's the very first user (Admin)
      const userCount = await User.countDocuments();
      if (userCount === 0) {
        role = 'admin';
      }
    }

    // Faster hashing (8 rounds is sufficient for JS implementations in these environments)
    const hashedPassword = await bcrypt.hash(password, 8);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role
    });

    await newUser.save();

    const token = jwt.sign(
      { id: newUser._id, role: newUser.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1d' }
    );

    res.status(201).json({
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Failed to create account. Service might be busy." });
  }
};

export const login = async (req, res) => {
  console.log(`>>> Login Request: ${req.body.email}`);
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email }).lean();
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Authentication failed. Service might be busy." });
  }
};

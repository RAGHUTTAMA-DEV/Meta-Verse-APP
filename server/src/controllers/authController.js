const jwt = require('jsonwebtoken');
const User=require('../models/UserModel');
// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// Register new user
const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (existingUser) {
      return res.status(400).json({ 
        error: 'User with this email or username already exists' 
      });
    }

    // Create new user
    const user = new User({
      username,
      email,
      password
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Send response without password
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      user: userResponse,
      token
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt:', { email, hasPassword: !!password });

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select('+password');
    console.log('User lookup result:', { 
      found: !!user, 
      userId: user?._id,
      username: user?.username,
      hasPassword: !!user?.password 
    });

    if (!user) {
      console.log('Login failed: User not found');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    console.log('Password comparison result:', { isMatch });

    if (!isMatch) {
      console.log('Login failed: Invalid password');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(user._id);
    console.log('Token generated for user:', { userId: user._id, username: user.username });

    // Update user status
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();
    console.log('User status updated:', { 
      userId: user._id, 
      username: user.username,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen 
    });

    // Send response without password
    const userResponse = user.toObject();
    delete userResponse.password;

    console.log('Login successful:', { 
      userId: user._id, 
      username: user.username 
    });

    res.json({
      user: userResponse,
      token
    });
  } catch (error) {
    console.error('Login error:', {
      message: error.message,
      stack: error.stack,
      email: req.body.email
    });
    res.status(500).json({ error: error.message });
  }
};

// Logout user
const logout = async (req, res) => {
  try {
    // Update user status
    req.user.isOnline = false;
    req.user.lastSeen = new Date();
    await req.user.save();

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get current user
const getCurrentUser = async (req, res) => {
  try {
    const user = req.user.toObject();
    delete user.password;
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  register,
  login,
  logout,
  getCurrentUser
}; 
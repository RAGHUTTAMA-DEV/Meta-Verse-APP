const User = require('../models/UserModel');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Helper function for consistent API responses
const apiResponse = (res, status, data = null, error = null) => {
  const response = { status: status < 400 ? 'success' : 'error' };
  if (data) response.data = data;
  if (error) response.error = error;
  return res.status(status).json(response);
};

// Register a new user
const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return apiResponse(res, 400, null, 'User already exists');
    }

    // Create new user
    const user = new User({
      username,
      email,
      password,
      currentRoom: 'lobby'
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return apiResponse(res, 201, {
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        isOnline: user.isOnline,
        currentRoom: user.currentRoom
      },
      token
    });
  } catch (error) {
    return apiResponse(res, 400, null, error.message);
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return apiResponse(res, 400, null, 'Email and password are required');
    }

    // Find user by email and explicitly select password
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return apiResponse(res, 401, null, 'Invalid credentials');
    }

    // Use the model's comparePassword method
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return apiResponse(res, 401, null, 'Invalid credentials');
    }

    // Update user status
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'your-secret-key', // Fallback for development
      { expiresIn: '7d' }
    );

    // Remove password from response
    const userResponse = {
      _id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      isOnline: user.isOnline,
      currentRoom: user.currentRoom
    };

    return apiResponse(res, 200, {
      user: userResponse,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
};

// Logout user
const logout = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return apiResponse(res, 404, null, 'User not found');
    }

    user.isOnline = false;
    user.currentRoom = 'lobby';
    await user.save();

    return apiResponse(res, 200, { message: 'Logged out successfully' });
  } catch (error) {
    return apiResponse(res, 500, null, error.message);
  }
};

// Get current user
const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('currentRoom', 'name');

    if (!user) {
      return apiResponse(res, 404, null, 'User not found');
    }

    return apiResponse(res, 200, { user });
  } catch (error) {
    return apiResponse(res, 500, null, error.message);
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const { username, email, avatar } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return apiResponse(res, 404, null, 'User not found');
    }

    // Check if username or email is already taken
    if (username && username !== user.username) {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return apiResponse(res, 400, null, 'Username already taken');
      }
      user.username = username;
    }

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return apiResponse(res, 400, null, 'Email already taken');
      }
      user.email = email;
    }

    if (avatar) {
      user.avatar = avatar;
    }

    await user.save();

    return apiResponse(res, 200, {
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        isOnline: user.isOnline,
        currentRoom: user.currentRoom
      }
    });
  } catch (error) {
    return apiResponse(res, 400, null, error.message);
  }
};

module.exports = {
  register,
  login,
  logout,
  getCurrentUser,
  updateProfile
}; 
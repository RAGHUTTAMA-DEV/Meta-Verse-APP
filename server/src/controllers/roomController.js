const Room = require('../models/Room');
const User = require('../models/UserModel');

// Create a new room
const createRoom = async (req, res) => {
  try {
    const { name, description, isPrivate, password, maxParticipants } = req.body;

    // Check if room name already exists
    const existingRoom = await Room.findOne({ name });
    if (existingRoom) {
      return res.status(400).json({ error: 'Room name already exists' });
    }

    const room = new Room({
      name,
      description,
      isPrivate,
      password: isPrivate ? password : undefined,
      maxParticipants: maxParticipants || 50,
      createdBy: req.user._id
    });

    // Add creator as first participant
    await room.addParticipant(req.user._id, { x: 0, y: 0 });
    await room.save();

    res.status(201).json({ room });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get all public rooms
const getRooms = async (req, res) => {
  try {
    const rooms = await Room.find({ isPrivate: false })
      .populate('createdBy', 'username avatar')
      .populate('participants.user', 'username avatar isOnline')
      .select('-password');

    res.json({ rooms });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get room by ID
const getRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId)
      .populate('createdBy', 'username avatar')
      .populate('participants.user', 'username avatar isOnline')
      .select('-password');

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({ room });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Join a room
const joinRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { password } = req.body;

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if room is private and password is correct
    if (room.isPrivate) {
      if (!password) {
        return res.status(401).json({ error: 'Password required for private room' });
      }
      const isMatch = await room.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid password' });
      }
    }

    // Check if user is already in the room
    const isParticipant = room.participants.some(
      p => p.user.toString() === req.user._id.toString()
    );

    if (isParticipant) {
      return res.status(400).json({ error: 'Already in room' });
    }

    // Add user to room
    await room.addParticipant(req.user._id, { x: 0, y: 0 });

    // Update user's current room
    req.user.currentRoom = roomId;
    await req.user.save();

    res.json({ room });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Leave a room
const leaveRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findById(roomId);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Remove user from room
    await room.removeParticipant(req.user._id);

    // Update user's current room
    req.user.currentRoom = 'lobby';
    await req.user.save();

    res.json({ message: 'Left room successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Update room settings (room creator only)
const updateRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const updates = req.body;
    const room = await Room.findById(roomId);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if user is room creator
    if (room.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only room creator can update settings' });
    }

    // Update allowed fields
    const allowedUpdates = ['description', 'maxParticipants', 'isPrivate', 'password'];
    Object.keys(updates).forEach(update => {
      if (allowedUpdates.includes(update)) {
        room[update] = updates[update];
      }
    });

    await room.save();
    res.json({ room });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Delete room (room creator only)
const deleteRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findById(roomId);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if user is room creator
    if (room.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only room creator can delete room' });
    }

    // Update all users in the room to return to lobby
    await User.updateMany(
      { currentRoom: roomId },
      { currentRoom: 'lobby' }
    );

    await room.deleteOne();
    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createRoom,
  getRooms,
  getRoom,
  joinRoom,
  leaveRoom,
  updateRoom,
  deleteRoom
}; 
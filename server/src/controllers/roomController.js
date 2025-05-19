const Room = require('../models/Room');
const User = require('../models/UserModel');

// Helper function for consistent API responses
const apiResponse = (res, status, data = null, error = null) => {
  const response = { status: status < 400 ? 'success' : 'error' };
  if (data) response.data = data;
  if (error) response.error = error;
  return res.status(status).json(response);
};

// Create a new room
const createRoom = async (req, res) => {
  try {
    const { name, description, isPrivate, password, maxParticipants } = req.body;

    // Check if room name already exists
    const existingRoom = await Room.findOne({ name });
    if (existingRoom) {
      return apiResponse(res, 400, null, 'Room name already exists');
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

    return apiResponse(res, 201, { room });
  } catch (error) {
    return apiResponse(res, 400, null, error.message);
  }
};

// Get all public rooms and system rooms
const getRooms = async (req, res) => {
  try {
    const { name } = req.query;
    const query = {
      $or: [
        { isPrivate: false },
        { isSystemRoom: true }
      ]
    };

    // If name is provided, add it to the query
    if (name) {
      query.name = { $regex: new RegExp(`^${name}$`, 'i') }; // Case-insensitive exact match
    }

    console.log('Fetching rooms with query:', {
      query,
      timestamp: new Date().toISOString()
    });

    const rooms = await Room.find(query)
      .populate('createdBy', 'username avatar')
      .populate('participants.user', 'username avatar isOnline')
      .select('-password')
      .sort({ isSystemRoom: -1, createdAt: 1 }); // System rooms first, then by creation date

    console.log('Found rooms:', {
      count: rooms.length,
      rooms: rooms.map(r => ({ 
        id: r._id,
        name: r.name, 
        isSystemRoom: r.isSystemRoom,
        participantCount: r.participants?.length || 0
      })),
      timestamp: new Date().toISOString()
    });

    // If specifically looking for lobby and not found, ensure it exists
    if (name === 'Lobby' && rooms.length === 0) {
      console.log('Lobby room not found, creating it...');
      const lobbyRoom = await Room.findOneAndUpdate(
        { name: 'Lobby', isSystemRoom: true },
        {
          name: 'Lobby',
          description: 'Main lobby room for all users',
          isSystemRoom: true,
          isPrivate: false,
          settings: {
            maxParticipants: 100,
            allowChat: true,
            allowVoice: true
          }
        },
        { 
          upsert: true, 
          new: true,
          setDefaultsOnInsert: true 
        }
      )
      .populate('createdBy', 'username avatar')
      .populate('participants.user', 'username avatar isOnline')
      .select('-password');

      // Add initial game objects if needed
      if (!lobbyRoom.objects || lobbyRoom.objects.length === 0) {
        await createInitialGameObjects(lobbyRoom);
        await lobbyRoom.save();
      }

      return apiResponse(res, 200, { rooms: [lobbyRoom] });
    }

    return apiResponse(res, 200, { rooms });
  } catch (error) {
    console.error('Error fetching rooms:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    return apiResponse(res, 500, null, 'Failed to fetch rooms: ' + error.message);
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
      return apiResponse(res, 404, null, 'Room not found');
    }

    return apiResponse(res, 200, { room });
  } catch (error) {
    return apiResponse(res, 500, null, error.message);
  }
};

// Join a room
const joinRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { password } = req.body;

    const room = await Room.findById(roomId);
    if (!room) {
      return apiResponse(res, 404, null, 'Room not found');
    }

    // Check if room is private and password is correct
    if (room.isPrivate) {
      if (!password) {
        return apiResponse(res, 401, null, 'Password required for private room');
      }
      const isMatch = await room.comparePassword(password);
      if (!isMatch) {
        return apiResponse(res, 401, null, 'Invalid password');
      }
    }

    // Check if user is already in the room
    const isParticipant = room.participants.some(
      p => p.user.toString() === req.user._id.toString()
    );

    if (isParticipant) {
      return apiResponse(res, 400, null, 'Already in room');
    }

    // Add user to room
    await room.addParticipant(req.user._id, { x: 0, y: 0 });

    // Update user's current room
    req.user.currentRoom = roomId;
    await req.user.save();

    return apiResponse(res, 200, { room });
  } catch (error) {
    return apiResponse(res, 400, null, error.message);
  }
};

// Leave a room
const leaveRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findById(roomId);

    if (!room) {
      return apiResponse(res, 404, null, 'Room not found');
    }

    // Remove user from room
    await room.removeParticipant(req.user._id);

    // Update user's current room
    req.user.currentRoom = 'lobby';
    await req.user.save();

    return apiResponse(res, 200, { message: 'Left room successfully' });
  } catch (error) {
    return apiResponse(res, 400, null, error.message);
  }
};

// Update room settings (room creator only)
const updateRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const updates = req.body;
    const room = await Room.findById(roomId);

    if (!room) {
      return apiResponse(res, 404, null, 'Room not found');
    }

    // Check if user is room creator
    if (room.createdBy.toString() !== req.user._id.toString()) {
      return apiResponse(res, 403, null, 'Only room creator can update settings');
    }

    // Update allowed fields
    const allowedUpdates = ['description', 'maxParticipants', 'isPrivate', 'password'];
    Object.keys(updates).forEach(update => {
      if (allowedUpdates.includes(update)) {
        room[update] = updates[update];
      }
    });

    await room.save();
    return apiResponse(res, 200, { room });
  } catch (error) {
    return apiResponse(res, 400, null, error.message);
  }
};

// Delete room (room creator only)
const deleteRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findById(roomId);

    if (!room) {
      return apiResponse(res, 404, null, 'Room not found');
    }

    // Check if user is room creator
    if (room.createdBy.toString() !== req.user._id.toString()) {
      return apiResponse(res, 403, null, 'Only room creator can delete room');
    }

    // Update all users in the room to return to lobby
    await User.updateMany(
      { currentRoom: roomId },
      { currentRoom: 'lobby' }
    );

    await room.deleteOne();
    return apiResponse(res, 200, { message: 'Room deleted successfully' });
  } catch (error) {
    return apiResponse(res, 500, null, error.message);
  }
};

// Helper function to create initial game objects
const createInitialGameObjects = async (room) => {
  try {
    // Create some walls
    const walls = [
      // Outer walls
      { type: 'wall', position: { x: 0, y: 0 }, properties: { color: '#4a5568', width: 800, height: 20 } },
      { type: 'wall', position: { x: 0, y: 580 }, properties: { color: '#4a5568', width: 800, height: 20 } },
      { type: 'wall', position: { x: 0, y: 0 }, properties: { color: '#4a5568', width: 20, height: 600 } },
      { type: 'wall', position: { x: 780, y: 0 }, properties: { color: '#4a5568', width: 20, height: 600 } },
      
      // Inner walls and objects
      { type: 'wall', position: { x: 200, y: 200 }, properties: { color: '#718096', width: 400, height: 20 } },
      { type: 'wall', position: { x: 200, y: 400 }, properties: { color: '#718096', width: 400, height: 20 } },
      { type: 'wall', position: { x: 300, y: 200 }, properties: { color: '#718096', width: 20, height: 220 } },
      
      // Interactive objects
      { type: 'furniture', position: { x: 100, y: 100 }, properties: { color: '#805ad5', type: 'chair' } },
      { type: 'furniture', position: { x: 150, y: 100 }, properties: { color: '#805ad5', type: 'chair' } },
      { type: 'furniture', position: { x: 650, y: 100 }, properties: { color: '#805ad5', type: 'chair' } },
      { type: 'furniture', position: { x: 700, y: 100 }, properties: { color: '#805ad5', type: 'chair' } },
      
      // Decorative objects
      { type: 'decoration', position: { x: 400, y: 300 }, properties: { color: '#48bb78', type: 'plant' } },
      { type: 'decoration', position: { x: 500, y: 500 }, properties: { color: '#f6ad55', type: 'table' } }
    ];

    // Add objects to room
    room.objects = walls;
    await room.save();
    
    console.log('Added initial game objects to room:', {
      roomId: room._id,
      name: room.name,
      objectCount: walls.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating initial game objects:', {
      error: error.message,
      roomId: room._id,
      timestamp: new Date().toISOString()
    });
    throw error;
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
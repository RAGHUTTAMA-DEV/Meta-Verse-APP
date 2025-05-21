const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = require('./app');

const authRoutes = require('./routes/authRoutes');
const roomRoutes = require('./routes/roomRoutes');
const User = require('./models/UserModel');
const Room = require('./models/Room');

async function createInitialGameObjects(room) {
  try {
    const walls = [
      { type: 'wall', position: { x: 0, y: 0 }, properties: { color: '#4a5568', width: 800, height: 20 } },
      { type: 'wall', position: { x: 0, y: 580 }, properties: { color: '#4a5568', width: 800, height: 20 } },
      { type: 'wall', position: { x: 0, y: 0 }, properties: { color: '#4a5568', width: 20, height: 600 } },
      { type: 'wall', position: { x: 780, y: 0 }, properties: { color: '#4a5568', width: 20, height: 600 } },
      
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
    
    console.log('Added initial game objects to room:', room.name);
  } catch (error) {
    console.error('Error creating initial game objects:', error);
  }
}

// Function to ensure lobby room exists
async function ensureLobbyRoom() {
  try {
    let lobbyRoom = await Room.findOne({ name: 'Lobby' });
    
    if (!lobbyRoom) {
      console.log('Creating lobby room...');
      lobbyRoom = new Room({
        name: 'Lobby',
        description: 'Main lobby room for all users',
        isSystemRoom: true,
        isPrivate: false,
        settings: {
          maxParticipants: 100,
          allowChat: true,
          allowVoice: true
        }
      });
      await lobbyRoom.save();
      console.log('Lobby room created successfully');
      
      // Add initial game objects
      await createInitialGameObjects(lobbyRoom);
    } else {
      console.log('Lobby room already exists:', lobbyRoom._id);
      
      // Check if room has objects, if not add them
      if (!lobbyRoom.objects || lobbyRoom.objects.length === 0) {
        console.log('Adding game objects to existing lobby room...');
        await createInitialGameObjects(lobbyRoom);
      }
    }
    
    return lobbyRoom;
  } catch (error) {
    console.error('Error ensuring lobby room exists:', error);
    throw error;
  }
}

// Create HTTP server
const server = http.createServer(app);

// Socket.IO setup with improved configuration
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? process.env.CLIENT_URL 
      : true,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  transports: ['websocket'], // Force WebSocket only for better performance
  allowUpgrades: false, // Disable transport upgrades
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  maxHttpBufferSize: 1e8, // 100MB max payload
  path: '/socket.io/',
  serveClient: false,
  cookie: false
});

// Room state management
const roomStates = new Map();

// Helper function to get or create room state
const getRoomState = async (roomId) => {
  if (roomStates.has(roomId)) {
    return roomStates.get(roomId);
  }

  const room = await Room.findById(roomId)
    .populate('participants.user', 'username avatar isOnline')
    .populate('createdBy', 'username avatar');

  if (!room) {
    throw new Error('Room not found');
  }

  roomStates.set(roomId, room);
  return room;
};

// Helper function to broadcast room state
const broadcastRoomState = async (roomId) => {
  try {
    const room = await getRoomState(roomId);
    io.to(roomId).emit('roomState', room);
  } catch (error) {
    console.error('Error broadcasting room state:', error);
  }
};

// Add movement throttling map
const lastMoveTime = new Map();

// Socket.IO connection handling with improved error handling
io.on('connection', (socket) => {
  let userId = null;
  let currentRoomId = null;

  // Handle authentication with improved security
  socket.on('authenticate', async (data, callback) => {
    try {
      if (!data?.token) {
        return callback?.({ error: 'No token provided' });
      }

      const decoded = jwt.verify(data.token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        return callback?.({ error: 'User not found' });
      }

      // Store user info in socket
      socket.user = user;
      userId = user._id;
      
      // Update user's online status
      user.isOnline = true;
      user.lastSeen = new Date();
      await user.save();

      callback?.({ 
        success: true, 
        user: { 
          username: user.username, 
          id: user._id,
          avatar: user.avatar
        }
      });

      // Join user's current room if any
      if (user.currentRoom) {
        socket.emit('joinRoom', user.currentRoom);
      }
    } catch (error) {
      console.error('Authentication error:', error);
      callback?.({ error: error.message });
    }
  });

  // Handle room joining with improved state management
  socket.on('joinRoom', async (roomId, callback) => {
    try {
      if (!userId) {
        callback?.({ error: 'User not authenticated' });
        return;
      }

      const room = await getRoomState(roomId);
      
      // Leave current room if any
      if (currentRoomId && currentRoomId !== roomId) {
        socket.leave(currentRoomId);
        await handleRoomLeave(currentRoomId);
      }

      // Join new room
      socket.join(roomId);
      currentRoomId = roomId;

      // Update user's current room
      const user = await User.findById(userId);
      user.currentRoom = roomId;
      await user.save();

      // Add user to room if not already present
      const isParticipant = room.participants.some(
        p => p.user._id.toString() === userId.toString()
      );

      if (!isParticipant) {
        const initialPosition = { x: 100, y: 100 };
        await room.addParticipant(userId, {
          position: initialPosition,
          lastPosition: { ...initialPosition }
        });
        await room.save();
      }

      // Notify room of new participant
      const participant = room.participants.find(
        p => p.user._id.toString() === userId.toString()
      );

      // Get socket ID for the participant
      const participantSocket = Array.from(io.sockets.sockets.values())
        .find(s => s.user?._id?.toString() === userId.toString());

      io.to(roomId).emit('userJoined', {
        userId: user._id,
        username: user.username,
        avatar: user.avatar,
        position: participant.position,
        lastPosition: participant.lastPosition,
        socketId: participantSocket?.id
      });

      // Update room state with socket IDs
      const updatedRoom = await getRoomState(roomId);
      updatedRoom.participants = updatedRoom.participants.map(p => ({
        ...p.toObject(),
        user: {
          ...p.user.toObject(),
          socketId: Array.from(io.sockets.sockets.values())
            .find(s => s.user?._id?.toString() === p.user._id.toString())?.id
        }
      }));

      // Broadcast updated room state
      io.to(roomId).emit('roomState', updatedRoom);

      // Send success response
      callback?.({ 
        success: true, 
        room: {
          _id: room._id,
          name: room.name,
          participants: updatedRoom.participants
        }
      });
    } catch (error) {
      console.error('Error joining room:', error);
      callback?.({ error: error.message });
    }
  });

  // Handle user movement with improved validation and throttling
  socket.on('userMove', async (data) => {
    try {
      if (!userId || !currentRoomId) {
        throw new Error('User not authenticated or not in a room');
      }

      const { position } = data;
      if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
        throw new Error('Invalid position data');
      }

      // Add movement throttling (50ms between updates)
      const now = Date.now();
      const lastMove = lastMoveTime.get(userId) || 0;
      if (now - lastMove < 50) {
        return; // Skip this update if too soon
      }
      lastMoveTime.set(userId, now);

      const room = await getRoomState(currentRoomId);
      const participant = room.participants.find(
        p => p.user._id.toString() === userId.toString()
      );

      if (!participant) {
        throw new Error('User not in room');
      }

      // Validate and clamp position
      const bounds = {
        minX: 20,
        maxX: 780,
        minY: 20,
        maxY: 580
      };

      const validatedPosition = {
        x: Math.max(bounds.minX, Math.min(bounds.maxX, position.x)),
        y: Math.max(bounds.minY, Math.min(bounds.maxY, position.y))
      };

      // Only update if position changed significantly
      if (Math.abs(participant.position.x - validatedPosition.x) > 0.1 || 
          Math.abs(participant.position.y - validatedPosition.y) > 0.1) {
        
        // Update participant position
        participant.lastPosition = { ...participant.position };
        participant.position = validatedPosition;
        participant.lastActive = new Date();

        // Use findOneAndUpdate instead of save to prevent parallel save issues
        await Room.findOneAndUpdate(
          { _id: currentRoomId, 'participants.user': userId },
          { 
            $set: {
              'participants.$.position': validatedPosition,
              'participants.$.lastPosition': participant.lastPosition,
              'participants.$.lastActive': participant.lastActive
            }
          },
          { new: true }
        );

        // Broadcast updated room state
        await broadcastRoomState(currentRoomId);
      }
    } catch (error) {
      console.error('Error handling movement:', error);
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('chatMessage', async (data, callback) => {
    try {
      if (!userId || !currentRoomId) {
        throw new Error('User not authenticated or not in a room');
      }

      const { message } = data;
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        throw new Error('Invalid message');
      }

      const room = await getRoomState(currentRoomId);
      const chatMessage = await room.addChatMessage(userId, message.trim());
      await room.save();

      // Broadcast message to room
      const messageToEmit = {
        ...chatMessage.toObject(),
        user: {
          _id: socket.user._id,
          username: socket.user.username,
          avatar: socket.user.avatar
        }
      };
      
      io.to(currentRoomId).emit('newMessage', messageToEmit);
      callback?.({ success: true, messageId: chatMessage._id });
    } catch (error) {
      console.error('Error handling chat message:', error);
      callback?.({ error: error.message });
    }
  });

  socket.on('signal', (data) => {
    try {
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const { to, signal } = data;
      if (!to || !signal) {
        throw new Error('Invalid signal data');
      }

      socket.to(to).emit('signal', {
        from: socket.id,
        username: socket.user.username,
        avatar: socket.user.avatar,
        signal
      });
    } catch (error) {
      console.error('Error handling WebRTC signal:', error);
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('disconnect', async (reason) => {
    try {
      if (userId) {
        const user = await User.findById(userId);
        if (user) {
          user.isOnline = false;
          user.lastSeen = new Date();
          await user.save();
        }
      }

      if (currentRoomId) {
        await handleRoomLeave(currentRoomId);
      }

      if (io.sockets.adapter.rooms.get(currentRoomId)?.size === 0) {
        roomStates.delete(currentRoomId);
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });

  async function handleRoomLeave(roomId) {
    try {
      const room = await getRoomState(roomId);
      if (room) {
        await room.removeParticipant(userId);
        await room.save();
        await broadcastRoomState(roomId);
      }
    } catch (error) {
      console.error('Error handling room leave:', error);
    }
  }
});

if (process.env.NODE_ENV !== 'test') {
  mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
      console.log('Connected to MongoDB');
      
      
      await ensureLobbyRoom();
      
      
      const PORT = process.env.PORT || 5000;
      server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
    })
    .catch((error) => {
      console.error('MongoDB connection error:', error);
      process.exit(1);
    });
}

module.exports = { app, server, io };

app.get('/', (req, res) => {
  res.json({ message: 'Metaverse Server is running' });
}); 
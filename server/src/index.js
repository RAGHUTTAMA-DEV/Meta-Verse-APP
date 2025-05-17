const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');

// Import routes
const authRoutes = require('./routes/authRoutes');
const roomRoutes = require('./routes/roomRoutes');
const User = require('./models/UserModel');
const Room = require('./models/Room');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Socket.IO authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return next(new Error('Authentication error'));
    }

    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id, socket.user.username);

  // Handle user joining a room
  socket.on('joinRoom', async (roomId) => {
    try {
      const room = await Room.findById(roomId);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Leave current room if any
      if (socket.user.currentRoom && socket.user.currentRoom !== 'lobby') {
        socket.leave(socket.user.currentRoom);
      }

      // Join new room
      socket.join(roomId);
      socket.user.currentRoom = roomId;
      await socket.user.save();

      // Notify room of new participant
      io.to(roomId).emit('userJoined', {
        userId: socket.user._id,
        username: socket.user.username,
        avatar: socket.user.avatar,
        position: { x: 0, y: 0 }
      });

      // Send room state to new participant
      const roomState = await Room.findById(roomId)
        .populate('participants.user', 'username avatar isOnline')
        .populate('createdBy', 'username avatar');
      
      socket.emit('roomState', roomState);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Handle user movement
  socket.on('userMove', async (data) => {
    try {
      const { roomId, position } = data;
      
      // Update user position in room
      const room = await Room.findById(roomId);
      if (!room) return;

      const participant = room.participants.find(
        p => p.user.toString() === socket.user._id.toString()
      );

      if (participant) {
        participant.position = position;
        await room.save();
      }

      // Broadcast movement to room
      socket.to(roomId).emit('userMoved', {
        userId: socket.user._id,
        username: socket.user.username,
        position
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Handle chat messages
  socket.on('chatMessage', async (data) => {
    try {
      const { roomId, message } = data;
      const room = await Room.findById(roomId);
      
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Add message to room
      const chatMessage = await room.addChatMessage(socket.user._id, message);

      // Broadcast message to room
      io.to(roomId).emit('newMessage', {
        ...chatMessage.toObject(),
        user: {
          _id: socket.user._id,
          username: socket.user.username,
          avatar: socket.user.avatar
        }
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Handle WebRTC signaling
  socket.on('signal', (data) => {
    socket.to(data.to).emit('signal', {
      from: socket.id,
      username: socket.user.username,
      signal: data.signal
    });
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    try {
      // Update user status
      socket.user.isOnline = false;
      socket.user.lastSeen = new Date();
      
      // Leave current room if any
      if (socket.user.currentRoom && socket.user.currentRoom !== 'lobby') {
        const room = await Room.findById(socket.user.currentRoom);
        if (room) {
          await room.removeParticipant(socket.user._id);
          io.to(room._id).emit('userLeft', {
            userId: socket.user._id,
            username: socket.user.username
          });
        }
        socket.user.currentRoom = 'lobby';
      }
      
      await socket.user.save();
      console.log('User disconnected:', socket.id, socket.user.username);
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/metaverse')
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Basic route for testing
app.get('/', (req, res) => {
  res.json({ message: 'Metaverse Server is running' });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 
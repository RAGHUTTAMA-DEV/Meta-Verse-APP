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
    } else {
      console.log('Lobby room already exists:', lobbyRoom._id);
    }
    
    return lobbyRoom;
  } catch (error) {
    console.error('Error ensuring lobby room exists:', error);
    throw error;
  }
}

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Middleware
const allowedOrigins = ['http://localhost:5173', 'http://localhost:5173/', 'http://localhost:5000'];
app.use(cors({
  origin: true, // Allow all origins for testing
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static('public')); // Serve static files from 'public' directory

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: true, // Allow all origins for testing
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  transports: ['polling', 'websocket'],
  allowUpgrades: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  path: '/socket.io/',
  serveClient: false,
  cookie: false
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Socket.IO connection attempt:', {
    id: socket.id,
    transport: socket.conn.transport.name,
    handshake: {
      query: socket.handshake.query,
      headers: socket.handshake.headers
    }
  });

  // Handle authentication
  socket.on('authenticate', async (data, callback) => {
    try {
      console.log('Authentication attempt:', {
        socketId: socket.id,
        data: data,
        transport: socket.conn.transport.name
      });

      const token = data.token || socket.handshake.query.token;
      
      if (!token) {
        console.log('No token provided');
        return callback({ error: 'No token provided' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Token decoded:', decoded);

      const user = await User.findById(decoded.userId);
      if (!user) {
        console.log('User not found:', decoded.userId);
        return callback({ error: 'User not found' });
      }

      console.log('User authenticated:', user.username);
      socket.user = user;
      
      // Send success response
      callback({ 
        success: true, 
        user: { 
          username: user.username, 
          id: user._id 
        }
      });

      // After successful authentication, try to join the lobby
      if (user.currentRoom) {
        socket.emit('joinRoom', user.currentRoom);
      }
    } catch (error) {
      console.error('Authentication error:', error);
      callback({ error: error.message });
    }
  });

  socket.on('error', (error) => {
    console.error('Socket error:', {
      socketId: socket.id,
      error: error,
      transport: socket.conn.transport.name
    });
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', {
      socketId: socket.id,
      reason: reason,
      transport: socket.conn.transport.name,
      user: socket.user?.username
    });
  });

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
      console.log('Received chat message:', {
        socketId: socket.id,
        userId: socket.user?._id,
        username: socket.user?.username,
        data: data
      });

      const { roomId, message } = data;
      const room = await Room.findById(roomId);
      
      if (!room) {
        console.log('Room not found:', roomId);
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      console.log('Found room:', {
        roomId: room._id,
        name: room.name,
        participants: room.participants.length
      });

      // Add message to room
      const chatMessage = await room.addChatMessage(socket.user._id, message);
      console.log('Message added to room:', {
        messageId: chatMessage._id,
        content: chatMessage.message,
        timestamp: chatMessage.createdAt
      });

      // Broadcast message to room
      const messageToEmit = {
        ...chatMessage.toObject(),
        user: {
          _id: socket.user._id,
          username: socket.user.username,
          avatar: socket.user.avatar
        }
      };
      console.log('Broadcasting message:', messageToEmit);
      
      io.to(roomId).emit('newMessage', messageToEmit);
    } catch (error) {
      console.error('Error handling chat message:', error);
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
});

// Connect to MongoDB and start server
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Ensure lobby room exists
    await ensureLobbyRoom();
    
    // Start server
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  });

// Basic route for testing
app.get('/', (req, res) => {
  res.json({ message: 'Metaverse Server is running' });
}); 
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
const Room = require('./models/Room');g

// Function to create initial game objects for a room
async function createInitialGameObjects(room) {
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
  socket.on('joinRoom', async (roomIdentifier) => {
    try {
      console.log('User attempting to join room:', {
        userId: socket.user._id,
        username: socket.user.username,
        roomIdentifier
      });

      // Try to find room by ID first, then by name
      let room = await Room.findById(roomIdentifier);
      if (!room) {
        room = await Room.findOne({ name: roomIdentifier });
      }
      
      if (!room) {
        console.error('Room not found:', roomIdentifier);
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Check if user is already in the room
      const isParticipant = room.participants.some(
        p => p.user._id.toString() === socket.user._id.toString()
      );

      if (!isParticipant) {
        console.log('Adding user to room participants:', {
          userId: socket.user._id,
          username: socket.user.username,
          roomId: room._id,
          roomName: room.name
        });

        // Add user to room with initial position
        await room.addParticipant(socket.user._id, { x: 100, y: 100 });
      }

      // Leave current room if any
      if (socket.user.currentRoom && socket.user.currentRoom !== roomIdentifier) {
        socket.leave(socket.user.currentRoom);
      }

      // Join new room
      socket.join(roomIdentifier);
      socket.user.currentRoom = roomIdentifier;
      await socket.user.save();

      // Populate room with full user details including avatar
      await room.populate('participants.user', 'username avatar isOnline');
      await room.populate('createdBy', 'username avatar');

      // Notify room of new participant
      io.to(roomIdentifier).emit('userJoined', {
        userId: socket.user._id,
        username: socket.user.username,
        avatar: socket.user.avatar,
        position: { x: 100, y: 100 }
      });

      // Send updated room state to all clients in the room
      console.log('Broadcasting room state after join:', {
        roomId: room._id,
        participants: room.participants.map(p => ({
          userId: p.user._id,
          username: p.user.username,
          avatar: p.user.avatar,
          position: p.position
        }))
      });

      io.to(roomIdentifier).emit('roomState', room);
    } catch (error) {
      console.error('Error in joinRoom:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Handle user movement
  socket.on('userMove', async (data) => {
    try {
      console.log('Received movement event:', {
        socketId: socket.id,
        userId: socket.user?._id,
        username: socket.user?.username,
        data
      });

      const { roomId, position } = data;
      
      // Update user position in room
      const room = await Room.findById(roomId)
        .populate('participants.user', 'username avatar isOnline');
      
      if (!room) {
        console.error('Room not found for movement:', roomId);
        return;
      }

      console.log('Found room for movement:', {
        roomId: room._id,
        roomName: room.name,
        participants: room.participants.length,
        movingUser: socket.user._id
      });

      const participant = room.participants.find(
        p => p.user._id.toString() === socket.user._id.toString()
      );

      if (participant) {
        console.log('Updating participant position:', {
          userId: socket.user._id,
          username: socket.user.username,
          oldPosition: participant.position,
          newPosition: position
        });

        participant.position = position;
        await room.save();
        
        // Broadcast updated room state to all clients in the room
        io.to(roomId).emit('roomState', room);
        
        console.log('Broadcasted room state update:', {
          roomId: room._id,
          participants: room.participants.map(p => ({
            userId: p.user._id,
            username: p.user.username,
            avatar: p.user.avatar,
            position: p.position
          }))
        });
      } else {
        console.error('Participant not found in room:', {
          userId: socket.user._id,
          roomId: room._id,
          participants: room.participants.map(p => p.user._id.toString())
        });
      }
    } catch (error) {
      console.error('Error handling user movement:', error);
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
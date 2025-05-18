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
  // Only log critical connection info
  console.log('New socket connection:', {
    id: socket.id,
    transport: socket.conn.transport.name
  });

  // Handle authentication
  socket.on('authenticate', async (data, callback) => {
    try {
      if (!data || typeof data !== 'object') {
        console.error('Invalid authentication data:', socket.id);
        return callback?.({ error: 'Invalid authentication data' });
      }

      const token = data.token;
      if (!token) {
        console.error('No token provided:', socket.id);
        return callback?.({ error: 'No token provided' });
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
          console.error('User not found:', decoded.userId);
          return callback?.({ error: 'User not found' });
        }

        // Store user in socket
        socket.user = user;
        socket.userId = user._id;
        
        console.log('User authenticated:', {
          userId: user._id,
          username: user.username,
          socketId: socket.id
        });

        callback?.({ 
          success: true, 
          user: { 
            username: user.username, 
            id: user._id 
          }
        });

        // Join current room after authentication
        if (user.currentRoom) {
          socket.emit('joinRoom', user.currentRoom);
        }
      } catch (jwtError) {
        console.error('JWT verification failed:', jwtError.message);
        return callback?.({ error: 'Invalid token' });
      }
    } catch (error) {
      console.error('Authentication error:', error.message);
      callback?.({ error: error.message });
    }
  });

  socket.on('error', (error) => {
    console.error('Socket error:', {
      socketId: socket.id,
      error: error.message
    });
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', {
      socketId: socket.id,
      reason,
      username: socket.user?.username
    });
  });

  // Handle user joining a room
  socket.on('joinRoom', async (roomIdentifier) => {
    try {
      // Find room
      let room = await Room.findById(roomIdentifier);
      if (!room) {
        room = await Room.findOne({ name: roomIdentifier });
      }
      
      if (!room) {
        console.error('Room not found:', roomIdentifier);
        socket.emit('error', { message: 'Room not found' });
        return;
      }
          room.participants = room.participants.map(participant => {
        if (!participant.lastPosition) {
          participant.lastPosition = { ...participant.position };
        }
        return participant;
      });
      await room.save();

      // Check if user is already in the room
      const isParticipant = room.participants.some(
        p => p.user._id.toString() === socket.user._id.toString()
      );

      if (!isParticipant) {
        // Add user to room with initial position
        const initialPosition = { x: 100, y: 100 };
        await room.addParticipant(socket.user._id, {
          position: initialPosition,
          lastPosition: { ...initialPosition }
        });
      }

      // Leave current room if any
      if (socket.user.currentRoom && socket.user.currentRoom !== roomIdentifier) {
        socket.leave(socket.user.currentRoom);
      }

      // Join new room
      socket.join(roomIdentifier);
      socket.user.currentRoom = roomIdentifier;
      await socket.user.save();

      // Populate room with user details
      await room.populate('participants.user', 'username avatar isOnline');
      await room.populate('createdBy', 'username avatar');

      // Notify room of new participant
      const participant = room.participants.find(p => p.user._id.toString() === socket.user._id.toString());
      io.to(roomIdentifier).emit('userJoined', {
        userId: socket.user._id,
        username: socket.user.username,
        avatar: socket.user.avatar,
        position: participant.position,
        lastPosition: participant.lastPosition
      });

      // Send updated room state
      io.to(roomIdentifier).emit('roomState', room);
    } catch (error) {
      console.error('Error in joinRoom:', error.message);
      socket.emit('error', { message: error.message });
    }
  });

  // Handle user movement
  socket.on('userMove', async (data) => {
    try {
      if (!socket.user || !socket.userId) {
        console.error('No user associated with socket for movement:', socket.id);
        return;
      }

      // Validate movement data
      if (!data || typeof data !== 'object') {
        console.error('Invalid movement data format:', socket.id);
        return;
      }

      const { roomId, position } = data;
      
      if (!roomId || !position || typeof position.x !== 'number' || typeof position.y !== 'number') {
        console.error('Invalid movement data:', socket.id);
        return;
      }

      // Find room and update participant position
      const room = await Room.findById(roomId)
        .populate('participants.user', 'username avatar isOnline');

      if (!room) {
        console.error('Room not found for movement:', roomId);
        return;
      }

      // Find the participant
      const participant = room.participants.find(
        p => p.user._id.toString() === socket.user._id.toString()
      );

      if (!participant) {
        console.error('User not in room:', {
          userId: socket.user._id,
          roomId: room._id
        });
        return;
      }

      // Validate position is within room bounds
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

      // Only update if position actually changed
      if (participant.position.x !== validatedPosition.x || participant.position.y !== validatedPosition.y) {
        // Store the last position before updating
        participant.lastPosition = { ...participant.position };
        participant.position = validatedPosition;
        participant.lastActive = new Date();

        // Ensure all participants have lastPosition set
        room.participants = room.participants.map(p => {
          if (!p.lastPosition) {
            p.lastPosition = { ...p.position };
          }
          return p;
        });

        // Save and broadcast
        await room.save();
        io.to(roomId).emit('roomState', room);
      }
    } catch (error) {
      console.error('Error handling user movement:', error.message);
    }
  });

  // Handle chat messages
  socket.on('chatMessage', async (data, callback) => {
    try {
      if (!socket.user) {
        console.error('No user associated with socket:', socket.id);
        return callback?.({ error: 'User not authenticated' });
      }

      const { roomId, message } = data;
      if (!roomId || !message) {
        console.error('Invalid message data:', socket.id);
        return callback?.({ error: 'Invalid message data' });
      }

      const room = await Room.findById(roomId);
      if (!room) {
        console.error('Room not found:', roomId);
        return callback?.({ error: 'Room not found' });
      }

      // Add message to room
      const chatMessage = await room.addChatMessage(socket.user._id, message);

      // Broadcast message to room
      const messageToEmit = {
        ...chatMessage.toObject(),
        user: {
          _id: socket.user._id,
          username: socket.user.username,
          avatar: socket.user.avatar
        }
      };
      
      io.to(roomId).emit('newMessage', messageToEmit);
      callback?.({ success: true, messageId: chatMessage._id });
    } catch (error) {
      console.error('Error handling chat message:', error.message);
      callback?.({ error: error.message });
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
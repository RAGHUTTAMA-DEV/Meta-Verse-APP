const { io: Client } = require('socket.io-client');
const { app, server, io } = require('../index');
const User = require('../models/UserModel');
const Room = require('../models/Room');
const jwt = require('jsonwebtoken');

// Increase timeout for all tests
jest.setTimeout(30000);

let clientSocket;
let testUser;
let authToken;
let testRoom;

// Helper function to create test user and get auth token
const createTestUser = async () => {
  const user = await User.create({
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123',
    currentRoom: 'lobby'
  });
  
  const token = jwt.sign(
    { userId: user._id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  
  return { user, token };
};

// Helper function to wait for socket event with timeout
const waitForEvent = (socket, event, timeout = 10000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${event} event`));
    }, timeout);

    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
};

beforeAll(async () => {
  // Clear existing data
  await Room.deleteMany({});
  await User.deleteMany({});
  
  // Create test user and get token
  const { user, token } = await createTestUser();
  testUser = user;
  authToken = token;
  
  // Create test room
  testRoom = await Room.create({
    name: 'Test Room',
    description: 'A test room',
    createdBy: testUser._id,
    isPrivate: false,
    maxParticipants: 50
  });
});

beforeEach((done) => {
  // Create new socket client for each test
  clientSocket = new Client('http://localhost:5000', {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: false,
    timeout: 10000
  });
  
  // Connect socket
  clientSocket.connect();
  
  // Wait for connection
  clientSocket.on('connect', () => {
    done();
  });
  
  clientSocket.on('connect_error', (error) => {
    done(error);
  });
});

afterEach(() => {
  if (clientSocket.connected) {
    clientSocket.disconnect();
  }
});

afterAll(async () => {
  await Room.deleteMany({});
  await User.deleteMany({});
  await new Promise((resolve) => {
    server.close(resolve);
  });
});

describe('Socket.IO', () => {
  describe('Authentication', () => {
    it('should authenticate with valid token', async () => {
      const response = await new Promise((resolve, reject) => {
        clientSocket.emit('authenticate', { token: authToken }, (response) => {
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });

      expect(response).toMatchObject({
        success: true,
        user: {
          username: testUser.username,
          id: testUser._id.toString()
        }
      });
    });

    it('should reject invalid token', async () => {
      const response = await new Promise((resolve, reject) => {
        clientSocket.emit('authenticate', { token: 'invalid-token' }, (response) => {
          resolve(response);
        });
      });

      expect(response).toMatchObject({
        error: expect.any(String)
      });
    });

    it('should reject missing token', async () => {
      const response = await new Promise((resolve, reject) => {
        clientSocket.emit('authenticate', {}, (response) => {
          resolve(response);
        });
      });

      expect(response).toMatchObject({
        error: 'No token provided'
      });
    });
  });

  describe('Room Management', () => {
    beforeEach(async () => {
      // Authenticate socket before each test
      await new Promise((resolve, reject) => {
        clientSocket.emit('authenticate', { token: authToken }, (response) => {
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });
    });

    it('should join room successfully', async () => {
      // Listen for room state update
      const roomStatePromise = waitForEvent(clientSocket, 'roomState');
      
      // Join room
      clientSocket.emit('joinRoom', testRoom._id);
      
      // Wait for room state
      const roomState = await roomStatePromise;
      
      expect(roomState).toMatchObject({
        _id: testRoom._id.toString(),
        name: testRoom.name,
        participants: expect.arrayContaining([
          expect.objectContaining({
            user: expect.objectContaining({
              _id: testUser._id.toString(),
              username: testUser.username
            })
          })
        ])
      });
    });

    it('should not join non-existent room', async () => {
      const errorPromise = waitForEvent(clientSocket, 'error');
      
      clientSocket.emit('joinRoom', 'nonexistent-room-id');
      
      const error = await errorPromise;
      expect(error).toMatchObject({
        message: 'Room not found'
      });
    });

    it('should handle user movement', async () => {
      // Join room first
      await new Promise((resolve) => {
        clientSocket.emit('joinRoom', testRoom._id);
        clientSocket.once('roomState', resolve);
      });

      // Listen for room state updates
      const roomStatePromise = waitForEvent(clientSocket, 'roomState');
      
      // Move user
      clientSocket.emit('userMove', {
        roomId: testRoom._id,
        position: { x: 100, y: 100 }
      });
      
      // Wait for room state update
      const roomState = await roomStatePromise;
      
      // Find user in participants
      const participant = roomState.participants.find(
        p => p.user._id.toString() === testUser._id.toString()
      );
      
      expect(participant).toMatchObject({
        position: { x: 100, y: 100 },
        lastPosition: expect.any(Object)
      });
    });

    it('should validate movement bounds', async () => {
      // Join room first
      await new Promise((resolve) => {
        clientSocket.emit('joinRoom', testRoom._id);
        clientSocket.once('roomState', resolve);
      });

      // Listen for room state updates
      const roomStatePromise = waitForEvent(clientSocket, 'roomState');
      
      // Try to move outside bounds
      clientSocket.emit('userMove', {
        roomId: testRoom._id,
        position: { x: 1000, y: 1000 }
      });
      
      // Wait for room state update
      const roomState = await roomStatePromise;
      
      // Find user in participants
      const participant = roomState.participants.find(
        p => p.user._id.toString() === testUser._id.toString()
      );
      
      // Position should be clamped to room bounds
      expect(participant.position.x).toBeLessThanOrEqual(780);
      expect(participant.position.y).toBeLessThanOrEqual(580);
      expect(participant.position.x).toBeGreaterThanOrEqual(20);
      expect(participant.position.y).toBeGreaterThanOrEqual(20);
    });
  });

  describe('Chat Messages', () => {
    beforeEach(async () => {
      // Authenticate and join room
      await new Promise((resolve, reject) => {
        clientSocket.emit('authenticate', { token: authToken }, (response) => {
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });

      await new Promise((resolve) => {
        clientSocket.emit('joinRoom', testRoom._id);
        clientSocket.once('roomState', resolve);
      });
    });

    it('should send and receive chat messages', async () => {
      const messagePromise = waitForEvent(clientSocket, 'newMessage');
      
      // Send message
      const response = await new Promise((resolve, reject) => {
        clientSocket.emit('chatMessage', {
          roomId: testRoom._id,
          message: 'Hello, world!'
        }, (response) => {
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });

      expect(response).toMatchObject({
        success: true,
        messageId: expect.any(String)
      });

      // Wait for message broadcast
      const message = await messagePromise;
      
      expect(message).toMatchObject({
        message: 'Hello, world!',
        user: {
          _id: testUser._id.toString(),
          username: testUser.username
        }
      });
    });

    it('should not send message without authentication', async () => {
      // Disconnect and create new unauthenticated socket
      clientSocket.disconnect();
      clientSocket = new Client('http://localhost:5000', {
        transports: ['websocket'],
        autoConnect: false,
        reconnection: false
      });
      clientSocket.connect();

      await new Promise((resolve) => {
        clientSocket.on('connect', resolve);
      });

      const response = await new Promise((resolve) => {
        clientSocket.emit('chatMessage', {
          roomId: testRoom._id,
          message: 'Hello, world!'
        }, (response) => {
          resolve(response);
        });
      });

      expect(response).toMatchObject({
        error: 'User not authenticated'
      });
    });

    it('should not send message to non-existent room', async () => {
      const response = await new Promise((resolve) => {
        clientSocket.emit('chatMessage', {
          roomId: 'nonexistent-room-id',
          message: 'Hello, world!'
        }, (response) => {
          resolve(response);
        });
      });

      expect(response).toMatchObject({
        error: 'Room not found'
      });
    });
  });

  describe('WebRTC Signaling', () => {
    let otherSocket;
    let otherUser;

    beforeEach(async () => {
      // Create another user and socket
      otherUser = await User.create({
        username: 'otheruser',
        email: 'other@example.com',
        password: 'password123'
      });

      const otherToken = jwt.sign(
        { userId: otherUser._id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      otherSocket = new Client('http://localhost:5000', {
        transports: ['websocket'],
        autoConnect: false,
        reconnection: false
      });

      otherSocket.connect();

      // Authenticate both sockets
      await new Promise((resolve, reject) => {
        clientSocket.emit('authenticate', { token: authToken }, (response) => {
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });

      await new Promise((resolve, reject) => {
        otherSocket.emit('authenticate', { token: otherToken }, (response) => {
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });
    });

    afterEach(() => {
      if (otherSocket.connected) {
        otherSocket.disconnect();
      }
    });

    it('should handle WebRTC signaling between users', async () => {
      const signalPromise = waitForEvent(otherSocket, 'signal');
      
      // Send signal from first user to second user
      clientSocket.emit('signal', {
        to: otherSocket.id,
        signal: { type: 'offer', sdp: 'test-sdp' }
      });
      
      // Wait for signal to be received
      const signal = await signalPromise;
      
      expect(signal).toMatchObject({
        from: clientSocket.id,
        username: testUser.username,
        signal: {
          type: 'offer',
          sdp: 'test-sdp'
        }
      });
    });
  });
}); 
}); 
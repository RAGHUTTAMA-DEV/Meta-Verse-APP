const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../index');
const Room = require('../models/Room');
const User = require('../models/UserModel');

let authToken;
let testUser;
let testRoom;

// Helper function to create test user and get auth token
const createTestUser = async () => {
  const user = await User.create({
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123',
    currentRoom: 'lobby'
  });
  
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: 'test@example.com', password: 'password123' });
    
  return { user, token: response.body.data.token };
};

beforeAll(async () => {
  // Clear existing data
  await Room.deleteMany({});
  await User.deleteMany({});
  
  // Create test user and get token
  const { user, token } = await createTestUser();
  testUser = user;
  authToken = token;
});

beforeEach(async () => {
  // Clear rooms before each test
  await Room.deleteMany({});
  
  // Create a test room
  testRoom = await Room.create({
    name: 'Test Room',
    description: 'A test room',
    createdBy: testUser._id,
    isPrivate: false,
    maxParticipants: 50
  });
});

afterAll(async () => {
  await mongoose.connection.close();
});

describe('Room API', () => {
  describe('POST /api/rooms', () => {
    it('should create a new room', async () => {
      const response = await request(app)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'New Room',
          description: 'A new room',
          isPrivate: false,
          maxParticipants: 30
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          room: expect.objectContaining({
            name: 'New Room',
            description: 'A new room',
            isPrivate: false,
            maxParticipants: 30,
            createdBy: testUser._id.toString()
          })
        }
      });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/rooms')
        .send({
          name: 'New Room',
          description: 'A new room'
        });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        status: 'error',
        error: expect.any(String)
      });
    });

    it('should not allow duplicate room names', async () => {
      const response = await request(app)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Room',
          description: 'Another test room'
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        status: 'error',
        error: 'Room name already exists'
      });
    });
  });

  describe('GET /api/rooms', () => {
    it('should get all public rooms', async () => {
      const response = await request(app)
        .get('/api/rooms')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          rooms: expect.arrayContaining([
            expect.objectContaining({
              name: 'Test Room',
              description: 'A test room',
              isPrivate: false
            })
          ])
        }
      });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/rooms');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        status: 'error',
        error: expect.any(String)
      });
    });

    it('should filter rooms by name', async () => {
      const response = await request(app)
        .get('/api/rooms?name=Test Room')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          rooms: expect.arrayContaining([
            expect.objectContaining({
              name: 'Test Room'
            })
          ])
        }
      });
      expect(response.body.data.rooms.length).toBe(1);
    });
  });

  describe('GET /api/rooms/:id', () => {
    it('should get room by ID', async () => {
      const response = await request(app)
        .get(`/api/rooms/${testRoom._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          room: expect.objectContaining({
            _id: testRoom._id.toString(),
            name: 'Test Room',
            description: 'A test room'
          })
        }
      });
    });

    it('should return 404 for non-existent room', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/rooms/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        status: 'error',
        error: 'Room not found'
      });
    });
  });

  describe('PUT /api/rooms/:id', () => {
    it('should update room settings', async () => {
      const response = await request(app)
        .put(`/api/rooms/${testRoom._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Updated description',
          maxParticipants: 40
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          room: expect.objectContaining({
            description: 'Updated description',
            maxParticipants: 40
          })
        }
      });
    });

    it('should not allow non-creator to update room', async () => {
      // Create another user
      const otherUser = await User.create({
        username: 'otheruser',
        email: 'other@example.com',
        password: 'password123'
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'other@example.com', password: 'password123' });

      const response = await request(app)
        .put(`/api/rooms/${testRoom._id}`)
        .set('Authorization', `Bearer ${loginResponse.body.data.token}`)
        .send({
          description: 'Updated by other user'
        });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        status: 'error',
        error: 'Only room creator can update settings'
      });
    });
  });

  describe('DELETE /api/rooms/:id', () => {
    it('should delete room', async () => {
      const response = await request(app)
        .delete(`/api/rooms/${testRoom._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          message: 'Room deleted successfully'
        }
      });

      // Verify room is deleted
      const deletedRoom = await Room.findById(testRoom._id);
      expect(deletedRoom).toBeNull();
    });

    it('should not allow non-creator to delete room', async () => {
      // Create another user
      const otherUser = await User.create({
        username: 'otheruser',
        email: 'other@example.com',
        password: 'password123'
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'other@example.com', password: 'password123' });

      const response = await request(app)
        .delete(`/api/rooms/${testRoom._id}`)
        .set('Authorization', `Bearer ${loginResponse.body.data.token}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        status: 'error',
        error: 'Only room creator can delete room'
      });
    });
  });
}); 
const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../index');
const User = require('../models/UserModel');

let testUser;
let authToken;

beforeAll(async () => {
  // Clear existing data
  await User.deleteMany({});
});

beforeEach(async () => {
  // Clear users before each test
  await User.deleteMany({});
  
  // Create test user
  testUser = await User.create({
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123',
    currentRoom: 'lobby'
  });
});

afterAll(async () => {
  await mongoose.connection.close();
});

describe('Auth API', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'newuser',
          email: 'new@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          user: expect.objectContaining({
            username: 'newuser',
            email: 'new@example.com',
            currentRoom: 'lobby'
          }),
          token: expect.any(String)
        }
      });

      // Verify user was created in database
      const user = await User.findOne({ email: 'new@example.com' });
      expect(user).toBeTruthy();
      expect(user.username).toBe('newuser');
    });

    it('should not register user with existing email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'different',
          email: 'test@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        status: 'error',
        error: 'User already exists'
      });
    });

    it('should not register user with existing username', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'different@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        status: 'error',
        error: 'User already exists'
      });
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'newuser'
          // Missing email and password
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        status: 'error',
        error: expect.any(String)
      });
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login existing user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          user: expect.objectContaining({
            username: 'testuser',
            email: 'test@example.com',
            isOnline: true,
            currentRoom: 'lobby'
          }),
          token: expect.any(String)
        }
      });

      // Store token for other tests
      authToken = response.body.data.token;
    });

    it('should not login with wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        status: 'error',
        error: 'Invalid credentials'
      });
    });

    it('should not login non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        status: 'error',
        error: 'Invalid credentials'
      });
    });
  });

  describe('POST /api/auth/logout', () => {
    beforeEach(async () => {
      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });
      authToken = loginResponse.body.data.token;
    });

    it('should logout user', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          message: 'Logged out successfully'
        }
      });

      // Verify user is offline
      const user = await User.findById(testUser._id);
      expect(user.isOnline).toBe(false);
      expect(user.currentRoom).toBe('lobby');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        status: 'error',
        error: expect.any(String)
      });
    });
  });

  describe('GET /api/auth/me', () => {
    beforeEach(async () => {
      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });
      authToken = loginResponse.body.data.token;
    });

    it('should get current user profile', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          user: expect.objectContaining({
            username: 'testuser',
            email: 'test@example.com',
            isOnline: true,
            currentRoom: 'lobby'
          })
        }
      });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        status: 'error',
        error: expect.any(String)
      });
    });
  });

  describe('PUT /api/auth/profile', () => {
    beforeEach(async () => {
      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });
      authToken = loginResponse.body.data.token;
    });

    it('should update user profile', async () => {
      const response = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          username: 'updateduser',
          avatar: 'new-avatar.png'
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          user: expect.objectContaining({
            username: 'updateduser',
            avatar: 'new-avatar.png',
            email: 'test@example.com' // Email should remain unchanged
          })
        }
      });

      // Verify changes in database
      const user = await User.findById(testUser._id);
      expect(user.username).toBe('updateduser');
      expect(user.avatar).toBe('new-avatar.png');
    });

    it('should not allow duplicate username', async () => {
      // Create another user
      await User.create({
        username: 'existinguser',
        email: 'existing@example.com',
        password: 'password123'
      });

      const response = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          username: 'existinguser'
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        status: 'error',
        error: 'Username already taken'
      });
    });

    it('should not allow duplicate email', async () => {
      // Create another user
      await User.create({
        username: 'existinguser',
        email: 'existing@example.com',
        password: 'password123'
      });

      const response = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'existing@example.com'
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        status: 'error',
        error: 'Email already taken'
      });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .put('/api/auth/profile')
        .send({
          username: 'updateduser'
        });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        status: 'error',
        error: expect.any(String)
      });
    });
  });
}); 
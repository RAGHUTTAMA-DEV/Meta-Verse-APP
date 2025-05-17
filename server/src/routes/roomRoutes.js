const express = require('express');
const router = express.Router();
const {
  createRoom,
  getRooms,
  getRoom,
  joinRoom,
  leaveRoom,
  updateRoom,
  deleteRoom
} = require('../controllers/roomController');
const auth = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Room routes
router.post('/', createRoom);                    // Create new room
router.get('/', getRooms);                      // Get all public rooms
router.get('/:roomId', getRoom);                // Get specific room
router.post('/:roomId/join', joinRoom);         // Join a room
router.post('/:roomId/leave', leaveRoom);       // Leave a room
router.patch('/:roomId', updateRoom);           // Update room settings
router.delete('/:roomId', deleteRoom);          // Delete room

module.exports = router; 
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
router.post('/', createRoom);                    
router.get('/', getRooms);                      
router.get('/:roomId', getRoom);                
router.post('/:roomId/join', joinRoom);         
router.post('/:roomId/leave', leaveRoom);       
router.patch('/:roomId', updateRoom);           
router.delete('/:roomId', deleteRoom);         

module.exports = router; 
const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['text', 'system'],
    default: 'text'
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Static method to get messages with cursor
chatMessageSchema.statics.getMessages = async function(roomId, cursor, limit = 50) {
  const query = { room: roomId };
  if (cursor) {
    query._id = { $lt: cursor };
  }
  
  return this.find(query)
    .sort({ _id: -1 })
    .limit(limit)
    .populate('user', 'username avatar')
    .lean();
};

// Static method to get new messages after timestamp
chatMessageSchema.statics.getNewMessages = async function(roomId, lastTimestamp) {
  return this.find({
    room: roomId,
    createdAt: { $gt: lastTimestamp }
  })
    .sort({ createdAt: 1 })
    .populate('user', 'username avatar')
    .lean();
};

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

module.exports = ChatMessage; 
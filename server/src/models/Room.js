const mongoose = require('mongoose');
const ChatMessage = require('./ChatMessage');

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  maxParticipants: {
    type: Number,
    default: 50
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  password: {
    type: String,
    select: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    position: {
      x: Number,
      y: Number
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  objects: [{
    type: {
      type: String,
      required: true
    },
    position: {
      x: Number,
      y: Number
    },
    properties: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  }]
}, {
  timestamps: true
});

// Method to add a participant to the room
roomSchema.methods.addParticipant = async function(userId, position = { x: 0, y: 0 }) {
  if (this.participants.length >= this.maxParticipants) {
    throw new Error('Room is full');
  }

  const participant = {
    user: userId,
    position,
    joinedAt: new Date()
  };

  this.participants.push(participant);
  return this.save();
};

// Method to remove a participant from the room
roomSchema.methods.removeParticipant = async function(userId) {
  this.participants = this.participants.filter(p => p.user.toString() !== userId.toString());
  return this.save();
};

// Method to add a chat message
roomSchema.methods.addChatMessage = async function(userId, message, type = 'text', metadata = {}) {
  const chatMessage = new ChatMessage({
    room: this._id,
    user: userId,
    message,
    type,
    metadata
  });

  await chatMessage.save();
  return chatMessage;
};

// Method to get chat messages with cursor
roomSchema.methods.getChatMessages = async function(cursor, limit = 50) {
  return ChatMessage.getMessages(this._id, cursor, limit);
};

// Method to get new messages after a timestamp
roomSchema.methods.getNewMessages = async function(lastTimestamp) {
  return ChatMessage.getNewMessages(this._id, lastTimestamp);
};

const Room = mongoose.model('Room', roomSchema);

module.exports = Room; 
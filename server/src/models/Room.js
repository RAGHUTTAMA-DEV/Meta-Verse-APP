const mongoose = require('mongoose');
const ChatMessage = require('./ChatMessage');

const gameObjectSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['wall', 'furniture', 'decoration', 'interactive']
  },
  position: {
    x: { type: Number, required: true },
    y: { type: Number, required: true }
  },
  properties: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map()
  }
}, { _id: false });

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
  isSystemRoom: {
    type: Boolean,
    default: false
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  settings: {
    maxParticipants: {
      type: Number,
      default: 50
    },
    allowChat: {
      type: Boolean,
      default: true
    },
    allowVoice: {
      type: Boolean,
      default: true
    }
  },
  password: {
    type: String,
    select: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return !this.isSystemRoom; // Only required for non-system rooms
    }
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    position: {
      x: { type: Number, default: 100 },
      y: { type: Number, default: 100 }
    },
    lastActive: {
      type: Date,
      default: Date.now
    }
  }],
  messages: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    content: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  objects: [gameObjectSchema],
  createdAt: {
    type: Date,
    default: Date.now
  }
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
    lastActive: new Date()
  };

  this.participants.push(participant);
  return this.save();
};

// Method to remove a participant from the room
roomSchema.methods.removeParticipant = async function(userId) {
  const index = this.participants.findIndex(p => p.user._id === userId);
  if (index !== -1) {
    this.participants.splice(index, 1);
  }
  try {
    await this.save();
  } catch (e) {
    if (e.code === 11000) {
      console.log("Ignoring parallel save (or duplicate key) (or \"Can't save() the same doc multiple times in parallel\") (" + e.message + ")");
    } else {
      throw e;
    }
  }
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
const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user'
  },
  students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user'
  }],
  activeUsers: [{
    userId: String,
    socketId: String,
    username: String
  }],
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // TTL: Auto-delete after 24 hours
  }
});

module.exports = mongoose.model('room', RoomSchema);

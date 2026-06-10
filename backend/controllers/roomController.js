const Room = require('../models/Room');
const { nanoid } = require('nanoid');
const mongoose = require('mongoose');

// In-memory fallback for when DB is offline
let memoryRooms = [];

const isDbConnected = () => mongoose.connection.readyState === 1;

// Create Room
exports.createRoom = async (req, res) => {
  const { name, description } = req.body;
  try {

    const roomId = nanoid(6).toUpperCase();
    
    if (!isDbConnected()) {
      console.log('DB Offline: Creating room in memory...');
      const room = { roomId, name: name || `Room ${roomId}`, description, teacher: req.user.id, students: [], isMemory: true };
      memoryRooms.push(room);
      return res.json(room);
    }

    const newRoom = new Room({
      roomId,
      name: name || `Room ${roomId}`,
      description: description || '',
      teacher: req.user.id
    });
    await newRoom.save();
    res.json(newRoom);
  } catch (err) {
    console.error('Create Room Error:', err.message);
    res.status(500).send('Server error: ' + err.message);
  }
};

// Join Room
exports.joinRoom = async (req, res) => {
  const { roomId } = req.body;
  try {
    let room;
    if (isDbConnected()) {
      room = await Room.findOne({ roomId });
    }
    
    // If not found in DB, check memory
    if (!room) {
      room = memoryRooms.find(r => r.roomId === roomId);
    }

    if (!room) return res.status(404).json({ msg: 'Room not found. Please check the code.' });
    
    const userRole = (req.user.role || '').toLowerCase();
    if (userRole === 'student' && String(room.teacher) !== String(req.user.id)) {
      if (room.students && !room.students.includes(req.user.id)) {
        room.students.push(req.user.id);
        if (isDbConnected() && !room.isMemory) await room.save();
      }
    }
    res.json(room);
  } catch (err) {
    console.error('Join Room Error:', err.message);
    res.status(500).send('Server error');
  }
};

// Get All Rooms
exports.getRooms = async (req, res) => {
  try {
    let rooms = [];
    if (isDbConnected()) {
      rooms = await Room.find().sort({ createdAt: -1 });
    }
    // Combine with memory rooms
    const allRooms = [...rooms, ...memoryRooms];
    res.json(allRooms);
  } catch (err) {
    res.status(500).send('Server error');
  }
};

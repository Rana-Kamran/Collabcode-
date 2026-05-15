const express = require('express');
const router = express.Router();
const { createRoom, joinRoom, getRooms } = require('../controllers/roomController');
const auth = require('../middleware/auth');

router.get('/', auth, getRooms);
router.post('/create', auth, createRoom);
router.post('/join', auth, joinRoom);

module.exports = router;

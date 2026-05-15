import React, { useState, useEffect } from 'react';
import { FaSignInAlt, FaArrowLeft, FaSignOutAlt } from 'react-icons/fa';
import './StudentDashboard.css';
import api from '../utils/api';

const StudentDashboard = ({ user, token, onJoinRoom, onBack, onLogout, showToast }) => {
  const [roomCode, setRoomCode] = useState('');
  const [availableRooms, setAvailableRooms] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const data = await api.get('/rooms', token);
        setAvailableRooms(data);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
    fetchRooms();
  }, [token]);

  const handleJoinWithCode = async () => {
    if (!roomCode.trim()) {
      showToast('Please enter a room code', 'warning');
      return;
    }

    setLoading(true);
    try {
      const data = await api.post('/rooms/join', { roomId: roomCode.toUpperCase() }, token);
      onJoinRoom(data);
      showToast(`Joined room: ${data.name}`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (room) => {
    setLoading(true);
    try {
      const data = await api.post('/rooms/join', { roomId: room.roomId }, token);
      onJoinRoom(data);
      showToast(`Joined room: ${data.name}`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="logo">
          <i className="fas fa-code"></i>
          <span>CollabCode - Student</span>
        </div>
        <div className="header-controls">
          <button className="btn btn-outline" onClick={onBack}>
            <FaArrowLeft /> Back
          </button>
          <div className="user-info">
            <div className="user-avatar">{user?.avatar || 'S'}</div>
            <span className="user-name">{user?.name || 'Student'}</span>
          </div>
          <button className="btn btn-outline" onClick={onLogout}>
            <FaSignOutAlt /> Logout
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="dashboard-card">
          <h2>Join a Room</h2>
          
          <div className="join-room-form">
            <div className="form-group">
              <label>Room Code</label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Enter room code (e.g., ROOM123)"
                maxLength="8"
              />
            </div>
            
            <button 
              className="btn btn-primary btn-lg"
              onClick={handleJoinWithCode}
            >
              <FaSignInAlt /> Join Room
            </button>
          </div>
        </div>

        <div className="dashboard-card">
          <h2>Available Rooms</h2>
          
          <div className="room-grid">
            {availableRooms.map(room => (
              <div key={room.id} className="room-card">
                <div className="room-card-header">
                  <h3>{room.name}</h3>
                  <span className="room-status">{room.students} students</span>
                </div>
                <div className="room-card-body">
                  <p>{room.description}</p>
                  <div className="room-details">
                    <p><strong>Teacher:</strong> {room.teacher}</p>
                    <p><strong>Code:</strong> {room.roomId || room.id}</p>
                  </div>
                </div>
                <div className="room-card-actions">
                  <button 
                    className="btn btn-primary"
                    onClick={() => handleJoinRoom(room)}
                  >
                    <FaSignInAlt /> Join Room
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
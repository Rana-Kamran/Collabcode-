import React, { useState } from 'react';
import { FaSignInAlt, FaArrowLeft, FaSignOutAlt } from 'react-icons/fa';
import './StudentDashboard.css';
import api from '../utils/api';

const StudentDashboard = ({ user, token, onJoinRoom, onBack, onLogout, showToast }) => {
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoinWithCode = async () => {
    if (!roomCode.trim()) {
      showToast('Please enter a room code', 'warning');
      return;
    }

    setLoading(true);
    try {
      const data = await api.post('/rooms/join', { roomId: roomCode.trim().toUpperCase() }, token);
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
            <div className="user-avatar">{user?.avatar || (user?.name || 'S').charAt(0).toUpperCase()}</div>
            <span className="user-name">{user?.name || 'Student'}</span>
          </div>
          <button className="btn btn-outline" onClick={onLogout}>
            <FaSignOutAlt /> Logout
          </button>
        </div>
      </div>

      <div className="dashboard-content single-card">
        <div className="dashboard-card central-join-card">
          <div className="card-header-icon">
            <i className="fas fa-door-open"></i>
          </div>
          <h2>Join a Session</h2>
          <p className="card-subtitle">Enter the secret code provided by your teacher to join the live room.</p>
          
          <div className="join-room-form">
            <div className="form-group">
              <label>Room Code</label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder="e.g., A1B2C3"
                maxLength="20"
                autoFocus
              />
            </div>
            
            <button 
              className={`btn btn-primary btn-lg full-width ${loading ? 'loading' : ''}`}
              onClick={handleJoinWithCode}
              disabled={loading || !roomCode.trim()}
            >
              {loading ? 'Joining...' : <><FaSignInAlt /> Join Now</>}
            </button>
          </div>
          
          <div className="privacy-note">
            <i className="fas fa-shield-alt"></i>
            <span>Private sessions ensure only invited students can access the code.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
import React, { useState } from 'react';
import { FaSignInAlt, FaArrowLeft, FaSignOutAlt, FaPlus } from 'react-icons/fa';
import './StudentDashboard.css';
import './TeacherDashboard.css'; // Reuse dashboard styling for layout consistency
import api from '../utils/api';

const StudentDashboard = ({ user, token, onJoinRoom, onBack, onLogout, showToast }) => {
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);

  // Room Creation States
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [newRoom, setNewRoom] = useState({
    name: '',
    description: ''
  });

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

  const handleCreateRoom = async () => {
    if (!newRoom.name.trim()) {
      showToast('Please enter a room name', 'warning');
      return;
    }

    setCreateLoading(true);
    try {
      const data = await api.post('/rooms/create', {
        name: newRoom.name,
        description: newRoom.description
      }, token);

      setShowCreateForm(false);
      onJoinRoom(data); // Go straight to the room
      showToast(`Room created successfully!`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreateLoading(false);
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

      <div className="dashboard-content">
        {/* Create Session Card */}
        <div className="dashboard-card central-join-card" style={{ marginBottom: '10px' }}>
          <div className="card-header-icon">
            <i className="fas fa-plus"></i>
          </div>
          <h2>Start a Coding Session</h2>
          <p className="card-subtitle">Create a private room and invite others to collaborate.</p>
          
          {!showCreateForm ? (
            <button 
              className="btn btn-primary btn-lg full-width"
              onClick={() => setShowCreateForm(true)}
              disabled={createLoading}
            >
              <FaPlus /> Create New Room
            </button>
          ) : (
            <div className="create-room-form" style={{ width: '100%', marginTop: '15px' }}>
              <div className="form-group">
                <label style={{ textAlign: 'left', display: 'block' }}>Room Name *</label>
                <input
                  type="text"
                  value={newRoom.name}
                  onChange={(e) => setNewRoom({...newRoom, name: e.target.value})}
                  placeholder="e.g., Advanced JavaScript Class"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label style={{ textAlign: 'left', display: 'block' }}>Description (Optional)</label>
                <textarea
                  value={newRoom.description}
                  onChange={(e) => setNewRoom({...newRoom, description: e.target.value})}
                  placeholder="What is this session about?"
                  rows="3"
                  style={{
                    width: '100%',
                    padding: '12px 15px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    color: 'white',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '15px' }}>
                <button 
                  className="btn btn-outline"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn btn-primary"
                  onClick={handleCreateRoom}
                  disabled={createLoading}
                >
                  {createLoading ? 'Creating...' : 'Create & Start'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Join Session Card */}
        <div className="dashboard-card central-join-card">
          <div className="card-header-icon">
            <i className="fas fa-door-open"></i>
          </div>
          <h2>Join a Session</h2>
          <p className="card-subtitle">Enter the secret code to join the live room.</p>
          
          <div className="join-room-form" style={{ width: '100%', marginTop: '15px' }}>
            <div className="form-group">
              <label style={{ textAlign: 'left', display: 'block' }}>Room Code</label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder="e.g., A1B2C3"
                maxLength="20"
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
          
          <div className="privacy-note" style={{ marginTop: '20px' }}>
            <i className="fas fa-shield-alt"></i>
            <span>Private sessions ensure only invited users can access the code.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
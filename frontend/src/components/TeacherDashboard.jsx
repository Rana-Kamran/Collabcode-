import React, { useState } from 'react';
import { FaPlus, FaSignOutAlt, FaArrowLeft } from 'react-icons/fa';
import './TeacherDashboard.css';
import api from '../utils/api';

const TeacherDashboard = ({ user, token, onJoinRoom, onBack, onLogout, showToast }) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newRoom, setNewRoom] = useState({
    name: '',
    description: ''
  });

  const handleCreateRoom = async () => {
    if (!newRoom.name.trim()) {
      showToast('Please enter a room name', 'warning');
      return;
    }

    setLoading(true);
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
      setLoading(false);
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="logo">
          <i className="fas fa-code"></i>
          <span>CollabCode - Teacher</span>
        </div>
        <div className="header-controls">
          <button className="btn btn-outline" onClick={onBack}>
            <FaArrowLeft /> Back
          </button>
          <div className="user-info">
            <div className="user-avatar">{user?.avatar || (user?.name || 'T').charAt(0).toUpperCase()}</div>
            <span className="user-name">{user?.name || 'Teacher'}</span>
          </div>
          <button className="btn btn-outline" onClick={onLogout}>
            <FaSignOutAlt /> Logout
          </button>
        </div>
      </div>

      <div className="dashboard-content single-card">
        <div className="dashboard-card central-join-card">
          <div className="card-header-icon">
            <i className="fas fa-chalkboard-teacher"></i>
          </div>
          <h2>Start a Coding Session</h2>
          <p className="card-subtitle">Create a private room and share the link with your students.</p>
          
          {!showCreateForm ? (
            <button 
              className="btn btn-primary btn-lg full-width"
              onClick={() => setShowCreateForm(true)}
              disabled={loading}
            >
              <FaPlus /> Create New Room
            </button>
          ) : (
            <div className="create-room-form">
              <div className="form-group">
                <label>Room Name *</label>
                <input
                  type="text"
                  value={newRoom.name}
                  onChange={(e) => setNewRoom({...newRoom, name: e.target.value})}
                  placeholder="e.g., Advanced JavaScript Class"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>Description (Optional)</label>
                <textarea
                  value={newRoom.description}
                  onChange={(e) => setNewRoom({...newRoom, description: e.target.value})}
                  placeholder="What is this session about?"
                  rows="3"
                />
              </div>

              <div className="form-actions">
                <button 
                  className="btn btn-outline"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn btn-primary"
                  onClick={handleCreateRoom}
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Create & Start'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
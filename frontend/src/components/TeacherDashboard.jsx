import React, { useState, useEffect } from 'react';
import { FaPlus, FaCog, FaPlay, FaSignOutAlt, FaArrowLeft } from 'react-icons/fa';
import './TeacherDashboard.css';
import api from '../utils/api';

const TeacherDashboard = ({ user, token, onJoinRoom, onBack, onLogout, showToast }) => {
  const [rooms, setRooms] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newRoom, setNewRoom] = useState({
    name: '',
    description: '',
    permissions: {
      editCode: true,
      viewOnly: false,
      useMicrophone: true,
      useCamera: true,
      shareScreen: true,
      downloadCode: true
    }
  });

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const data = await api.get('/rooms', token);
        // Backend returns all rooms, filter for teacher's own rooms if necessary 
        // OR rely on backend to filter based on token
        setRooms(data);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
    fetchRooms();
  }, [token]);

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

      setRooms([data, ...rooms]);
      setShowCreateForm(false);
      setNewRoom({
        name: '',
        description: '',
        permissions: {
          editCode: true,
          viewOnly: true,
          useMicrophone: true,
          useCamera: true,
          shareScreen: true,
          downloadCode: true
        }
      });
      
      showToast(`Room "${data.name}" created successfully! Code: ${data.roomId}`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleStartRoom = (room) => {
    onJoinRoom(room);
    showToast(`Starting room: ${room.name}`);
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
            <div className="user-avatar">{user?.avatar || 'T'}</div>
            <span className="user-name">{user?.name || 'Teacher'}</span>
          </div>
          <button className="btn btn-outline" onClick={onLogout}>
            <FaSignOutAlt /> Logout
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="dashboard-card">
          <h2>Create New Room</h2>
          
          {!showCreateForm ? (
            <button 
              className="btn btn-primary btn-lg"
              onClick={() => setShowCreateForm(true)}
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
                  placeholder="Enter room name"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={newRoom.description}
                  onChange={(e) => setNewRoom({...newRoom, description: e.target.value})}
                  placeholder="Enter room description"
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
                >
                  Create Room
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="dashboard-card">
          <h2>My Rooms</h2>
          {rooms.length === 0 ? (
            <p className="empty-message">No rooms created yet. Create your first room to get started!</p>
          ) : (
            <div className="room-grid">
              {rooms.map(room => (
                <div key={room.id} className="room-card">
                  <div className="room-card-header">
                    <h3>{room.name}</h3>
                    <span className="room-status">Active</span>
                  </div>
                  <div className="room-card-body">
                    <p>{room.description || 'No description'}</p>
                    <div className="room-details">
                      <p><strong>Code:</strong> {room.roomId || room.id}</p>
                      <p><strong>Students:</strong> {room.students}</p>
                    </div>
                  </div>
                  <div className="room-card-actions">
                    <button 
                      className="btn btn-primary"
                      onClick={() => handleStartRoom(room)}
                    >
                      <FaPlay /> Start
                    </button>
                    {/* Settings button removed */}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
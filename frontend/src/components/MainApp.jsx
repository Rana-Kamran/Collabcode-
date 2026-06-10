import React, { useState, useEffect, useRef } from 'react';
import { FaUsers, FaTerminal, FaVideo, FaRobot, FaUserPlus, FaStop, FaDownload, FaUpload, FaSignOutAlt } from 'react-icons/fa';
import io from 'socket.io-client';
import SidebarPanel from './SidebarPanel';
import Editor from './Editor';
import OutputPanel from './OutputPanel';
import VideoPanel from './VideoPanel';
import Chatbot from './Chatbot';
import InviteModal from './InviteModal';
import './MainApp.css';

const MainApp = ({ user, role, currentRoom, onLogout, onExitRoom, showToast }) => {
  const roomId = currentRoom?.roomId || currentRoom?.id;
  
  // Define helper variables at the top to avoid ReferenceErrors
  const isTeacher = role?.toLowerCase() === 'teacher' || role?.toLowerCase() === 'host';
  const isStudent = role?.toLowerCase() === 'student';

  // STABLE USER ID (Crucial for sync)
  const stableUserId = useRef(user?.id || user?._id || `temp-${Math.random().toString(36).substr(2, 9)}`);
  const userId = stableUserId.current;

  const [panels, setPanels] = useState({
    sidebar: true,
    output: true,
    video: true
  });
  const [showChatbot, setShowChatbot] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [roomData, setRoomData] = useState(null);
  
  // Default permissions: Teacher always has editCode, Student starts with true for all (host can then toggle)
  const [currentPermissions, setCurrentPermissions] = useState({
    editCode: isTeacher,
    useMicrophone: true,
    useCamera: true,
    downloadCode: true
  });
  
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

  // Socket connection 
  useEffect(() => {
    if (!roomId) return;

    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://collabcode-s40g.onrender.com';
    const newSocket = io(BACKEND_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      showToast('Connected to collaboration server');
      
      newSocket.emit('join-room', {
        roomId: roomId,
        user: {
          id: userId,
          name: user?.name || user?.username || 'User',
          role: role,
          avatar: (user?.name || user?.username || 'U').charAt(0).toUpperCase()
        }
      });
    });

    newSocket.on('permission-changed', ({ permission, value }) => {
      setCurrentPermissions(prev => ({ ...prev, [permission]: value }));
      const msg = value ? `Enabled` : `Disabled`;
      showToast(`${permission.replace('use', '')} has been ${msg} by the teacher`, 'info');
    });

    newSocket.on('kicked', () => {
      showToast('You have been removed from the room', 'error');
      setTimeout(() => onExitRoom(), 2000);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      showToast('Disconnected from server', 'error');
    });

    newSocket.on('room-data', (data) => {
      setParticipants(data.participants || []);
      setRoomData(data);
      
      // Sync local permissions with data from server
      const localUser = data.participants?.find(p => String(p.id) === String(userId));
      if (localUser && localUser.permissions) {
        setCurrentPermissions(localUser.permissions);
      }
    });

    newSocket.on('participants-update', (data) => {
      setParticipants(data.participants);
      
      // Also sync local permissions from the list
      const localUser = data.participants?.find(p => String(p.id) === String(userId));
      if (localUser && localUser.permissions) {
        setCurrentPermissions(localUser.permissions);
      }
    });

    newSocket.on('user-joined', (data) => {
      setParticipants(prev => {
        const filtered = prev.filter(p => String(p.id) !== String(data.user.id));
        return [...filtered, data.user];
      });
      showToast(`${data.user.name} joined the room`);
    });

    newSocket.on('user-left', (data) => {
      setParticipants(prev => prev.filter(p => String(p.id) !== String(data.userId)));
      showToast('A user left the room');
    });

    newSocket.on('room-ended', () => {
      showToast('Room has been ended by the host', 'warning');
      setTimeout(() => onExitRoom(), 2000);
    });

    setSocket(newSocket);

    return () => {
      if (newSocket) {
        newSocket.emit('leave-room', { roomId: roomId, userId: userId });
        newSocket.close();
      }
    };
  }, [roomId, user, role]);

  const handleUpdatePermission = (targetUserId, permission, value) => {
    // 1. Optimistic Update (Immediate visual feedback)
    setParticipants(prev => prev.map(p => {
      if (String(p.id) === String(targetUserId)) {
        return {
          ...p,
          permissions: {
            ...p.permissions,
            [permission]: value
          }
        };
      }
      return p;
    }));

    // 2. Emit to server
    if (socket && isConnected && roomId) {
      socket.emit('update-permission', {
        roomId: roomId,
        targetUserId: targetUserId,
        permission: permission,
        value: value
      });
    }
  };

  const togglePanel = (panel) => {
    setPanels(prev => ({ ...prev, [panel]: !prev[panel] }));
  };

  const handleEndRoom = () => {
    if (!isTeacher) return;
    if (window.confirm('Are you sure you want to end this room?')) {
      if (socket && isConnected) {
        socket.emit('end-room', { roomId: roomId });
      }
      onExitRoom();
    }
  };

  const handleDownloadCode = () => {
    const currentCode = editorRef.current?.getValue();
    if (!currentCode) return;
    
    const blob = new Blob([currentCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `collabcode_${roomId}.js`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (event) => {
    if (!isTeacher) return;
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const uploadedCode = e.target.result;
      const currentLang = editorRef.current?.getLanguage() || 'javascript';
      if (editorRef.current) {
        editorRef.current.setValue(uploadedCode);
      }
      if (socket && socket.connected && roomId) {
        socket.emit('code-change', {
          roomId: roomId,
          code: uploadedCode,
          userId: userId,
          language: currentLang
        });
      }
    };
    reader.readAsText(file);
  };

  const handleLeaveRoom = () => {
    if (window.confirm('Are you sure you want to leave?')) {
      onExitRoom();
    }
  };

  const onlineCount = participants.filter(p => p.isOnline !== false).length;

  return (
    <div className="main-app">
      <header className="app-header">
        <div className="logo">
          <i className="fas fa-code"></i>
          <span>CollabCode {currentRoom ? `- ${currentRoom.name}` : ''}</span>
          {isStudent && <span className="role-badge student">👨‍🎓 Student</span>}
          {isTeacher && <span className="role-badge teacher">👨‍🏫 Teacher</span>}
        </div>
        
        <div className="room-id-display">
          ID: <strong>{roomId}</strong>
        </div>

        <div className="header-controls">
          <div className="connection-status">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
            <span>{isConnected ? 'Live' : 'Offline'}</span>
          </div>

          <div className="panel-controls">
            <button className={`panel-toggle ${panels.sidebar ? 'active' : ''}`} onClick={() => togglePanel('sidebar')}><FaUsers /></button>
            <button className={`panel-toggle ${panels.output ? 'active' : ''}`} onClick={() => togglePanel('output')}><FaTerminal /></button>
            <button className={`panel-toggle ${panels.video ? 'active' : ''}`} onClick={() => togglePanel('video')}><FaVideo /></button>
            <button className={`panel-toggle ${showChatbot ? 'active' : ''}`} onClick={() => setShowChatbot(!showChatbot)}><FaRobot /></button>
          </div>

          {isTeacher && (
            <>
              <button className="btn btn-outline" onClick={() => setShowInviteModal(true)}><FaUserPlus /> Invite</button>
              <button className="btn btn-danger" onClick={handleEndRoom}><FaStop /> End Room</button>
              <button className="btn btn-outline" onClick={() => fileInputRef.current?.click()}><FaUpload /> Upload</button>
            </>
          )}

          {isStudent && (
            <button className="btn btn-outline" onClick={handleLeaveRoom}><FaSignOutAlt /> Leave</button>
          )}

          <div className="user-info">
            <div className="user-avatar">{user?.avatar || (isTeacher ? 'T' : 'S')}</div>
            <span className="user-name">{user?.name || user?.username || 'User'}</span>
            <div className="user-dropdown">
              <div className="dropdown-item" onClick={onLogout}>Logout</div>
            </div>
          </div>
        </div>
      </header>

      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} />

      <div className="main-container">
        {panels.sidebar && (
          <SidebarPanel 
            participants={participants}
            role={role}
            showToast={showToast}
            socket={socket}
            roomId={roomId}
            user={{ ...user, id: userId }}
            isTeacher={isTeacher}
            roomPermissions={currentPermissions}
            onUpdatePermission={handleUpdatePermission}
          />
        )}

        <Editor 
          ref={editorRef}
          user={{ ...user, id: userId }}
          role={role}
          showToast={showToast}
          socket={socket}
          roomId={roomId}
          isTeacher={isTeacher}
          roomPermissions={currentPermissions}
          roomData={roomData}
        />

        {panels.output && <OutputPanel showToast={showToast} />}

        {panels.video && (
          <VideoPanel 
            participants={participants}
            role={role}
            showToast={showToast}
            socket={socket}
            roomId={roomId}
            userId={userId}
            currentUser={{ ...user, id: userId }}
            isTeacher={isTeacher}
            roomPermissions={currentPermissions}
            className={isStudent ? 'student-view' : ''}
          />
        )}
      </div>

      <div className="app-footer">
        <div className="connection-status">
          <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
          <span>{isConnected ? 'Connected' : 'Connecting...'}</span>
        </div>
        <div className="copyright">
          {isTeacher ? '© CollabCode - Teacher Mode' : `© CollabCode - Student Mode ${!currentPermissions.editCode ? '(Read Only)' : ''}`}
        </div>
      </div>

      {showChatbot && <Chatbot onClose={() => setShowChatbot(false)} />}
      {showInviteModal && isTeacher && (
        <InviteModal room={currentRoom} onClose={() => setShowInviteModal(false)} showToast={showToast} />
      )}
    </div>
  );
};

export default MainApp;

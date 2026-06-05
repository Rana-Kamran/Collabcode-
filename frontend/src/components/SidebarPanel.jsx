// sidebar panel for participants list and chat

import React, { useState, useEffect, useRef } from 'react';
import { 
  FaWindowMinimize, 
  FaTimes, 
  FaPaperPlane, 
  FaUsers, 
  FaComment, 
  FaMicrophone, 
  FaMicrophoneSlash,
  FaVideo,
  FaVideoSlash,
  FaCode,
  FaDesktop,
  FaUserMinus,
  FaCheck,
  FaVolumeUp,
  FaVolumeMute,
  FaCrown,
  FaCircle,
  FaChevronDown,
  FaRegSmile
} from 'react-icons/fa';
import './SidebarPanel.css';

const SidebarPanel = ({ 
  role, 
  showToast, 
  socket,
  roomId,
  user,
  participants,
  isTeacher,
  roomPermissions,
  onUpdatePermission
}) => {
  
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState('participants');
  const [messages, setMessages] = useState([
    { id: 1, sender: 'System', content: 'Welcome to the chat!', time: '', isOwn: false }
  ]);
  const [newMessage, setNewMessage] = useState('');
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [panelWidth, setPanelWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  
  const messagesEndRef = useRef(null);
  const panelRef = useRef(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const emojiPickerRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const isHost = role === 'host' || role === 'teacher' || isTeacher;

  // Socket listeners for real-time chat
  useEffect(() => {
    if (!socket) return;

    socket.on('new-message', (data) => {
      setMessages(prev => [...prev, {
        id: prev.length + 1,
        sender: data.sender,
        senderId: data.senderId,
        content: data.message,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isOwn: String(data.senderId) === String(user?.id)
      }]);
    });

    socket.on('user-typing', (data) => {
      if (data.userId !== socket.id) {
        setTypingUsers(prev => {
          if (data.isTyping) {
            if (!prev.includes(data.userName)) {
              return [...prev, data.userName];
            }
          } else {
            return prev.filter(name => name !== data.userName);
          }
          return prev;
        });
        
        setTimeout(() => {
          setTypingUsers(prev => prev.filter(name => name !== data.userName));
        }, 2000);
      }
    });

    // Explicitly removed participants-update listener here to avoid prop-state conflicts.
    // MainApp.jsx handles the global participants state which flows down as a prop.

    return () => {
      socket.off('new-message');
      socket.off('user-typing');
    };
  }, [socket]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleTyping = () => {
    if (socket && roomId) {
      socket.emit('typing-start', {
        roomId: roomId,
        userId: socket.id,
        userName: user?.name || 'User'
      });
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing-stop', {
          roomId: roomId,
          userId: socket.id
        });
      }, 1000);
    }
  };

  const sendMessage = () => {
    if (!newMessage.trim()) return;
    
    const actualName = user?.name || user?.username || 'User';
    const senderId = user?.id || user?._id;
    
    const message = {
      id: messages.length + 1,
      sender: actualName,
      senderId: senderId,
      content: newMessage,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isOwn: true
    };
    
    setMessages([...messages, message]);
    
    if (socket && roomId) {
      socket.emit('send-message', {
        roomId: roomId,
        message: newMessage,
        sender: actualName,
        senderId: senderId,
        userId: socket.id
      });
    }
    
    setNewMessage('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    } else {
      handleTyping();
    }
  };

  const handleInputChange = (e) => {
    setNewMessage(e.target.value);
    if (e.target.value.trim()) {
      handleTyping();
    }
  };

  // Click outside for emoji picker
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Click outside for permission dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdownId !== null) {
        const dropdown = document.querySelector('.permission-dropdown');
        const trigger = event.target.closest('.permission-btn');
        if (dropdown && !dropdown.contains(event.target) && !trigger) {
          setOpenDropdownId(null);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdownId]);

  const startResizing = (e) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = panelRef.current?.offsetWidth || 280;
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResizing);
  };

  const handleResize = (e) => {
    if (isResizing && panelRef.current) {
      const deltaX = startXRef.current - e.clientX;
      const newWidth = Math.min(380, Math.max(240, startWidthRef.current + deltaX));
      setPanelWidth(newWidth);
      panelRef.current.style.width = `${newWidth}px`;
    }
  };

  const stopResizing = () => {
    setIsResizing(false);
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResizing);
  };

  const insertEmoji = (emoji) => {
    setNewMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
    handleTyping();
  };

  const togglePermission = (participantId, permissionType) => {
    if (!isHost) return;
    
    const participant = participants.find(p => String(p.id) === String(participantId));
    if (!participant) return;

    const currentValue = participant.permissions?.[permissionType];
    const newValue = !currentValue;

    // Use the optimistic update handler from MainApp
    if (onUpdatePermission) {
      onUpdatePermission(participantId, permissionType, newValue);
    }
  };

  const muteAll = () => {
    if (!isHost) return;
    if (socket && roomId) {
      socket.emit('mute-all', { roomId: roomId });
    }
    showToast?.('All participants muted', 'warning');
  };

  const unmuteAll = () => {
    if (!isHost) return;
    if (socket && roomId) {
      socket.emit('unmute-all', { roomId: roomId });
    }
    showToast?.('All participants unmuted', 'success');
  };

  const removeParticipant = (participantId) => {
    if (!isHost) return;
    if (socket && roomId) {
      socket.emit('remove-participant', { roomId: roomId, userId: participantId });
    }
    setOpenDropdownId(null);
    showToast?.('Participant removed', 'info');
  };

  const getActiveCount = (permissions) => {
    if (!permissions) return 0;
    return Object.values(permissions).filter(v => v === true).length;
  };

  const onlineCount = participants?.filter(p => p.isOnline !== false).length || 0;

  return (
    <div 
      className={`sidebar-panel ${isMinimized ? 'minimized' : ''}`} 
      ref={panelRef}
      style={{ width: !isMinimized ? panelWidth : 56 }}
    >
      {!isMinimized && (
        <div 
          className={`resize-handle ${isResizing ? 'resizing' : ''}`}
          onMouseDown={startResizing}
        />
      )}
      
      <div className="panel-header">
        <h3><FaUsers /> Collaboration</h3>
        <div className="panel-controls">
          <button className="panel-btn" onClick={() => setIsMinimized(true)}>
            <FaWindowMinimize />
          </button>
          <button className="panel-btn">
            <FaTimes />
          </button>
        </div>
      </div>

      {!isMinimized ? (
        <>
          <div className="panel-tabs">
            <div 
              className={`tab ${activeTab === 'participants' ? 'active' : ''}`}
              onClick={() => setActiveTab('participants')}
            >
              <FaUsers /> Participants <span className="count">{onlineCount}</span>
            </div>
            <div 
              className={`tab ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              <FaComment /> Chat
              {messages.filter(m => !m.isOwn).length > 0 && (
                <span className="unread-badge">{messages.filter(m => !m.isOwn).length}</span>
              )}
            </div>
          </div>

          <div className="tab-content">
            {activeTab === 'participants' && (
              <div className="participants-scroll">
                {/* Host controls section */}
                {isHost && (
                  <div className="section-header">
                    <h4>🎮 Host Controls</h4>
                    <div className="action-buttons">
                      <button className="action-btn" onClick={muteAll} title="Mute All">
                        <FaVolumeMute size={12} /> Mute All
                      </button>
                      <button className="action-btn" onClick={unmuteAll} title="Unmute All">
                        <FaVolumeUp size={12} /> Unmute All
                      </button>
                    </div>
                  </div>
                )}
                
                <div className="participants-list">
                  {participants?.map(p => (
                    <div key={p.id} className="participant-item">
                      <div className="avatar">
                        {p.avatar || p.name?.charAt(0).toUpperCase() || 'U'}
                        <div className={`status-dot ${p.isOnline !== false ? 'online' : 'offline'}`} />
                      </div>
                      <div className="participant-info">
                        <div className="participant-name">
                          {p.name}
                          {p.role === 'host' || p.role === 'teacher' ? (
                            <span className="host-badge"><FaCrown size={8} /> {p.role === 'teacher' ? 'Teacher' : 'Host'}</span>
                          ) : (
                            <span className="student-badge">👨‍🎓 Student</span>
                          )}
                          {p.id === user?.id && <span className="you-badge">(You)</span>}
                        </div>
                        <div className="participant-status">
                          <FaCircle size={5} className={p.isOnline !== false ? 'online' : 'offline'} />
                          {p.isOnline !== false ? 'Active' : 'Offline'}
                          {p.isTyping && <span className="typing-status"> typing...</span>}
                        </div>
                        
                        {/* Show permission badges for students */}
                        {p.role !== 'teacher' && p.role !== 'host' && p.id !== user?.id && p.permissions && (
                          <div className="participant-permissions">
                            <span className="perm-badge" title={p.permissions.editCode ? 'Can Edit Code' : 'View Only'}>
                              {p.permissions.editCode ? '✏️' : '👁️'}
                            </span>
                            <span className="perm-badge" title={p.permissions.useMicrophone ? 'Mic Enabled' : 'Mic Disabled'}>
                              {p.permissions.useMicrophone ? '🎤' : '🔇'}
                            </span>
                            <span className="perm-badge" title={p.permissions.useCamera ? 'Camera Enabled' : 'Camera Disabled'}>
                              {p.permissions.useCamera ? '📹' : '🚫'}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {/* Host permission button - only for non-host participants */}
                      {isHost && p.role !== 'teacher' && p.role !== 'host' && (
                        <button 
                          className="permission-btn"
                          onClick={() => setOpenDropdownId(openDropdownId === p.id ? null : p.id)}
                          title="Manage Permissions"
                        >
                          🎮 {getActiveCount(p.permissions || {})}/3 <FaChevronDown size={8} />
                        </button>
                      )}
                      
                      {/* Permission Dropdown for Host */}
                      {openDropdownId === p.id && isHost && p.role !== 'teacher' && p.role !== 'host' && (
                        <div className="permission-dropdown">
                          <div className="dropdown-header">
                            <span>⚙️ Manage {p.name}'s Permissions</span>
                            <button onClick={() => setOpenDropdownId(null)}><FaTimes size={10} /></button>
                          </div>
                          <div className="permission-row" onClick={(e) => { e.stopPropagation(); togglePermission(p.id, 'editCode'); }}>
                            <div className="permission-info">
                              <FaCode />
                              <span>Code Editor</span>
                            </div>
                            <div className="permission-status">
                              <label className="switch">
                                <input 
                                  type="checkbox" 
                                  checked={p.permissions?.editCode} 
                                  readOnly 
                                />
                                <span className="slider"></span>
                              </label>
                            </div>
                          </div>
                          <div className="permission-row" onClick={(e) => { e.stopPropagation(); togglePermission(p.id, 'useMicrophone'); }}>
                            <div className="permission-info">
                              {p.permissions?.useMicrophone ? <FaMicrophone /> : <FaMicrophoneSlash />}
                              <span>Microphone</span>
                            </div>
                            <div className="permission-status">
                              <label className="switch">
                                <input 
                                  type="checkbox" 
                                  checked={p.permissions?.useMicrophone} 
                                  readOnly 
                                />
                                <span className="slider"></span>
                              </label>
                            </div>
                          </div>
                          <div className="permission-row" onClick={(e) => { e.stopPropagation(); togglePermission(p.id, 'useCamera'); }}>
                            <div className="permission-info">
                              {p.permissions?.useCamera ? <FaVideo /> : <FaVideoSlash />}
                              <span>Camera</span>
                            </div>
                            <div className="permission-status">
                              <label className="switch">
                                <input 
                                  type="checkbox" 
                                  checked={p.permissions?.useCamera} 
                                  readOnly 
                                />
                                <span className="slider"></span>
                              </label>
                            </div>
                          </div>
                          <div className="dropdown-divider" />
                          <div className="remove-action" onClick={() => removeParticipant(p.id)}>
                            <span>🚫 Remove Participant</span>
                            <FaUserMinus size={12} />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="chat-panel">
                <div className="chat-messages">
                  {messages.map(msg => (
                    <div key={msg.id} className={`message ${msg.isOwn ? 'sent' : 'received'}`}>
                      <div className="message-sender">{msg.isOwn ? 'You' : msg.sender}</div>
                      <div className="message-content">{msg.content}</div>
                      <div className="message-time">{msg.time}</div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                
                {typingUsers.length > 0 && (
                  <div className="typing-indicator">
                    {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                  </div>
                )}
                
                <div className="chat-input">
                  <div className="input-wrapper">
                    <button className="emoji-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
                      <FaRegSmile />
                    </button>
                    {showEmojiPicker && (
                      <div className="emoji-picker" ref={emojiPickerRef}>
                        {['😀','😂','😊','😍','🎉','👍','❤️','🔥','🚀','✨','💡','🎨','💻','📚','🤔','😎'].map(emoji => (
                          <button key={emoji} onClick={() => insertEmoji(emoji)}>{emoji}</button>
                        ))}
                      </div>
                    )}
                    <input
                      type="text"
                      placeholder="Type a message..."
                      value={newMessage}
                      onChange={handleInputChange}
                      onKeyPress={handleKeyPress}
                    />
                    <button 
                      className={`send-btn ${newMessage.trim() ? 'active' : ''}`} 
                      onClick={sendMessage}
                      disabled={!newMessage.trim()}
                    >
                      <FaPaperPlane />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="minimized-icons">
          <div className="minimized-icon" onClick={() => { setIsMinimized(false); setActiveTab('participants'); }}>
            <FaUsers />
            <span>{onlineCount}</span>
          </div>
          <div className="minimized-icon" onClick={() => { setIsMinimized(false); setActiveTab('chat'); }}>
            <FaComment />
            <span>Chat</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SidebarPanel;
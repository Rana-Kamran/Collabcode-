import React, { useState, useEffect, useRef } from 'react';
import { 
  FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash, 
  FaPhoneSlash, FaWindowMinimize, FaTimes, FaExclamationTriangle 
} from 'react-icons/fa';
import './VideoPanel.css';

const VideoPanel = ({ participants, role, showToast, socket, roomId, currentUser, isTeacher, roomPermissions }) => {
  
  const [isMinimized, setIsMinimized] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [mediaError, setMediaError] = useState(null);
  
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  
  const peerConnections = useRef({});
  
  // Use a reliable unique ID
  const userId = currentUser?.id || currentUser?._id;
  const isHost = isTeacher || role === 'Teacher' || role === 'teacher';

  const canUseMic = isHost || roomPermissions?.useMicrophone !== false;
  const canUseCamera = isHost || roomPermissions?.useCamera !== false;

  // ========== INITIALIZE LOCAL MEDIA ==========
  const initMedia = async () => {
    // 1. Explicitly stop any existing streams to release the hardware lock
    if (localStream) {
      console.log('Stopping existing stream tracks to release device...');
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }

    setMediaError(null);
    
    try {
      console.log('Requesting Media. Camera:', canUseCamera, 'Mic:', canUseMic);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: canUseCamera ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
        audio: canUseMic
      });
      
      setLocalStream(stream);
      showToast('Media devices activated');
    } catch (err) {
      console.error('Media Access Error:', err);
      
      let friendlyError = 'Camera access failed';
      if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        friendlyError = 'Camera is already in use by another app (Zoom, Skype, or another tab). Please close them and click Retry.';
      } else if (err.name === 'NotAllowedError') {
        friendlyError = 'Permission Denied. Please allow camera access in your browser settings.';
      }

      setMediaError(friendlyError);
      showToast(friendlyError, 'error');
    }
  };

  useEffect(() => {
    initMedia();
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
      }
      Object.values(peerConnections.current).forEach(pc => pc.close());
    };
  }, []);

  // ========== WEBRTC SIGNALING ==========
  useEffect(() => {
    if (!socket || !roomId || !userId) return;

    socket.on('video-offer', async ({ offer, fromId }) => {
      console.log('Signaling: Received offer from', fromId);
      try {
        const pc = getOrCreatePeerConnection(fromId);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('video-answer', { roomId, answer, targetId: fromId });
      } catch (e) {
        console.error('Error handling offer:', e);
      }
    });

    socket.on('video-answer', async ({ answer, fromId }) => {
      console.log('Signaling: Received answer from', fromId);
      try {
        const pc = peerConnections.current[fromId];
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      } catch (e) {
        console.error('Error handling answer:', e);
      }
    });

    socket.on('video-ice-candidate', async ({ candidate, fromId }) => {
      try {
        const pc = peerConnections.current[fromId];
        if (pc && candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (e) {
        console.error('Error adding ICE candidate:', e);
      }
    });

    socket.on('user-left-video', ({ userId: leftId }) => {
      console.log('User left video:', leftId);
      if (peerConnections.current[leftId]) {
        peerConnections.current[leftId].close();
        delete peerConnections.current[leftId];
      }
      setRemoteStreams(prev => {
        const next = { ...prev };
        delete next[leftId];
        return next;
      });
    });

    return () => {
      socket.off('video-offer');
      socket.off('video-answer');
      socket.off('video-ice-candidate');
      socket.off('user-left-video');
    };
  }, [socket, roomId, userId, localStream]);

  const getOrCreatePeerConnection = (targetId) => {
    if (peerConnections.current[targetId]) return peerConnections.current[targetId];

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnections.current[targetId] = pc;

    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('video-ice-candidate', { roomId, candidate: e.candidate, targetId });
      }
    };

    pc.ontrack = (e) => {
      console.log('WebRTC: Received remote stream for', targetId);
      setRemoteStreams(prev => ({ ...prev, [targetId]: e.streams[0] }));
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${targetId}: ${pc.connectionState}`);
    };

    return pc;
  };

  // Connection trigger: Use a stable condition to avoid glare
  useEffect(() => {
    if (!localStream || !socket || !participants || !userId) return;

    participants.forEach(p => {
      const pId = p.id || p._id;
      if (pId && pId !== userId && !peerConnections.current[pId]) {
        // Deterministic: Peer with lexicographically "larger" ID initiates
        if (String(userId) > String(pId)) {
          console.log('WebRTC: Initiating connection to', pId);
          const pc = getOrCreatePeerConnection(pId);
          pc.createOffer().then(offer => {
            pc.setLocalDescription(offer);
            socket.emit('video-offer', { roomId, offer, targetId: pId });
          });
        }
      }
    });
  }, [participants, localStream, userId]);

  const allVideoFeeds = [
    { id: userId, name: 'You (Local)', stream: localStream, isLocal: true, isOff: isVideoOff || !!mediaError },
    ...Object.entries(remoteStreams).map(([id, stream]) => ({
      id,
      name: participants.find(p => (p.id || p._id) === id)?.username || 'Remote User',
      stream,
      isLocal: false,
      isOff: false
    }))
  ];

  return (
    <div className={`video-panel ${isMinimized ? 'minimized' : ''}`}>
      <div className="panel-header">
        <h3><FaVideo /> Video Session</h3>
        <div className="panel-controls">
          <button className="panel-btn" onClick={() => setIsMinimized(!isMinimized)}><FaWindowMinimize /></button>
          <button className="panel-btn" onClick={() => window.location.reload()}><FaTimes /></button>
        </div>
      </div>

      {!isMinimized && (
        <div className="panel-content">
          <div className="video-grid">
            {allVideoFeeds.map(feed => (
              <div key={feed.id} className="video-feed">
                <video 
                  autoPlay 
                  playsInline 
                  muted={feed.isLocal}
                  ref={el => { if (el && feed.stream) el.srcObject = feed.stream; }}
                  className={feed.isOff ? 'hidden' : ''}
                />
                {feed.isOff && (
                  <div className="no-video">
                    {mediaError ? <FaExclamationTriangle style={{color: '#e74c3c'}} /> : <FaVideoSlash />}
                    <span style={{fontSize: '10px', textAlign: 'center', padding: '0 5px'}}>
                      {mediaError ? `Error: ${mediaError}` : 'Camera Off'}
                    </span>
                    {mediaError && (
                      <button className="btn btn-outline btn-sm" style={{marginTop: '5px', fontSize: '10px'}} onClick={initMedia}>
                        Retry
                      </button>
                    )}
                  </div>
                )}
                <div className="participant-label">{feed.name}</div>
              </div>
            ))}
            
            {allVideoFeeds.length === 1 && !mediaError && (
              <div className="video-feed empty">
                <div className="no-video">
                  <span>Waiting for others...</span>
                </div>
              </div>
            )}
          </div>
          
          <div className="video-controls">
            <button className={`control-btn ${isAudioMuted ? 'muted' : ''}`} onClick={() => {
              if (localStream) {
                const t = localStream.getAudioTracks()[0];
                if (t) { t.enabled = !t.enabled; setIsAudioMuted(!t.enabled); }
              }
            }}>
              {isAudioMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
            </button>
            <button className={`control-btn ${isVideoOff ? 'off' : ''}`} onClick={() => {
              if (localStream) {
                const t = localStream.getVideoTracks()[0];
                if (t) { t.enabled = !t.enabled; setIsVideoOff(!t.enabled); }
              }
            }}>
              {isVideoOff ? <FaVideoSlash /> : <FaVideo />}
            </button>
            <button className="control-btn leave-btn" onClick={() => window.location.reload()}><FaPhoneSlash /></button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPanel;

import React, { useState, useEffect, useRef } from 'react';
import { 
  FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash, 
  FaPhoneSlash, FaWindowMinimize, FaTimes, FaExclamationTriangle 
} from 'react-icons/fa';
import './VideoPanel.css';

const VideoPanel = ({ participants, role, showToast, socket, roomId, userId, currentUser, isTeacher, roomPermissions }) => {
  
  const [isMinimized, setIsMinimized] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [mediaError, setMediaError] = useState(null);
  
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  
  const peerConnections = useRef({});
  const isHost = isTeacher || role?.toLowerCase() === 'teacher' || role?.toLowerCase() === 'host';

  const canUseMic = isHost || roomPermissions?.useMicrophone !== false;
  const canUseCamera = isHost || roomPermissions?.useCamera !== false;

  // ========== INITIALIZE LOCAL MEDIA ==========
  const initMedia = async () => {
    const needsVideo = canUseCamera;
    const needsAudio = canUseMic;

    if (!needsVideo && !needsAudio) {
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        setLocalStream(null);
      }
      return;
    }

    try {
      let stream = localStream;
      
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: needsVideo ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
          audio: needsAudio
        });
        setLocalStream(stream);
      } else {
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];

        if (needsVideo && (!videoTrack || videoTrack.readyState === 'ended')) {
          const vStream = await navigator.mediaDevices.getUserMedia({ video: true });
          stream.addTrack(vStream.getVideoTracks()[0]);
        }

        if (needsAudio && (!audioTrack || audioTrack.readyState === 'ended')) {
          const aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.addTrack(aStream.getAudioTracks()[0]);
        }

        stream.getVideoTracks().forEach(t => t.enabled = needsVideo && !isVideoOff);
        stream.getAudioTracks().forEach(t => t.enabled = needsAudio && !isAudioMuted);
      }
    } catch (err) {
      console.error('Media Access Error:', err);
      setMediaError(err.name === 'NotAllowedError' ? 'Permission Denied' : 'Media error');
    }
  };

  useEffect(() => {
    initMedia();
  }, [canUseMic, canUseCamera]); 

  // Aggressive track injection & sync
  useEffect(() => {
    if (!localStream) return;
    
    localStream.getVideoTracks().forEach(t => t.enabled = canUseCamera && !isVideoOff);
    localStream.getAudioTracks().forEach(t => t.enabled = canUseMic && !isAudioMuted);

    Object.entries(peerConnections.current).forEach(([targetId, pc]) => {
      const senders = pc.getSenders();
      localStream.getTracks().forEach(track => {
        const sender = senders.find(s => s.track?.kind === track.kind);
        if (sender) {
          if (sender.track !== track) sender.replaceTrack(track);
        } else {
          pc.addTrack(track, localStream);
          if (pc.signalingState === 'stable') {
            pc.createOffer().then(offer => pc.setLocalDescription(offer))
              .then(() => socket.emit('video-offer', { roomId, offer: pc.localDescription, targetId }));
          }
        }
      });
    });
  }, [localStream, isVideoOff, isAudioMuted, canUseMic, canUseCamera]);

  useEffect(() => {
    return () => {
      if (localStream) localStream.getTracks().forEach(t => t.stop());
      Object.values(peerConnections.current).forEach(pc => pc.close());
    };
  }, []);

  // ========== WEBRTC SIGNALING ==========
  useEffect(() => {
    if (!socket || !roomId || !userId) return;

    socket.on('video-offer', async ({ offer, fromId }) => {
      try {
        const pc = getOrCreatePeerConnection(fromId);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        if (pc.signalingState === 'have-remote-offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('video-answer', { roomId, answer, targetId: fromId });
        }
      } catch (e) {
        console.error('WebRTC offer error', e);
      }
    });

    socket.on('video-answer', async ({ answer, fromId }) => {
      const pc = peerConnections.current[fromId];
      if (pc && pc.signalingState === 'have-local-offer') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (e) {
          console.error('WebRTC answer error', e);
        }
      }
    });

    socket.on('video-ice-candidate', async ({ candidate, fromId }) => {
      const pc = peerConnections.current[fromId];
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('ICE error', e);
        }
      }
    });

    socket.on('participants-update', ({ participants: newParticipants }) => {
      const activeIds = newParticipants.map(p => String(p.id));
      setRemoteStreams(prev => {
        const updated = { ...prev };
        let changed = false;
        Object.keys(updated).forEach(id => {
          if (!activeIds.includes(String(id))) {
            delete updated[id];
            if (peerConnections.current[id]) {
              peerConnections.current[id].close();
              delete peerConnections.current[id];
            }
            changed = true;
          }
        });
        return changed ? updated : prev;
      });
    });

    socket.on('user-joined', ({ user: newUser }) => {
      const pId = String(newUser.id);
      if (pId !== String(userId)) {
        console.log('WebRTC: Resetting connection for re-joined user:', pId);
        if (peerConnections.current[pId]) {
          peerConnections.current[pId].close();
          delete peerConnections.current[pId];
        }
        setRemoteStreams(prev => {
          if (prev[pId]) {
            const next = { ...prev };
            delete next[pId];
            return next;
          }
          return prev;
        });
        
        // INSTANT RE-INITIATION
        // If the teacher re-joined, students should initiate immediately to reduce delay
        if (newUser.role?.toLowerCase() === 'teacher' || newUser.role?.toLowerCase() === 'host') {
           const pc = getOrCreatePeerConnection(pId);
           pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => socket.emit('video-offer', { roomId, offer: pc.localDescription, targetId: pId }));
        }
      }
    });

    return () => {
      socket.off('video-offer');
      socket.off('video-answer');
      socket.off('video-ice-candidate');
      socket.off('participants-update');
      socket.off('user-joined');
    };
  }, [socket, roomId, userId, localStream]); // localStream added to dep list for reactive cleanup

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
      console.log('WebRTC: Remote track received from', targetId);
      setRemoteStreams(prev => ({ ...prev, [targetId]: e.streams[0] }));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        setRemoteStreams(prev => {
          if (prev[targetId]) {
            const next = { ...prev };
            delete next[targetId];
            return next;
          }
          return prev;
        });
      }
    };

    return pc;
  };

  // Connection Watcher
  useEffect(() => {
    if (!socket || !participants || !userId) return;

    participants.forEach(p => {
      const pId = String(p.id);
      if (pId && pId !== String(userId) && !peerConnections.current[pId]) {
        // Teacher always initiates OR students initiate to teacher
        const isTargetTeacher = p.role?.toLowerCase() === 'teacher' || p.role?.toLowerCase() === 'host';
        const shouldInitiate = isHost || isTargetTeacher || String(userId) > String(pId);
        
        if (shouldInitiate) {
          console.log('WebRTC: Proactive initiation to', pId);
          const pc = getOrCreatePeerConnection(pId);
          if (pc.signalingState === 'stable') {
            pc.createOffer()
              .then(offer => pc.setLocalDescription(offer))
              .then(() => socket.emit('video-offer', { roomId, offer: pc.localDescription, targetId: pId }))
              .catch(e => console.error('Proactive signaling error', e));
          }
        }
      }
    });
  }, [participants, userId, socket]);

  const allVideoFeeds = [
    { 
      id: userId, 
      name: 'You (Local)', 
      stream: localStream, 
      isLocal: true, 
      isOff: isVideoOff || !canUseCamera || !!mediaError,
      isMuted: isAudioMuted || !canUseMic
    },
    ...Object.entries(remoteStreams).map(([id, stream]) => {
      const participant = participants?.find(p => String(p.id) === String(id));
      if (!participant) return null;

      const remoteCameraOff = participant?.permissions?.useCamera === false;
      const remoteMicOff = participant?.permissions?.useMicrophone === false;

      return {
        id,
        name: participant?.name || participant?.username || 'User',
        stream,
        isLocal: false,
        isOff: remoteCameraOff,
        isMuted: remoteMicOff
      };
    }).filter(Boolean)
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
                  muted={feed.isLocal || feed.isMuted}
                  ref={el => { 
                    if (el && feed.stream && el.srcObject !== feed.stream) {
                      el.srcObject = feed.stream; 
                    }
                  }}
                  className={feed.isOff ? 'hidden' : ''}
                />
                {(feed.isOff) && (
                  <div className="no-video">
                    <FaVideoSlash />
                    <span style={{fontSize: '10px'}}>{feed.isLocal && mediaError ? 'Error' : 'Camera Off'}</span>
                  </div>
                )}
                <div className="participant-label">
                  {feed.name} {feed.isMuted ? '🔇' : ''}
                </div>
              </div>
            ))}
          </div>
          
          <div className="video-controls">
            <button 
              className={`control-btn ${isAudioMuted || !canUseMic ? 'muted' : ''}`} 
              disabled={!canUseMic}
              onClick={() => {
                if (localStream) {
                  const t = localStream.getAudioTracks()[0];
                  if (t) { 
                    t.enabled = !t.enabled; 
                    setIsAudioMuted(!t.enabled); 
                  }
                }
              }}
            >
              {isAudioMuted || !canUseMic ? <FaMicrophoneSlash /> : <FaMicrophone />}
            </button>
            <button 
              className={`control-btn ${isVideoOff || !canUseCamera ? 'off' : ''}`} 
              disabled={!canUseCamera}
              onClick={() => {
                if (localStream) {
                  const t = localStream.getVideoTracks()[0];
                  if (t) { 
                    t.enabled = !t.enabled; 
                    setIsVideoOff(!t.enabled); 
                  }
                }
              }}
            >
              {isVideoOff || !canUseCamera ? <FaVideoSlash /> : <FaVideo />}
            </button>
            <button className="control-btn leave-btn" onClick={() => window.location.reload()}><FaPhoneSlash /></button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPanel;
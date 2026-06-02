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
  const currentConstraints = useRef({ video: null, audio: null });
  
  // Use a reliable unique ID
  const userId = currentUser?.id || currentUser?._id;
  const isHost = isTeacher || role?.toLowerCase() === 'teacher' || role?.toLowerCase() === 'host';

  const canUseMic = isHost || roomPermissions?.useMicrophone !== false;
  const canUseCamera = isHost || roomPermissions?.useCamera !== false;

  // ========== INITIALIZE LOCAL MEDIA ==========
  const initMedia = async () => {
    // If no permissions at all, stop everything and return
    if (!canUseMic && !canUseCamera) {
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        setLocalStream(null);
      }
      return;
    }

    try {
      // If we don't have a stream yet, get one
      if (!localStream) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: canUseCamera ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
          audio: canUseMic
        });
        setLocalStream(stream);
        
        // Add to all existing peer connections
        Object.values(peerConnections.current).forEach(pc => {
          stream.getTracks().forEach(track => pc.addTrack(track, stream));
        });
      } else {
        // If we have a stream, just enable/disable tracks based on permissions
        const videoTrack = localStream.getVideoTracks()[0];
        const audioTrack = localStream.getAudioTracks()[0];

        if (videoTrack) {
          videoTrack.enabled = canUseCamera && !isVideoOff;
        } else if (canUseCamera) {
          // If we need video but don't have a track, we might need a new getUserMedia
          // or we just wait for a refresh. For simplicity, let's try to get it.
          const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const newTrack = newStream.getVideoTracks()[0];
          localStream.addTrack(newTrack);
          Object.values(peerConnections.current).forEach(pc => pc.addTrack(newTrack, localStream));
        }

        if (audioTrack) {
          audioTrack.enabled = canUseMic && !isAudioMuted;
        } else if (canUseMic) {
          const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const newTrack = newStream.getAudioTracks()[0];
          localStream.addTrack(newTrack);
          Object.values(peerConnections.current).forEach(pc => pc.addTrack(newTrack, localStream));
        }
      }
    } catch (err) {
      console.error('Media Access Error:', err);
      setMediaError(err.name === 'NotAllowedError' ? 'Permission Denied' : 'Camera error');
    }
  };

  // Sync track states whenever permissions or local buttons change
  useEffect(() => {
    if (localStream) {
      const vTrack = localStream.getVideoTracks()[0];
      const aTrack = localStream.getAudioTracks()[0];
      if (vTrack) vTrack.enabled = canUseCamera && !isVideoOff;
      if (aTrack) aTrack.enabled = canUseMic && !isAudioMuted;
    }
  }, [canUseMic, canUseCamera, isVideoOff, isAudioMuted, localStream]);

  useEffect(() => {
    initMedia();
  }, [canUseMic, canUseCamera]); 

  useEffect(() => {
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
      console.log('WebRTC: Offer from', fromId);
      try {
        const pc = getOrCreatePeerConnection(fromId);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('video-answer', { roomId, answer, targetId: fromId });
      } catch (e) {
        console.error('WebRTC: Offer error', e);
      }
    });

    socket.on('video-answer', async ({ answer, fromId }) => {
      console.log('WebRTC: Answer from', fromId);
      const pc = peerConnections.current[fromId];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (e) {
          console.error('WebRTC: Answer error', e);
        }
      }
    });

    socket.on('video-ice-candidate', async ({ candidate, fromId }) => {
      const pc = peerConnections.current[fromId];
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('WebRTC: ICE error', e);
        }
      }
    });

    socket.on('participants-update', ({ participants: newParticipants }) => {
      // Cleanup feeds for users who are no longer in the room
      const activeIds = newParticipants.map(p => String(p.id || p._id || p.socketId));
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

    return () => {
      socket.off('video-offer');
      socket.off('video-answer');
      socket.off('video-ice-candidate');
      socket.off('participants-update');
    };
  }, [socket, roomId, userId, localStream]);

  const getOrCreatePeerConnection = (targetId) => {
    if (peerConnections.current[targetId]) return peerConnections.current[targetId];

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
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
      console.log('WebRTC: Track received from', targetId);
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

  useEffect(() => {
    if (!localStream || !socket || !participants || !userId) return;

    participants.forEach(p => {
      const pId = String(p.id || p._id || p.socketId);
      if (pId && pId !== String(userId) && !peerConnections.current[pId]) {
        // Reduced delay by initiating immediately when a new participant is detected
        console.log('WebRTC: Connecting to', pId);
        const pc = getOrCreatePeerConnection(pId);
        pc.createOffer()
          .then(offer => pc.setLocalDescription(offer))
          .then(() => {
            socket.emit('video-offer', { roomId, offer: pc.localDescription, targetId: pId });
          })
          .catch(e => console.error('Offer creation error:', e));
      }
    });
  }, [participants, localStream, userId]);

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
      const participant = participants?.find(p => 
        String(p.id) === String(id) || 
        String(p._id) === String(id) || 
        String(p.socketId) === String(id)
      );

      // If participant is gone, we shouldn't even show this feed, but as a safety:
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

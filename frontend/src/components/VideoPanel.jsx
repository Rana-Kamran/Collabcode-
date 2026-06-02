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
    const needsVideo = canUseCamera;
    const needsAudio = canUseMic;

    console.log('Syncing media. Needs:', { needsVideo, needsAudio });

    // If both off, stop everything
    if (!needsVideo && !needsAudio) {
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        setLocalStream(null);
        // Clear senders in all PCs
        Object.values(peerConnections.current).forEach(pc => {
          pc.getSenders().forEach(sender => {
            try { pc.removeTrack(sender); } catch (e) {}
          });
        });
      }
      return;
    }

    try {
      let stream = localStream;
      
      // If we don't have a stream, get one with what we need
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: needsVideo ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
          audio: needsAudio
        });
        setLocalStream(stream);
        // Initial connections will be handled by the participants-watch useEffect
      } else {
        // We have a stream, check if we need to add missing tracks
        const hasVideo = stream.getVideoTracks().some(t => t.readyState === 'live');
        const hasAudio = stream.getAudioTracks().some(t => t.readyState === 'live');

        if (needsVideo && !hasVideo) {
          console.log('Adding video track...');
          const vStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const vTrack = vStream.getVideoTracks()[0];
          stream.addTrack(vTrack);
          addTrackToAllPeers(vTrack, stream);
        }

        if (needsAudio && !hasAudio) {
          console.log('Adding audio track...');
          const aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const aTrack = aStream.getAudioTracks()[0];
          stream.addTrack(aTrack);
          addTrackToAllPeers(aTrack, stream);
        }

        // Sync enabled states for local stream
        stream.getVideoTracks().forEach(t => t.enabled = needsVideo && !isVideoOff);
        stream.getAudioTracks().forEach(t => t.enabled = needsAudio && !isAudioMuted);
      }
    } catch (err) {
      console.error('Media Access Error:', err);
      setMediaError(err.name === 'NotAllowedError' ? 'Permission Denied' : 'Media error');
    }
  };

  const addTrackToAllPeers = (track, stream) => {
    Object.entries(peerConnections.current).forEach(([targetId, pc]) => {
      const senders = pc.getSenders();
      const existingSender = senders.find(s => s.track?.kind === track.kind);
      
      if (existingSender) {
        existingSender.replaceTrack(track);
      } else {
        pc.addTrack(track, stream);
        // Force re-negotiation
        pc.createOffer().then(offer => {
          return pc.setLocalDescription(offer);
        }).then(() => {
          socket.emit('video-offer', { roomId, offer: pc.localDescription, targetId });
        }).catch(e => console.error('Renegotiation error:', e));
      }
    });
  };

  useEffect(() => {
    initMedia();
  }, [canUseMic, canUseCamera]); 

  // Aggressive sync for local buttons
  useEffect(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach(t => {
        t.enabled = canUseCamera && !isVideoOff;
      });
      localStream.getAudioTracks().forEach(t => {
        t.enabled = canUseMic && !isAudioMuted;
      });
    }
  }, [isVideoOff, isAudioMuted, canUseMic, canUseCamera, localStream]);

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
      console.log('WebRTC: Offer received from', fromId);
      try {
        const pc = getOrCreatePeerConnection(fromId);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        
        if (pc.signalingState === 'have-remote-offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('video-answer', { roomId, answer, targetId: fromId });
        }
      } catch (e) {
        console.error('WebRTC: Error handling offer:', e);
      }
    });

    socket.on('video-answer', async ({ answer, fromId }) => {
      console.log('WebRTC: Answer received from', fromId);
      const pc = peerConnections.current[fromId];
      if (pc) {
        try {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          }
        } catch (e) {
          console.error('WebRTC: Error handling answer:', e);
        }
      }
    });

    socket.on('video-ice-candidate', async ({ candidate, fromId }) => {
      const pc = peerConnections.current[fromId];
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('WebRTC: Error adding ICE candidate:', e);
        }
      }
    });

    socket.on('participants-update', ({ participants: newParticipants }) => {
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

  useEffect(() => {
    if (!localStream || !socket || !participants || !userId) return;

    participants.forEach(p => {
      const pId = String(p.id || p._id || p.socketId);
      if (pId && pId !== String(userId) && !peerConnections.current[pId]) {
        // Deterministic initiation to avoid glare
        const shouldInitiate = String(userId) > String(pId);
        if (shouldInitiate) {
          console.log('WebRTC: Initiating connection to', pId);
          const pc = getOrCreatePeerConnection(pId);
          pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
              socket.emit('video-offer', { roomId, offer: pc.localDescription, targetId: pId });
            })
            .catch(e => console.error('WebRTC: Offer error:', e));
        }
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
module.exports = (io) => {
  let roomsData = {}; 

  io.on('connection', (socket) => {
    socket.on('join-room', ({ roomId, user }) => {
      socket.join(roomId);
      
      if (!roomsData[roomId]) {
        roomsData[roomId] = { code: '', participants: [] };
      }

      const newUser = {
        ...user,
        socketId: socket.id,
        isOnline: true,
        permissions: user.permissions || {
          editCode: user.role === 'teacher' || user.role === 'Teacher',
          useMicrophone: true,
          useCamera: true
        }
      };

      const existingUserIndex = roomsData[roomId].participants.findIndex(p => String(p.id) === String(user.id));
      if (existingUserIndex > -1) {
        roomsData[roomId].participants[existingUserIndex] = newUser;
      } else {
        roomsData[roomId].participants.push(newUser);
      }

      socket.emit('room-data', roomsData[roomId]);
      socket.to(roomId).emit('user-joined', { user: newUser });
      io.to(roomId).emit('participants-update', { participants: roomsData[roomId].participants });

      // ==================== HOST CONTROLS ====================
      
      socket.on('update-permission', ({ targetUserId, permission, value }) => {
        if (roomsData[roomId]) {
          const userToUpdate = roomsData[roomId].participants.find(p => String(p.id) === String(targetUserId));
          if (userToUpdate) {
            if (!userToUpdate.permissions) userToUpdate.permissions = {};
            userToUpdate.permissions[permission] = value;
            
            // Notify everyone about the change
            io.to(roomId).emit('participants-update', { participants: roomsData[roomId].participants });
            
            // Specifically notify the target user
            io.to(userToUpdate.socketId).emit('permission-changed', { permission, value });
          }
        }
      });

      socket.on('mute-all', () => {
        if (roomsData[roomId]) {
          roomsData[roomId].participants.forEach(p => {
            if (p.role !== 'teacher' && p.role !== 'Teacher') {
              p.permissions.useMicrophone = false;
              io.to(p.socketId).emit('permission-changed', { permission: 'useMicrophone', value: false });
            }
          });
          io.to(roomId).emit('participants-update', { participants: roomsData[roomId].participants });
        }
      });

      socket.on('unmute-all', () => {
        if (roomsData[roomId]) {
          roomsData[roomId].participants.forEach(p => {
            if (p.role !== 'teacher' && p.role !== 'Teacher') {
              p.permissions.useMicrophone = true;
              io.to(p.socketId).emit('permission-changed', { permission: 'useMicrophone', value: true });
            }
          });
          io.to(roomId).emit('participants-update', { participants: roomsData[roomId].participants });
        }
      });

      socket.on('remove-participant', ({ userId: targetId }) => {
        const userToRemove = roomsData[roomId].participants.find(p => p.id === targetId);
        if (userToRemove) {
          io.to(userToRemove.socketId).emit('kicked');
          // Room cleanup happens on disconnect
        }
      });

      socket.on('end-room', ({ roomId }) => {
        console.log(`Room ${roomId} ended by host`);
        io.to(roomId).emit('room-ended');
        if (roomsData[roomId]) {
          delete roomsData[roomId];
        }
      });

      // ==================== OTHER EVENTS ====================

      socket.on('code-change', (data) => {
        roomsData[roomId].code = data.code;
        socket.to(roomId).emit('code-update', data);
      });

      socket.on('send-message', (data) => {
        socket.to(roomId).emit('new-message', data);
      });

      socket.on('output-change', (data) => {
        socket.to(roomId).emit('output-update', data);
      });

      socket.on('video-offer', (data) => {
        const target = roomsData[roomId].participants.find(p => p.id === data.targetId);
        if (target) io.to(target.socketId).emit('video-offer', { ...data, fromId: user.id });
      });

      socket.on('video-answer', (data) => {
        const target = roomsData[roomId].participants.find(p => p.id === data.targetId);
        if (target) io.to(target.socketId).emit('video-answer', { ...data, fromId: user.id });
      });

      socket.on('video-ice-candidate', (data) => {
        const target = roomsData[roomId].participants.find(p => p.id === data.targetId);
        if (target) io.to(target.socketId).emit('video-ice-candidate', { ...data, fromId: user.id });
      });

      socket.on('disconnect', () => {
        if (roomsData[roomId]) {
          roomsData[roomId].participants = roomsData[roomId].participants.filter(p => p.socketId !== socket.id);
          io.to(roomId).emit('participants-update', { participants: roomsData[roomId].participants });
        }
      });
    });
  });
};

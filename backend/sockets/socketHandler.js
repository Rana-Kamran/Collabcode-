module.exports = (io) => {
  let roomsData = {}; 

  io.on('connection', (socket) => {
    socket.on('join-room', ({ roomId, user }) => {
      socket.join(roomId);
      
      if (!roomsData[roomId]) {
        roomsData[roomId] = {
          code: '',
          htmlCode: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Website</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <h1>Welcome to CollabCode!</h1>
    <p>This is a simple HTML page.</p>
    <button onclick="sayHello()">Click Me</button>
    
    <script src="script.js"></script>
</body>
</html>`,
          cssCode: `/* CSS Styles */
body {
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 20px;
    background-color: #f0f0f0;
}

h1 {
    color: #2ecc71;
    text-align: center;
}

p {
    color: #333;
    font-size: 16px;
    line-height: 1.5;
}

button {
    background-color: #2ecc71;
    color: white;
    padding: 10px 20px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
}

button:hover {
    background-color: #27ae60;
}`,
          jsCode: `// JavaScript Code
console.log("Hello, World!");

function sayHello() {
    alert("Hello from JavaScript!");
    console.log("Button clicked!");
}

function addNumbers(x, y) {
    return x + y;
}

let result = addNumbers(5, 3);
console.log("5 + 3 = " + result);

for(let i = 1; i <= 5; i++) {
    console.log("Number: " + i);
}`,
          language: 'javascript',
          participants: []
        };
      }

      const newUser = {
        ...user,
        socketId: socket.id,
        isOnline: true,
        permissions: user.permissions || {
          editCode: user.role === 'teacher' || user.role === 'Teacher' || user.role === 'host' || user.role === 'Host',
          runCode: user.role === 'teacher' || user.role === 'Teacher' || user.role === 'host' || user.role === 'Host',
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
            if (p.role !== 'teacher' && p.role !== 'Teacher' && p.role !== 'host' && p.role !== 'Host') {
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
            if (p.role !== 'teacher' && p.role !== 'Teacher' && p.role !== 'host' && p.role !== 'Host') {
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
        if (roomsData[roomId]) {
          roomsData[roomId].code = data.code;
          const lang = data.language || roomsData[roomId].language || 'javascript';
          if (lang === 'html') roomsData[roomId].htmlCode = data.code;
          else if (lang === 'css') roomsData[roomId].cssCode = data.code;
          else if (lang === 'javascript') roomsData[roomId].jsCode = data.code;
        }
        socket.to(roomId).emit('code-update', data);
      });

      // 'switch-language' carries the full code snapshot for all 3 languages.
      // We persist each buffer on the server so late-joiners always get current state.
      socket.on('switch-language', (data) => {
        if (roomsData[roomId]) {
          roomsData[roomId].language = data.language;
          if (data.htmlCode !== undefined) roomsData[roomId].htmlCode = data.htmlCode;
          if (data.cssCode  !== undefined) roomsData[roomId].cssCode  = data.cssCode;
          if (data.jsCode   !== undefined) roomsData[roomId].jsCode   = data.jsCode;
          // Keep the legacy 'code' field in sync with the newly active language
          if (data.language === 'html')       roomsData[roomId].code = data.htmlCode;
          else if (data.language === 'css')   roomsData[roomId].code = data.cssCode;
          else if (data.language === 'javascript') roomsData[roomId].code = data.jsCode;
        }
        // Broadcast to everyone else — include the full payload so receivers can hydrate all 3 buffers
        socket.to(roomId).emit('language-switched', data);
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

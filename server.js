const express = require('express');
const http = require('http');
const { Server } = require('socket.io'); // use this import style

const app = express();
const server = http.createServer(app);

// Create Socket.IO server with CORS support
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for development
    methods: ['GET', 'POST'],
  }
});

const users = [];

// Serve static files (your HTML/CSS/JS should be in ./public)
app.use(express.static('public'));

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('✅ A user connected: ' + socket.id);

  // New user joins
  socket.on('new user', (username, color, avatar) => {
    users.push({ username, socketId: socket.id, color, avatar });

    io.emit('update users', users);

    socket.emit('chat message', {
      user: 'Server',
      text: `Welcome, ${username}!`,
      color: '#000000',
      avatar: 'S',
      time: new Date().toLocaleTimeString(),
    });
  });

  // Public chat message
  socket.on('chat message', (message) => {
    const user = users.find(u => u.socketId === socket.id);
    io.emit('chat message', {
      user: user?.username || 'Anonymous',
      text: message,
      color: user?.color || '#000000',
      avatar: user?.avatar || 'A',
      time: new Date().toLocaleTimeString(),
    });
  });

  // Private message
  socket.on('private message', (data) => {
    const sender = users.find(u => u.socketId === socket.id);
    const recipient = users.find(u => u.username === data.recipient);
    if (recipient && sender) {
      io.to(recipient.socketId).emit('private message', {
        user: sender.username,
        text: data.message
      });
    } else {
      socket.emit('error', `User ${data.recipient} not found`);
    }
  });

  // Typing event
  socket.on('typing', (isTyping) => {
    const user = users.find(u => u.socketId === socket.id);
    if (user) {
      socket.broadcast.emit('typing', {
        user: user.username,
        isTyping
      });
    }
  });

  // Username change
  socket.on('username changed', (newUsername) => {
    const user = users.find(u => u.socketId === socket.id);
    if (user) {
      user.username = newUsername;
      io.emit('update users', users);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    const index = users.findIndex(u => u.socketId === socket.id);
    if (index !== -1) {
      const [user] = users.splice(index, 1);
      console.log(`❌ ${user.username} disconnected`);
      io.emit('update users', users);
    }
  });
});

// Start server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

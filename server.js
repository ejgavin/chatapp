const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const users = [];

// Serve static files (your client-side code)
app.use(express.static('public'));

// When a new user connects
io.on('connection', (socket) => {
  console.log('A user connected: ' + socket.id);

  // Handle new user joining and sending their username, color, and avatar
  socket.on('new user', (username, color, avatar) => {
    // Add user to the online users list
    users.push({ username, socketId: socket.id, color, avatar });

    // Emit the updated users list to all connected clients
    io.emit('update users', users);

    // Send a welcome message to the new user
    socket.emit('chat message', {
      user: 'Server',
      text: `Welcome, ${username}!`,
      color: '#000000',
      avatar: 'S',
      time: new Date().toLocaleTimeString(),
    });
  });

  // Handle private message from a user
  socket.on('private message', (data) => {
    const sender = users.find((user) => user.socketId === socket.id);  // Get sender by socketId
    const recipientSocket = users.find((user) => user.username === data.recipient);

    if (recipientSocket && sender) {
      // Send the private message to the recipient
      io.to(recipientSocket.socketId).emit('private message', {
        user: sender.username,  // Use sender's username
        text: data.message,
      });
    } else {
      // If recipient doesn't exist or sender is not found
      socket.emit('error', `User ${data.recipient} not found`);
    }
  });

  // Handle sending a public message to all users
  socket.on('chat message', (message) => {
    const user = users.find(u => u.socketId === socket.id);
    const time = new Date().toLocaleTimeString();
    io.emit('chat message', {
      user: user ? user.username : 'Anonymous',
      text: message,
      color: user ? user.color : '#000000',
      avatar: user ? user.avatar : 'A',
      time,
    });
  });

  // Handle typing event to show if a user is typing
  socket.on('typing', (isTyping) => {
    const user = users.find(u => u.socketId === socket.id);
    if (user) {
      socket.broadcast.emit('typing', {
        user: user.username,
        isTyping,
      });
    }
  });

  // Handle user disconnecting
  socket.on('disconnect', () => {
    const index = users.findIndex((user) => user.socketId === socket.id);
    if (index !== -1) {
      const user = users.splice(index, 1)[0];
      console.log(`${user.username} disconnected`);
      io.emit('update users', users); // Update the user list
    }
  });

  // Handle username change event
  socket.on('username changed', (newUsername) => {
    const userIndex = users.findIndex(u => u.socketId === socket.id);
    if (userIndex !== -1) {
      users[userIndex].username = newUsername;
      io.emit('update users', users); // Broadcast updated user list
    }
  });
});

// Start the server
server.listen(3000, () => {
  console.log('Server running on port 3000');
});

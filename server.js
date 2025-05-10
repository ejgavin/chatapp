const express = require('express');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const CHAT_HISTORY_FILE = path.join(__dirname, 'chat-history.json');
let chatHistory = [];

// Load chat history from file
if (fs.existsSync(CHAT_HISTORY_FILE)) {
  try {
    const data = fs.readFileSync(CHAT_HISTORY_FILE, 'utf8');
    chatHistory = JSON.parse(data);
  } catch (err) {
    console.error('Error reading chat history:', err);
  }
}

// Middleware to log each HTTP request
app.use((req, res, next) => {
  console.log(`📥 HTTP Request:
  ├─ IP: ${req.ip}
  ├─ Method: ${req.method}
  ├─ URL: ${req.originalUrl}
  ├─ Headers: ${JSON.stringify(req.headers, null, 2)}
  └─ Query Params: ${JSON.stringify(req.query)}
  `);
  next();
});

// Serve static files
app.use(express.static('public'));

const users = [];

// Store user statuses
const userStatuses = {};

// Get current time in a specific timezone
function getCurrentTime() {
  return new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' });
}

// Broadcast system message to all users
function broadcastSystemMessage(text) {
  const message = {
    user: 'Server',
    text,
    color: '#000000',
    avatar: 'S',
    time: getCurrentTime(),
  };
  io.emit('chat message', message);
  chatHistory.push(message);
  saveChatHistory();
}

// Save chat history to file
function saveChatHistory() {
  fs.writeFile(CHAT_HISTORY_FILE, JSON.stringify(chatHistory, null, 2), (err) => {
    if (err) console.error('Error saving chat history:', err);
  });
}

// Handle new connections
io.on('connection', (socket) => {
  const handshake = socket.handshake;
  let username = '';

  // When a new user joins
  socket.on('new user', (user, color, avatar) => {
    username = user;
    users.push({ username, socketId: socket.id, color, avatar, status: 'active' });
    userStatuses[username] = 'active';
    io.emit('update users', users);

    const message = {
      user: 'Server',
      text: `${username} has joined the chat`,
      color: '#000000',
      avatar: 'S',
      time: getCurrentTime(),
    };
    io.emit('chat message', message);
  });

  // Handle typing indicator
  socket.on('typing', (isTyping) => {
    const typingData = { user: username, isTyping };
    socket.broadcast.emit('typing', typingData);
  });

  // Handle private messages
  socket.on('private message', ({ recipient, message }) => {
    const recipientSocket = users.find(u => u.username === recipient);
    if (recipientSocket) {
      socket.to(recipientSocket.socketId).emit('private message', {
        user: username,
        text: message,
        time: getCurrentTime(),
      });
    }
  });

  // Handle username changes
  socket.on('username changed', (newUsername) => {
    const userIndex = users.findIndex(u => u.username === username);
    if (userIndex > -1) {
      users[userIndex].username = newUsername;
      userStatuses[newUsername] = userStatuses[username];
      delete userStatuses[username];
      username = newUsername;

      io.emit('update users', users);
      const message = {
        user: 'Server',
        text: `${username} has changed their username.`,
        color: '#000000',
        avatar: 'S',
        time: getCurrentTime(),
      };
      io.emit('chat message', message);
    }
  });

  // Handle user idle status
  socket.on('update status', ({ status }) => {
    userStatuses[username] = status;
    io.emit('update status', { username, status });

    // Update user status on the list
    const user = users.find(u => u.username === username);
    if (user) {
      user.status = status;
      io.emit('update users', users);
    }
  });

  // When a user disconnects
  socket.on('disconnect', () => {
    const userIndex = users.findIndex(u => u.socketId === socket.id);
    if (userIndex > -1) {
      const user = users[userIndex];
      users.splice(userIndex, 1);
      delete userStatuses[user.username];
      io.emit('update users', users);

      const message = {
        user: 'Server',
        text: `${user.username} has left the chat`,
        color: '#000000',
        avatar: 'S',
        time: getCurrentTime(),
      };
      io.emit('chat message', message);
    }
  });
});

// Start server
server.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});

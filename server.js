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

// Load chat history
if (fs.existsSync(CHAT_HISTORY_FILE)) {
  try {
    chatHistory = JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, 'utf8'));
  } catch (err) {
    console.error('Error reading chat history:', err);
  }
}

// Middleware to log HTTP requests
app.use((req, res, next) => {
  console.log(`📥 HTTP Request:
  ├─ IP: ${req.ip}
  ├─ Method: ${req.method}
  ├─ URL: ${req.originalUrl}
  └─ Query: ${JSON.stringify(req.query)}
  `);
  next();
});

app.use(express.static('public'));

const users = [];
const IDLE_TIMEOUT = 90 * 1000; // 1.5 minutes

function getCurrentTime() {
  return new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' });
}

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

function saveChatHistory() {
  fs.writeFile(CHAT_HISTORY_FILE, JSON.stringify(chatHistory, null, 2), (err) => {
    if (err) console.error('Error saving chat history:', err);
  });
}

// Periodic idle check
setInterval(() => {
  const now = Date.now();
  users.forEach(user => {
    if (now - user.lastActivity > IDLE_TIMEOUT) {
      if (!user.isIdle) {
        user.isIdle = true;
        user.displayName = `${user.originalName} (idle)`;
        console.log(`🕒 ${user.originalName} is now idle`);
        io.emit('update users', users.map(u => ({
          username: u.displayName,
          color: u.color,
          avatar: u.avatar
        })));
      }
    } else {
      if (user.isIdle) {
        user.isIdle = false;
        user.displayName = user.originalName;
        console.log(`✅ ${user.originalName} is active again`);
        io.emit('update users', users.map(u => ({
          username: u.displayName,
          color: u.color,
          avatar: u.avatar
        })));
      }
    }
  });
}, 30 * 1000); // every 30 sec

io.on('connection', (socket) => {
  console.log(`✅ New WebSocket connection from ${socket.id}`);

  socket.emit('chat history', chatHistory);

  socket.on('new user', (username, color, avatar) => {
    const user = {
      socketId: socket.id,
      originalName: username,
      displayName: username,
      color,
      avatar,
      lastActivity: Date.now(),
      isIdle: false,
    };
    users.push(user);
    console.log(`👤 ${username} joined`);
    io.emit('update users', users.map(u => ({
      username: u.displayName,
      color: u.color,
      avatar: u.avatar
    })));
    broadcastSystemMessage(`${username} has joined the chat.`);
  });

  socket.on('chat message', (message) => {
    const user = users.find(u => u.socketId === socket.id);
    if (user) {
      user.lastActivity = Date.now();
    }
    const msg = {
      user: user?.displayName || 'Anonymous',
      text: message,
      color: user?.color || '#000000',
      avatar: user?.avatar || 'A',
      time: getCurrentTime(),
    };
    console.log(`💬 ${msg.user}: ${msg.text}`);
    io.emit('chat message', msg);
    chatHistory.push(msg);
    saveChatHistory();
  });

  socket.on('private message', (data) => {
    const sender = users.find(u => u.socketId === socket.id);
    const recipient = users.find(u => u.originalName === data.recipient || u.displayName === data.recipient);
    if (sender && recipient) {
      console.log(`📩 Private from ${sender.originalName} to ${recipient.originalName}: ${data.message}`);
      io.to(recipient.socketId).emit('private message', {
        user: sender.displayName,
        text: data.message,
      });
    } else {
      socket.emit('error', `User ${data.recipient} not found`);
    }
  });

  socket.on('typing', (isTyping) => {
    const user = users.find(u => u.socketId === socket.id);
    if (user) {
      socket.broadcast.emit('typing', {
        user: user.displayName,
        isTyping,
      });
    }
  });

  socket.on('username changed', (newUsername) => {
    const user = users.find(u => u.socketId === socket.id);
    if (user) {
      const oldUsername = user.originalName;
      user.originalName = newUsername;
      user.displayName = newUsername + (user.isIdle ? ' (idle)' : '');
      console.log(`🔁 Username changed: ${oldUsername} → ${newUsername}`);
      io.emit('update users', users.map(u => ({
        username: u.displayName,
        color: u.color,
        avatar: u.avatar
      })));
      broadcastSystemMessage(`${oldUsername} changed username to ${newUsername}.`);
    }
  });

  socket.on('disconnect', () => {
    const index = users.findIndex(u => u.socketId === socket.id);
    if (index !== -1) {
      const [user] = users.splice(index, 1);
      console.log(`❌ Disconnected: ${user.originalName}`);
      io.emit('update users', users.map(u => ({
        username: u.displayName,
        color: u.color,
        avatar: u.avatar
      })));
      broadcastSystemMessage(`${user.originalName} has left the chat.`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

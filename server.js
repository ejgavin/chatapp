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
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes of inactivity

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

// Function to check for idle users
function checkIdleUsers() {
  const currentTime = Date.now();
  users.forEach(user => {
    if (currentTime - user.lastActivity > IDLE_TIMEOUT) {
      if (!user.isIdle) {
        user.isIdle = true;
        console.log(`🕒 User ${user.username} is idle`);
        io.to(user.socketId).emit('status', { status: 'idle' });
      }
    } else {
      if (user.isIdle) {
        user.isIdle = false;
        console.log(`✅ User ${user.username} is active again`);
        io.to(user.socketId).emit('status', { status: 'active' });
      }
    }
  });
}

// Call checkIdleUsers periodically
setInterval(checkIdleUsers, 30 * 1000); // Check every 30 seconds

io.on('connection', (socket) => {
  const handshake = socket.handshake;

  console.log(`✅ New WebSocket connection:
  ├─ Socket ID: ${socket.id}
  ├─ IP: ${handshake.address}
  ├─ User-Agent: ${handshake.headers['user-agent']}
  ├─ Time: ${new Date().toISOString()}
  ├─ Headers: ${JSON.stringify(handshake.headers, null, 2)}
  └─ Query: ${JSON.stringify(handshake.query)}
  `);

  // Send chat history
  socket.emit('chat history', chatHistory);

  socket.on('new user', (username, color, avatar) => {
    const user = { username, socketId: socket.id, color, avatar, lastActivity: Date.now(), isIdle: false };
    users.push(user);
    console.log(`👤 User joined:
    ├─ Username: ${username}
    ├─ Color: ${color}
    └─ Avatar: ${avatar}
    `);
    io.emit('update users', users);
    broadcastSystemMessage(`${username} has joined the chat.`);
  });

  socket.on('chat message', (message) => {
    const user = users.find(u => u.socketId === socket.id);
    if (user) {
      user.lastActivity = Date.now(); // Update activity time
    }
    const msg = {
      user: user?.username || 'Anonymous',
      text: message,
      color: user?.color || '#000000',
      avatar: user?.avatar || 'A',
      time: getCurrentTime(),
    };
    console.log(`💬 Message received:
    ├─ From: ${msg.user}
    ├─ Message: ${msg.text}
    └─ Time: ${msg.time}
    `);
    io.emit('chat message', msg);
    chatHistory.push(msg);
    saveChatHistory();
  });

  socket.on('private message', (data) => {
    const sender = users.find(u => u.socketId === socket.id);
    const recipient = users.find(u => u.username === data.recipient);
    if (recipient && sender) {
      console.log(`📩 Private message:
      ├─ From: ${sender.username}
      ├─ To: ${recipient.username}
      └─ Text: ${data.message}
      `);
      io.to(recipient.socketId).emit('private message', {
        user: sender.username,
        text: data.message,
      });
    } else {
      console.log(`⚠️ Private message failed: recipient not found.`);
      socket.emit('error', `User ${data.recipient} not found`);
    }
  });

  socket.on('typing', (isTyping) => {
    const user = users.find(u => u.socketId === socket.id);
    if (user) {
      console.log(`✍️ Typing status:
      ├─ User: ${user.username}
      └─ Is typing: ${isTyping}
      `);
      socket.broadcast.emit('typing', {
        user: user.username,
        isTyping,
      });
    }
  });

  socket.on('username changed', (newUsername) => {
    const user = users.find(u => u.socketId === socket.id);
    if (user) {
      const oldUsername = user.username;
      user.username = newUsername;
      console.log(`🔁 Username changed:
      ├─ From: ${oldUsername}
      └─ To: ${newUsername}
      `);
      io.emit('update users', users);
      broadcastSystemMessage(`${oldUsername} changed username to ${newUsername}.`);
    }
  });

  socket.on('disconnect', () => {
    const index = users.findIndex(u => u.socketId === socket.id);
    if (index !== -1) {
      const [user] = users.splice(index, 1);
      console.log(`❌ Disconnected:
      ├─ Username: ${user.username}
      └─ Socket ID: ${socket.id}
      `);
      io.emit('update users', users);
      broadcastSystemMessage(`${user.username} has left the chat.`);
    } else {
      console.log(`❌ Unknown user disconnected: Socket ID: ${socket.id}`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

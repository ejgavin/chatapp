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

// Serve static files
app.use(express.static('public'));

const users = [];

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

io.on('connection', (socket) => {
  console.log('✅ A user connected:', socket.id);

  // Send chat history to the newly connected user
  socket.emit('chat history', chatHistory);

  socket.on('new user', (username, color, avatar) => {
    const user = { username, socketId: socket.id, color, avatar };
    users.push(user);
    io.emit('update users', users);
    broadcastSystemMessage(`${username} has joined the chat.`);
  });

  socket.on('chat message', (message) => {
    const user = users.find(u => u.socketId === socket.id);
    const msg = {
      user: user?.username || 'Anonymous',
      text: message,
      color: user?.color || '#000000',
      avatar: user?.avatar || 'A',
      time: getCurrentTime(),
    };
    io.emit('chat message', msg);
    chatHistory.push(msg);
    saveChatHistory();
  });

  socket.on('private message', (data) => {
    const sender = users.find(u => u.socketId === socket.id);
    const recipient = users.find(u => u.username === data.recipient);
    if (recipient && sender) {
      io.to(recipient.socketId).emit('private message', {
        user: sender.username,
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
      io.emit('update users', users);
      broadcastSystemMessage(`${oldUsername} changed username to ${newUsername}.`);
    }
  });

  socket.on('disconnect', () => {
    const index = users.findIndex(u => u.socketId === socket.id);
    if (index !== -1) {
      const [user] = users.splice(index, 1);
      console.log(`❌ ${user.username} disconnected`);
      io.emit('update users', users);
      broadcastSystemMessage(`${user.username} has left the chat.`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

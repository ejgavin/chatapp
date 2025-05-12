const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const CHAT_HISTORY_FILE = path.join(__dirname, 'chat-history.json');
const LOCAL_BADWORDS_FILE = path.join(__dirname, 'badwords.json');
let chatHistory = [];
let badWords = new Set();

// Load chat history
if (fs.existsSync(CHAT_HISTORY_FILE)) {
  try {
    chatHistory = JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, 'utf8'));
  } catch (err) {
    log(`❌ Error reading chat history: ${err}`);
  }
}

// Load bad words from local and remote sources
(async () => {
  try {
    if (fs.existsSync(LOCAL_BADWORDS_FILE)) {
      const localWords = JSON.parse(fs.readFileSync(LOCAL_BADWORDS_FILE, 'utf8'));
      localWords.forEach(word => badWords.add(word.toLowerCase()));
    }

    const res = await fetch('https://raw.githubusercontent.com/zacanger/profane-words/3ebc6d0910d99df7d12fe1aa1749bf5f939d6a5b/words.json');
    if (res.ok) {
      const remoteWords = await res.json();
      remoteWords.forEach(word => badWords.add(word.toLowerCase()));
      log(`🧼 Loaded ${badWords.size} bad words`);
    } else {
      log(`❌ Failed to fetch remote bad words list: ${res.status}`);
    }
  } catch (err) {
    log(`❌ Error loading bad words: ${err}`);
  }
})();

app.use(express.static('public'));

const users = [];
const IDLE_TIMEOUT = 5 * 60 * 1000;

function getCurrentTime() {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour12: true
  });
}

function getCurrentDateTime() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour12: true
  });
}

function log(message) {
  console.log(`[${getCurrentDateTime()}] ${message}`);
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

function sendPrivateSystemMessage(socket, text) {
  socket.emit('chat message', {
    user: 'Server',
    text,
    color: '#000000',
    avatar: 'S',
    time: getCurrentTime(),
  });
}

function saveChatHistory() {
  fs.writeFile(CHAT_HISTORY_FILE, JSON.stringify(chatHistory, null, 2), (err) => {
    if (err) log(`❌ Error saving chat history: ${err}`);
  });
}

function containsProfanity(text) {
  return text
    .toLowerCase()
    .split(/\b|\s+/)
    .some(word => badWords.has(word));
}

setInterval(() => {
  const now = Date.now();
  let userListChanged = false;

  users.forEach(user => {
    const wasIdle = user.isIdle;
    const isNowIdle = (now - user.lastActivity > IDLE_TIMEOUT);

    if (isNowIdle && !wasIdle) {
      user.isIdle = true;
      user.displayName = `${user.originalName} (idle)`;
      log(`🕒 ${user.originalName} is now idle`);
      userListChanged = true;
    } else if (!isNowIdle && wasIdle) {
      user.isIdle = false;
      user.displayName = user.originalName;
      log(`✅ ${user.originalName} is active again`);
      userListChanged = true;
    }
  });

  if (userListChanged) {
    io.emit('update users', users.map(u => ({
      username: u.displayName,
      color: u.color,
      avatar: u.avatar
    })));
  }
}, 5 * 1000);

io.on('connection', (socket) => {
  log(`✅ New WebSocket connection from ${socket.id}`);
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
    log(`👤 ${username} joined`);
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

    if (containsProfanity(message)) {
      log(`🚫 Message blocked from ${user?.displayName || 'Unknown'}: ${message}`);
      sendPrivateSystemMessage(socket, '❌ Your message was blocked due to profanity.');
      return;
    }

    const msg = {
      user: user?.displayName || 'Anonymous',
      text: message,
      color: user?.color || '#000000',
      avatar: user?.avatar || 'A',
      time: getCurrentTime(),
    };

    log(`💬 ${msg.user}: ${msg.text}`);
    io.emit('chat message', msg);
    chatHistory.push(msg);
    saveChatHistory();
  });

  socket.on('private message', (data) => {
    const sender = users.find(u => u.socketId === socket.id);
    const recipient = users.find(u => u.originalName === data.recipient || u.displayName === data.recipient);
    if (sender && recipient) {
      log(`📩 Private from ${sender.originalName} to ${recipient.originalName}: ${data.message}`);
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
      log(`🔁 Username changed: ${oldUsername} → ${newUsername}`);
      io.emit('update users', users.map(u => ({
        username: u.displayName,
        color: u.color,
        avatar: u.avatar
      })));
      broadcastSystemMessage(`${oldUsername} changed username to ${newUsername}.`);
    }
  });

  socket.on('admin shutdown', () => {
    log('🚨 Admin has initiated shutdown.');
    io.emit('shutdown initiated');

    let secondsRemaining = 15;

    const countdownInterval = setInterval(() => {
      if (secondsRemaining > 0) {
        broadcastSystemMessage(`⚠️ Server is restarting in ${secondsRemaining} second${secondsRemaining === 1 ? '' : 's'}...`);
        secondsRemaining--;
      } else {
        clearInterval(countdownInterval);
        broadcastSystemMessage('🔁 Server is now restarting (takes about 1 - 2 minutes)...');

        setTimeout(() => {
          saveChatHistory();
          server.close(() => {
            log('🛑 Server has shut down.');
            process.exit(0);
          });
        }, 1000);
      }
    }, 1000);
  });

  socket.on('disconnect', () => {
    const index = users.findIndex(u => u.socketId === socket.id);
    if (index !== -1) {
      const [user] = users.splice(index, 1);
      log(`❌ Disconnected: ${user.originalName}`);
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
  log(`🚀 Server running at http://localhost:${PORT}`);
});

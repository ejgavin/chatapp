// server.js

const express = require('express');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const CHAT_HISTORY_FILE = path.join(__dirname, 'chat-history.json');
let chatHistory = [];

if (fs.existsSync(CHAT_HISTORY_FILE)) {
  try {
    chatHistory = JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, 'utf8'));
  } catch (err) {
    console.log(`❌ Error reading chat history: ${err}`);
  }
}

app.use(express.static('public'));

const users = [];
const IDLE_TIMEOUT = 5 * 60 * 1000;

const tempAdminState = {};
const kickedUsers = {};
let tempDisableState = false;

const lastMessageTimestamps = {}; // socket.id → timestamp of last message
const SLOW_MODE_INTERVAL = 2000; // 2 seconds

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
    if (err) console.log(`❌ Error saving chat history: ${err}`);
  });
}

let profanityList = new Set();

async function loadProfanityLists() {
  try {
    const [cmuResponse, zacangerResponse] = await Promise.all([
      axios.get('https://www.cs.cmu.edu/~biglou/resources/bad-words.txt'),
      axios.get('https://raw.githubusercontent.com/zacanger/profane-words/master/words.json')
    ]);

    const cmuWords = cmuResponse.data.split('\n').map(word => word.trim().toLowerCase()).filter(Boolean);
    const zacangerWords = zacangerResponse.data.map(word => word.trim().toLowerCase());

    profanityList = new Set([...cmuWords, ...zacangerWords]);
    log(`🛡️ Loaded ${profanityList.size} profane words.`);
  } catch (error) {
    log(`❌ Error loading profanity lists: ${error}`);
  }
}

function containsProfanity(message) {
  const words = message.toLowerCase().split(/\s+/);
  return words.some(word => profanityList.has(word));
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
}, 5000);

io.on('connection', (socket) => {
  log(`✅ New WebSocket connection from ${socket.id}`);
  socket.emit('chat history', chatHistory);
  socket.emit('temp disable state', tempDisableState);
  if (tempDisableState) {
    socket.emit('temp disable');
    return;
  }

  socket.on('new user', (username, color, avatar) => {
    if (tempDisableState) return;

    const nameTaken = users.some(u => u.originalName.toLowerCase() === username.toLowerCase());
    if (nameTaken) {
      sendPrivateSystemMessage(socket, '❌ Username already taken.');
      return;
    }

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
    io.emit('update users', users.map(u => ({
      username: u.displayName,
      color: u.color,
      avatar: u.avatar
    })));
    log(`👤 ${username} joined`);
    broadcastSystemMessage(`${username} has joined the chat.`);
  });

  socket.on('chat message', (message) => {
    if (tempDisableState) {
      sendPrivateSystemMessage(socket, '❌ Chat is temporarily disabled.');
      return;
    }

    const user = users.find(u => u.socketId === socket.id);
    if (!user) return;

    if (kickedUsers[socket.id]) {
      sendPrivateSystemMessage(socket, '❌ You have been kicked and cannot send messages.');
      return;
    }

    const now = Date.now();
    if (lastMessageTimestamps[socket.id] && now - lastMessageTimestamps[socket.id] < SLOW_MODE_INTERVAL) {
      sendPrivateSystemMessage(socket, '⏳ Slow mode is enabled. Please wait before sending another message.');
      return;
    }
    lastMessageTimestamps[socket.id] = now;

    user.lastActivity = now;
    log(`💬 ${user.originalName}: ${message}`);

    if (containsProfanity(message)) {
      log(`🚫 Message blocked from ${user.originalName}: ${message}`);
      sendPrivateSystemMessage(socket, '❌ Your message was blocked due to profanity.');
      return;
    }

    const msg = {
      user: user.displayName,
      text: message,
      color: user.color,
      avatar: user.avatar,
      time: getCurrentTime(),
    };

    io.emit('chat message', msg);
    chatHistory.push(msg);
    saveChatHistory();
  });

  socket.on('private message', (data) => {
    if (tempDisableState) {
      sendPrivateSystemMessage(socket, '❌ Chat is temporarily disabled.');
      return;
    }

    const sender = users.find(u => u.socketId === socket.id);
    const recipient = users.find(u => u.originalName === data.recipient || u.displayName === data.recipient);
    if (!sender || !recipient) return;

    if (containsProfanity(data.message)) {
      sendPrivateSystemMessage(socket, '❌ Your private message was blocked due to profanity.');
      return;
    }

    log(`📩 Private from ${sender.originalName} to ${recipient.originalName}: ${data.message}`);

    io.to(recipient.socketId).emit('private message', {
      user: sender.displayName,
      text: data.message,
    });
  });

  socket.on('typing', (isTyping) => {
    if (tempDisableState) return;

    const user = users.find(u => u.socketId === socket.id);
    if (user && !kickedUsers[socket.id]) {
      socket.broadcast.emit('typing', {
        user: user.displayName,
        isTyping,
      });
    }
  });

  socket.on('disconnect', () => {
    log(`❌ WebSocket disconnected from ${socket.id}`);
    const userIndex = users.findIndex(u => u.socketId === socket.id);
    if (userIndex !== -1) {
      const user = users.splice(userIndex, 1)[0];
      log(`❌ Disconnected: ${user.originalName}`);
      broadcastSystemMessage(`${user.originalName} has left the chat.`);
    }
  });
});

server.listen(3000, () => {
  log('✅ Server is running on http://localhost:3000');
  loadProfanityLists();
});

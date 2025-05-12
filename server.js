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
    log(`❌ Error reading chat history: ${err}`);
  }
}

app.use(express.static('public'));

const users = [];
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

const tempAdminState = {}; // Map of socket.id → { firstInitTime, tempAdminGranted }
const kickedUsers = {}; // socketId → true if kicked
let tempDisableState = false; // Track temp disable state

// Slow mode
const lastMessageTimestamps = {}; // socket.id => timestamp
let slowModeEnabled = true;
const SLOW_MODE_INTERVAL = 2000;

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
    if (users.find(u => u.originalName === username)) {
      sendPrivateSystemMessage(socket, `❌ Username "${username}" is already taken.`);
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
    if (slowModeEnabled && lastMessageTimestamps[socket.id] && now - lastMessageTimestamps[socket.id] < SLOW_MODE_INTERVAL) {
      sendPrivateSystemMessage(socket, '⏳ Slow mode is enabled. Please wait before sending another message.');
      return;
    }
    lastMessageTimestamps[socket.id] = now;

    user.lastActivity = now;
    log(`💬 ${user.originalName}: ${message}`);

    const trimmedMessage = message.trim().toLowerCase();

    // Admin Commands
    const record = tempAdminState[socket.id];

    if (trimmedMessage === 'server init') {
      if (!record || (now - record.firstInitTime > 10000)) {
        tempAdminState[socket.id] = { firstInitTime: now, tempAdminGranted: false };
        sendPrivateSystemMessage(socket, 'Ok');
        return;
      }
      if (!record.tempAdminGranted) {
        record.tempAdminGranted = true;
        sendPrivateSystemMessage(socket, 'Temp Admin Granted');
        return;
      }
    }

    if (trimmedMessage === 'server init help') {
      if (record && record.tempAdminGranted) {
        sendPrivateSystemMessage(socket, '🛠️ Admin Commands:\n1. server init temp disable\n2. server init clear history\n3. server init kick <username>\n4. server init slowmode on/off');
        return;
      }
    }

    if (trimmedMessage === 'server init slowmode off') {
      if (record && record.tempAdminGranted) {
        slowModeEnabled = false;
        log('⚙️ Slow mode disabled');
        broadcastSystemMessage('⚙️ Admin has disabled slow mode.');
        return;
      }
    }

    if (trimmedMessage === 'server init slowmode on') {
      if (record && record.tempAdminGranted) {
        slowModeEnabled = true;
        log('⚙️ Slow mode enabled');
        broadcastSystemMessage('⚙️ Admin has enabled slow mode.');
        return;
      }
    }

    if (trimmedMessage === 'server init temp disable') {
      if (record && record.tempAdminGranted) {
        log(`⚙️ Temp disable triggered by admin`);
        setTimeout(() => {
          tempDisableState = true;
          io.emit('temp disable');
          broadcastSystemMessage('Admin Has Enabled Temp Disable');
        }, 2000);
        return;
      }
    }

    if (trimmedMessage === 'server init clear history') {
      if (record && record.tempAdminGranted) {
        log(`⚙️ Clear chat history triggered by admin`);
        let countdown = 10;
        const interval = setInterval(() => {
          if (countdown > 0) {
            broadcastSystemMessage(`🧹 Clearing chat history in ${countdown--} second(s)...`);
          } else {
            clearInterval(interval);
            chatHistory = [];
            setTimeout(() => {
              saveChatHistory();
              broadcastSystemMessage('🧹 Chat history has been cleared.');
              io.emit('clear history');
            }, 1500);
          }
        }, 1000);
        return;
      }
    }

    if (trimmedMessage.startsWith('server init kick ')) {
      if (record && record.tempAdminGranted) {
        const targetName = trimmedMessage.slice('server init kick '.length).trim();
        const targetUser = users.find(u =>
          u.originalName.toLowerCase() === targetName.toLowerCase() ||
          u.displayName.toLowerCase() === targetName.toLowerCase()
        );
        if (targetUser) {
          const targetSocket = io.sockets.sockets.get(targetUser.socketId);
          if (targetSocket) {
            let countdown = 5;
            const interval = setInterval(() => {
              if (countdown > 0) {
                sendPrivateSystemMessage(targetSocket, `⚠️ You will be kicked in ${countdown--} second(s)...`);
              } else {
                clearInterval(interval);
                kickedUsers[targetUser.socketId] = true;
                sendPrivateSystemMessage(targetSocket, '❌ You were kicked by admin.');
                sendPrivateSystemMessage(socket, `✅ Kicked ${targetUser.originalName}`);
                log(`🚫 Kicked ${targetUser.originalName} by ${user.originalName}`);
                broadcastSystemMessage(`${targetUser.originalName} was kicked by admin.`);
              }
            }, 1000);
          }
        }
        return;
      }
    }

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

    if (!sender || !recipient) {
      socket.emit('error', `User ${data.recipient} not found`);
      return;
    }

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

  socket.on('username changed', (newUsername) => {
    const user = users.find(u => u.socketId === socket.id);
    if (user) {
      const oldUsername = user.originalName;
      user.originalName = newUsername;
      user.displayName = newUsername + (user.isIdle ? ' (idle)' : '');
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
        broadcastSystemMessage(`🚨 Server restarting in ${secondsRemaining--} second(s)...`);
      } else {
        clearInterval(countdownInterval);
        broadcastSystemMessage('🚨 Server restarting (takes 1 - 2 minutes to complete).');
        server.close();
      }
    }, 1000);
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

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

  // Send current tempDisableState to the client
  socket.emit('temp disable state', tempDisableState);

  if (tempDisableState) {
    socket.emit('temp disable');
    return;
  }

  socket.on('new user', (username, color, avatar) => {
    if (tempDisableState) {
      return; // Prevent any user joins if tempDisableState is true
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

    user.lastActivity = Date.now();

    const trimmedMessage = message.trim().toLowerCase();

    // Handle `server init` logic
    if (trimmedMessage === 'server init') {
      const now = Date.now();
      const record = tempAdminState[socket.id];

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

    // Handle `server init temp disable` logic
    if (trimmedMessage === 'server init temp disable') {
      const record = tempAdminState[socket.id];
      if (record && record.tempAdminGranted) {
        log('⚙️ Temp disable triggered by admin');

        setTimeout(() => {
          tempDisableState = true;
          io.emit('temp disable');
          broadcastSystemMessage('Admin Has Enabled Temp Disable');
        }, 2000);

        return;
      }
    }

    // Handle `server init kick <username>` logic
    if (trimmedMessage.startsWith('server init kick ')) {
      const record = tempAdminState[socket.id];
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
                sendPrivateSystemMessage(targetSocket, `⚠️ You will be kicked in ${countdown} second${countdown === 1 ? '' : 's'}...`);
                countdown--;
              } else {
                clearInterval(interval);
                kickedUsers[targetUser.socketId] = true;
                sendPrivateSystemMessage(targetSocket, '❌ You were kicked by admin.');
                sendPrivateSystemMessage(socket, `✅ Kicked ${targetUser.originalName}`);
                broadcastSystemMessage(`${targetUser.originalName} was kicked by admin.`);
              }
            }, 1000);
          } else {
            sendPrivateSystemMessage(socket, `❌ Could not find socket for user "${targetName}".`);
          }
        } else {
          sendPrivateSystemMessage(socket, `❌ User "${targetName}" not found.`);
        }
      } else {
        sendPrivateSystemMessage(socket, '❌ You are not authorized to kick.');
      }
      return;
    }

    if (containsProfanity(message)) {
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

  socket.on('temp disable', () => {
    tempDisableState = true; // Set temp disable state to true
    io.emit('temp disable'); // Notify all clients that chat is disabled
    broadcastSystemMessage('Admin Has Enabled Temp Chat Disable');
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
        broadcastSystemMessage(`🚨 Server shutting down in ${secondsRemaining} second${secondsRemaining === 1 ? '' : 's'}...`);
        secondsRemaining--;
      } else {
        clearInterval(countdownInterval);
        broadcastSystemMessage('🚨 Server shutdown starting (takes 1 - 2 minutes to complete).');
        server.close();
      }
    }, 1000);
  });

  socket.on('disconnect', () => {
    log(`❌ WebSocket disconnected from ${socket.id}`);
    const userIndex = users.findIndex(u => u.socketId === socket.id);
    if (userIndex !== -1) {
      const user = users.splice(userIndex, 1)[0];
      broadcastSystemMessage(`${user.originalName} has left the chat.`);
    }
  });
});

server.listen(3000, () => {
  log('✅ Server is running on http://localhost:3000');
  loadProfanityLists();
});


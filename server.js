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
const lastMessageTimestamps = {};
let slowModeEnabled = true;
const SLOW_MODE_INTERVAL = 2000;

function getCurrentTime() {
  return new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: true });
}

function log(msg) {
  console.log(`[${getCurrentTime()}] ${msg}`);
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
  fs.writeFile(CHAT_HISTORY_FILE, JSON.stringify(chatHistory, null, 2), err => {
    if (err) log(`❌ Error saving chat history: ${err}`);
  });
}

let profanityList = new Set();

async function loadProfanityLists() {
  try {
    const [cmu, zac] = await Promise.all([
      axios.get('https://www.cs.cmu.edu/~biglou/resources/bad-words.txt'),
      axios.get('https://raw.githubusercontent.com/zacanger/profane-words/master/words.json')
    ]);
    const cmuWords = cmu.data.split('\n').map(w => w.trim().toLowerCase()).filter(Boolean);
    const zacWords = zac.data.map(w => w.trim().toLowerCase());
    profanityList = new Set([...cmuWords, ...zacWords]);
    log(`🛡️ Loaded ${profanityList.size} profane words.`);
  } catch (err) {
    log(`❌ Error loading profanity lists: ${err}`);
  }
}

function containsProfanity(msg) {
  return msg.toLowerCase().split(/\s+/).some(word => profanityList.has(word));
}

setInterval(() => {
  const now = Date.now();
  let changed = false;
  users.forEach(user => {
    const idle = now - user.lastActivity > IDLE_TIMEOUT;
    if (idle && !user.isIdle) {
      user.isIdle = true;
      user.displayName = `${user.originalName} (idle)`;
      log(`🕒 ${user.originalName} is now idle`);
      changed = true;
    } else if (!idle && user.isIdle) {
      user.isIdle = false;
      user.displayName = user.originalName;
      log(`✅ ${user.originalName} is active again`);
      changed = true;
    }
  });
  if (changed) {
    io.emit('update users', users.map(u => ({
      username: u.displayName,
      color: u.color,
      avatar: u.avatar
    })));
  }
}, 5000);

io.on('connection', socket => {
  log(`✅ New WebSocket connection from ${socket.id}`);
  socket.emit('chat history', chatHistory);
  socket.emit('temp disable state', tempDisableState);
  if (tempDisableState) {
    socket.emit('temp disable');
    return;
  }

  socket.on('new user', (username, color, avatar) => {
    if (tempDisableState) return;
    if (users.some(u => u.originalName === username)) {
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

  socket.on('chat message', message => {
    const user = users.find(u => u.socketId === socket.id);
    if (!user) return;
    const now = Date.now();
    const trimmed = message.trim().toLowerCase();
    const record = tempAdminState[socket.id];

    if (trimmed === 'server init') {
      if (!record || now - record.firstInitTime > 10000) {
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

    if (trimmed.startsWith('server init') && (!record || !record.tempAdminGranted)) {
      sendPrivateSystemMessage(socket, '❌ You are not authorized to use admin commands.');
      return;
    }

    if (tempDisableState && !trimmed.startsWith('server init')) {
      sendPrivateSystemMessage(socket, '❌ Admin has enabled temp chat disable. You cannot send messages.');
      return;
    }

    if (kickedUsers[socket.id]) {
      sendPrivateSystemMessage(socket, '❌ You have been kicked and cannot send messages.');
      return;
    }

    if (slowModeEnabled && lastMessageTimestamps[socket.id] && now - lastMessageTimestamps[socket.id] < SLOW_MODE_INTERVAL) {
      sendPrivateSystemMessage(socket, '⏳ Slow mode is enabled. Please wait.');
      return;
    }
    lastMessageTimestamps[socket.id] = now;
    user.lastActivity = now;

    // Admin Command Handlers
    if (trimmed === 'server init help') {
      sendPrivateSystemMessage(socket, '🛠️ Admin Commands:\n1. server init temp disable\n2. server init temp disable off\n3. server init clear history\n4. server init kick <username>\n5. server init slowmode on/off\n6. server init restart');
      return;
    }

    if (trimmed === 'server init slowmode on') {
      slowModeEnabled = true;
      broadcastSystemMessage('⚙️ Admin has enabled slow mode.');
      return;
    }

    if (trimmed === 'server init slowmode off') {
      slowModeEnabled = false;
      broadcastSystemMessage('⚙️ Admin has disabled slow mode.');
      return;
    }

    if (trimmed === 'server init temp disable') {
      setTimeout(() => {
        tempDisableState = true;
        io.emit('temp disable');
        broadcastSystemMessage('⚠️ Admin has enabled temp chat disable.');
      }, 2000);
      return;
    }

    if (trimmed === 'server init temp disable off') {
      tempDisableState = false;
      io.emit('temp disable off');
      broadcastSystemMessage('✅ Admin has disabled temp chat disable.');
      return;
    }

    if (trimmed === 'server init clear history') {
      let countdown = 10;
      const interval = setInterval(() => {
        if (countdown > 0) {
          broadcastSystemMessage(`🧹 Clearing chat history in ${countdown--}...`);
        } else {
          clearInterval(interval);
          chatHistory = [];
          saveChatHistory();
          broadcastSystemMessage('🧹 Chat history has been cleared.');
          io.emit('clear history');
        }
      }, 1000);
      return;
    }

    if (trimmed.startsWith('server init kick ')) {
      const targetName = trimmed.replace('server init kick ', '').trim();
      const targetUser = users.find(u => u.originalName.toLowerCase() === targetName.toLowerCase() || u.displayName.toLowerCase() === targetName.toLowerCase());
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
              broadcastSystemMessage(`${targetUser.originalName} was kicked by admin.`);
            }
          }, 1000);
        }
      } else {
        sendPrivateSystemMessage(socket, `❌ Could not find user "${targetName}".`);
      }
      return;
    }

    if (trimmed === 'server init restart') {
      log('🚨 Restart initiated by admin');
      io.emit('shutdown initiated');
      let remaining = 15;
      const interval = setInterval(() => {
        if (remaining > 0) {
          broadcastSystemMessage(`🚨 Server restarting in ${remaining--} second(s)...`);
        } else {
          clearInterval(interval);
          broadcastSystemMessage('🚨 Server restarting (takes 1 - 2 minutes to complete).');
          server.close();
        }
      }, 1000);
      return;
    }

    if (containsProfanity(message)) {
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

  socket.on('private message', data => {
    const sender = users.find(u => u.socketId === socket.id);
    const recipient = users.find(u =>
      u.originalName === data.recipient || u.displayName === data.recipient
    );
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

  socket.on('typing', isTyping => {
    if (tempDisableState) return;
    const user = users.find(u => u.socketId === socket.id);
    if (user && !kickedUsers[socket.id]) {
      socket.broadcast.emit('typing', { user: user.displayName, isTyping });
    }
  });

  socket.on('username changed', newUsername => {
    const user = users.find(u => u.socketId === socket.id);
    if (user) {
      const old = user.originalName;
      user.originalName = newUsername;
      user.displayName = newUsername + (user.isIdle ? ' (idle)' : '');
      io.emit('update users', users.map(u => ({
        username: u.displayName,
        color: u.color,
        avatar: u.avatar
      })));
      broadcastSystemMessage(`${old} changed username to ${newUsername}.`);
    }
  });

  socket.on('disconnect', () => {
    log(`❌ Disconnected: ${socket.id}`);
    const idx = users.findIndex(u => u.socketId === socket.id);
    if (idx !== -1) {
      const user = users.splice(idx, 1)[0];
      log(`❌ Disconnected: ${user.originalName}`);
      broadcastSystemMessage(`${user.originalName} has left the chat.`);
    }
  });
});

server.listen(3000, () => {
  log('✅ Server is running on http://localhost:3000');
  loadProfanityLists();
});

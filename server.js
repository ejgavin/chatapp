const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const fs = require('fs');
const path = require('path');

const users = [];
const tempAdminState = {}; // socketId → { tempAdminGranted: true }
const kickedUsers = {};    // socketId → true if kicked

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function sendPrivateSystemMessage(socket, message) {
  socket.emit('chat message', {
    username: 'System',
    message,
    color: 'gray',
    avatar: '',
    system: true,
  });
}

function broadcastSystemMessage(message) {
  io.emit('chat message', {
    username: 'System',
    message,
    color: 'gray',
    avatar: '',
    system: true,
  });
}

async function loadProfanityLists() {
  // Load profanity files if applicable
}

io.on('connection', socket => {
  log(`🔌 WebSocket connected: ${socket.id}`);

  socket.on('register', ({ username, color, avatar }) => {
    const user = {
      socketId: socket.id,
      originalName: username,
      displayName: username,
      color,
      avatar,
      lastActivity: Date.now(),
    };
    users.push(user);

    socket.emit('chat history', []); // optionally send chat history
    io.emit('update users', users.map(u => ({
      username: u.displayName,
      color: u.color,
      avatar: u.avatar
    })));
    broadcastSystemMessage(`${username} has joined the chat.`);
  });

  socket.on('chat message', msg => {
    const trimmedMessage = msg.trim();
    const user = users.find(u => u.socketId === socket.id);
    if (!user) return;

    if (kickedUsers[socket.id]) {
      sendPrivateSystemMessage(socket, '❌ You have been kicked and cannot send messages.');
      return;
    }

    user.lastActivity = Date.now();

    if (trimmedMessage === 'server init') {
      tempAdminState[socket.id] = { tempAdminGranted: true };
      sendPrivateSystemMessage(socket, '✅ You are now a temporary admin.');
      return;
    }

    if (trimmedMessage === 'server init disable') {
      delete tempAdminState[socket.id];
      sendPrivateSystemMessage(socket, '❌ Temporary admin privileges revoked.');
      return;
    }

    if (trimmedMessage.startsWith('server init kick ')) {
      const record = tempAdminState[socket.id];
      if (record && record.tempAdminGranted) {
        const targetName = trimmedMessage.slice('server init kick '.length).trim().toLowerCase();
        const targetUser = users.find(u =>
          u.originalName.toLowerCase() === targetName ||
          u.displayName.toLowerCase() === targetName
        );

        if (targetUser) {
          kickedUsers[targetUser.socketId] = true;
          sendPrivateSystemMessage(socket, `✅ Kicked ${targetUser.originalName}`);
          sendPrivateSystemMessage(io.sockets.sockets.get(targetUser.socketId), '❌ You were kicked by admin.');
          broadcastSystemMessage(`${targetUser.originalName} was kicked by admin.`);
        } else {
          sendPrivateSystemMessage(socket, `❌ User "${targetName}" not found.`);
        }
      } else {
        sendPrivateSystemMessage(socket, '❌ You are not authorized to kick.');
      }
      return;
    }

    io.emit('chat message', {
      username: user.displayName,
      message: msg,
      color: user.color,
      avatar: user.avatar,
    });
  });

  socket.on('typing', isTyping => {
    const user = users.find(u => u.socketId === socket.id);
    if (user && !kickedUsers[socket.id]) {
      socket.broadcast.emit('typing', {
        user: user.displayName,
        isTyping,
      });
    }
  });

  socket.on('restart', () => {
    const record = tempAdminState[socket.id];
    if (record && record.tempAdminGranted) {
      io.emit('chat message', {
        username: 'System',
        message: '🔁 Server is restarting...',
        color: 'gray',
        avatar: '',
        system: true,
      });

      setTimeout(() => {
        log('🔁 Restart triggered by admin');
        process.exit(0); // Make sure a process manager like PM2 is used
      }, 1000);
    }
  });

  socket.on('disconnect', () => {
    const index = users.findIndex(u => u.socketId === socket.id);
    if (index !== -1) {
      const user = users.splice(index, 1)[0];
      broadcastSystemMessage(`${user.originalName} has left the chat.`);
    }
    delete tempAdminState[socket.id];
    delete kickedUsers[socket.id];

    io.emit('update users', users.map(u => ({
      username: u.displayName,
      color: u.color,
      avatar: u.avatar
    })));

    log(`❌ WebSocket disconnected: ${socket.id}`);
  });
});

loadProfanityLists().then(() => {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    log(`🚀 Server started on port ${PORT}`);
  });
});

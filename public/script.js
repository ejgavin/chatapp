const socket = io();
let privateRecipient = null;

const chatUI = document.getElementById('chat-ui');
const usernameScreen = document.getElementById('username-screen');
const usernameInput = document.getElementById('username-input');
const enterChatBtn = document.getElementById('enter-chat-btn');
const usernameError = document.getElementById('username-error'); // NEW: Error element

const input = document.getElementById('message-input');
const sendButton = document.getElementById('send-btn');
const messages = document.getElementById('messages');
const emojiBtn = document.getElementById('emoji-btn');
const emojiContainer = document.getElementById('emoji-container');
const emojiPicker = emojiContainer.querySelector('emoji-picker');
const closeEmojiBtn = document.getElementById('close-emoji-btn');

const chatInfo = document.getElementById('chat-info');
const chatType = document.getElementById('chat-type');
const currentChatWith = document.getElementById('current-chat-with');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const privateChatInput = document.getElementById('private-chat-input');
const startPrivateChatButton = document.getElementById('start-private-chat');
const publicChatButton = document.getElementById('public-chat-btn');
const publicChatButtonTop = document.getElementById('public-chat-btn-top');
const closeSettingsButton = document.getElementById('close-settings-btn');
const changeUsernameInput = document.getElementById('change-username-input');
const changeUsernameButton = document.getElementById('change-username-btn');
const onlineUsersList = document.getElementById('online-users');

const typingIndicator = document.createElement('div');
typingIndicator.classList.add('text-sm', 'text-gray-500', 'mt-2', 'typing-indicator');
messages.parentElement.insertBefore(typingIndicator, messages.nextSibling);

let username = localStorage.getItem('username') || '';
let userStatus = 'active';  // Track user activity status
let idleTimeout = null;
const idleLimit = 2 * 60 * 1000;  // 2 minutes
let lastInteractionTime = Date.now();  // Track the last interaction time
const statusLogInterval = 15 * 1000;  // 15 seconds

const allowedNames = [
  "Emiliano", "Fiona", "Eliot", "Krishay", "Channing", "Anna", "Mayla",
  "Adela", "Nathaniel", "Noah", "Stefan", "Michael", "Adam", "Nicholas",
  "Samuel", "Jonah", "Amber", "Annie", "Conor", "Christopher", "Seneca",
  "Magnus", "Jace", "Martin", "Daehan", "Charles", "Ava",
  "Dexter", "Charlie", "Nick", "Sam", "Nate", "Aleksander", "Alek", "Eli"
];

// Capitalization and color functions
function capitalizeFirstLetter(name) {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function getRandomColor() {
  let color;
  do {
    color = "#" + Math.floor(Math.random() * 16777215).toString(16);
  } while (color.toLowerCase() === "#ffffff");
  return color;
}

// Enter Chat logic
function enterChat() {
  const enteredUsername = usernameInput.value.trim();
  const capitalizedUsername = capitalizeFirstLetter(enteredUsername);

  if (!allowedNames.includes(capitalizedUsername)) {
    usernameError.textContent = "Please use your own name.";
    return;
  }

  if (enteredUsername) {
    username = capitalizedUsername;
    localStorage.setItem('username', username);
    const color = getRandomColor();
    const avatar = username[0].toUpperCase();
    socket.emit('new user', username, color, avatar);
    usernameScreen.classList.add('hidden');
    chatUI.classList.remove('hidden');
    usernameError.textContent = ''; // Clear error
    startIdleDetection();  // Start idle detection when user enters chat
    startStatusLogging();  // Start status logging every 15 seconds
  }
}

enterChatBtn.addEventListener('click', enterChat);
usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') enterChat();
});

// Send message logic
function sendMessage() {
  if (input.value.trim()) {
    if (privateRecipient) {
      socket.emit('private message', { recipient: privateRecipient, message: input.value });
      logPrivateMessage(input.value);
    } else {
      socket.emit('chat message', input.value);
    }
    socket.emit('typing', false);
    input.value = '';
  }
}

sendButton.addEventListener('click', (e) => {
  e.preventDefault();
  sendMessage();
});

input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendMessage();
  }
});

input.addEventListener('input', () => {
  socket.emit('typing', input.value.length > 0);
});

// Chat history and message handling
socket.on('chat history', (history) => {
  history.forEach(msg => {
    displayMessage(msg);
  });
});

socket.on('chat message', msg => {
  displayMessage(msg);
});

socket.on('private message', msg => {
  const item = document.createElement('div');
  item.innerHTML = `
    <div class="bg-green-100 p-2 rounded-md">
      <strong>Private from ${msg.user}: </strong>${sanitize(msg.text)}
    </div>
  `;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
});

// Typing indicator update
socket.on('typing', data => {
  typingIndicator.textContent = data.isTyping ? `${data.user} is typing...` : '';
  chatType.textContent = privateRecipient ? 'Private Chat' : 'Public Chat';
  currentChatWith.textContent = privateRecipient ? privateRecipient : 'No one';
});

// Users list update
socket.on('update users', users => {
  onlineUsersList.innerHTML = '';
  users.forEach(user => {
    if (user.username === username) return;

    const userItem = document.createElement('li');
    userItem.classList.add('relative', 'group');
    userItem.innerHTML = `
      <button class="text-blue-600 underline hover:text-blue-800" data-username="${user.username}">
        ${user.username} ${user.status === 'idle' ? '(Idle)' : ''}
      </button>
    `;
    const nameBtn = userItem.querySelector('button');
    nameBtn.addEventListener('click', () => {
      privateRecipient = user.username;
      logChatMessage(`Started private chat with ${user.username}`);
      chatType.textContent = 'Private Chat';
      currentChatWith.textContent = privateRecipient;
    });
    onlineUsersList.appendChild(userItem);
  });
});

// Emoji picker logic
emojiBtn.addEventListener('click', () => {
  emojiContainer.classList.remove('hidden');
});

emojiPicker.addEventListener('emoji-click', (event) => {
  input.value += event.detail.unicode;
});

closeEmojiBtn.addEventListener('click', () => {
  emojiContainer.classList.add('hidden');
});

// Settings button and private chat logic
settingsBtn.addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
});

closeSettingsButton.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

startPrivateChatButton.addEventListener('click', () => {
  privateRecipient = privateChatInput.value.trim();
  if (privateRecipient) {
    logChatMessage(`Started private chat with ${privateRecipient}`);
    settingsModal.classList.add('hidden');
    chatType.textContent = 'Private Chat';
    currentChatWith.textContent = privateRecipient;
  } else {
    logChatMessage('Please enter a valid username for private chat.');
  }
});

publicChatButton.addEventListener('click', () => {
  privateRecipient = null;
  logChatMessage('Switched to public chat.');
  chatType.textContent = 'Public Chat';
  currentChatWith.textContent = 'No one';
});

publicChatButtonTop.addEventListener('click', () => {
  privateRecipient = null;
  logChatMessage('Switched to public chat.');
  chatType.textContent = 'Public Chat';
  currentChatWith.textContent = 'No one';
});

changeUsernameButton.addEventListener('click', () => {
  const newUsername = changeUsernameInput.value.trim();
  const capitalizedUsername = capitalizeFirstLetter(newUsername);

  if (!allowedNames.includes(capitalizedUsername)) {
    logChatMessage('This username is not allowed. Please use your own name.');
    return;
  }

  if (newUsername) {
    socket.emit('username changed', capitalizedUsername);
    username = capitalizedUsername;
    localStorage.setItem('username', username);
    logChatMessage(`Username changed to ${capitalizedUsername}`);
    changeUsernameInput.value = '';
    settingsModal.classList.add('hidden');
  } else {
    logChatMessage('Please enter a valid new username.');
  }
});

// Display messages in chat UI
function displayMessage(msg) {
  const item = document.createElement('div');
  item.classList.add('message-item');
  item.innerHTML = `
    <div class="flex items-center space-x-2 mb-1">
      <div class="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-white text-sm font-bold" style="background-color: ${msg.color}">
        ${msg.avatar}
      </div>
      <div class="text-sm text-gray-700 font-semibold">${msg.username}</div>
    </div>
    <div class="text-gray-600">${sanitize(msg.text)}</div>
  `;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}

function sanitize(text) {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function logChatMessage(message) {
  const item = document.createElement('div');
  item.classList.add('log-message');
  item.textContent = message;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}

// Start idle detection logic
function startIdleDetection() {
  resetIdleTimeout();
  document.addEventListener('mousemove', resetIdleTimeout);
  document.addEventListener('keydown', resetIdleTimeout);
}

function resetIdleTimeout() {
  clearTimeout(idleTimeout);
  userStatus = 'active';
  idleTimeout = setTimeout(() => {
    userStatus = 'idle';
    socket.emit('status change', userStatus);
  }, idleLimit);
}

function startStatusLogging() {
  setInterval(() => {
    const elapsedTime = Date.now() - lastInteractionTime;
    socket.emit('status log', { userStatus, elapsedTime });
  }, statusLogInterval);
}

socket.emit('username status', username);

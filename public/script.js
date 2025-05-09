const socket = io();
let privateRecipient = null;

const chatUI = document.getElementById('chat-ui');
const usernameScreen = document.getElementById('username-screen');
const usernameInput = document.getElementById('username-input');
const enterChatBtn = document.getElementById('enter-chat-btn');

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

const typingIndicator = document.getElementById('typing-indicator');

let username = localStorage.getItem('username') || '';

// ✅ Allowed names list
const allowedNames = [
  "Emiliano", "Fiona", "Eliot", "Krishay", "Channing", "Anna", "Mayla",
  "Adela", "Nathaniel", "Noah", "Stefan", "Michael", "Adam", "Nicholas",
  "Samuel", "Jonah", "Amber", "Annie", "Conor", "Christopher", "Seneca",
  "Magnus", "Jace", "Martin", "Daehan", "Charles", "Ava",
  "Dexter", "Charlie", "Nick", "Sam", "Nate", "Aleksander", "Alek", "Eli"
];

// ✅ Capitalize helper
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

// ✅ Updated enterChat function with allowedNames restriction
function enterChat() {
  const inputVal = usernameInput.value.trim();
  const capitalized = capitalizeFirstLetter(inputVal);

  if (!allowedNames.includes(capitalized)) {
    alert("Access denied. Please enter a valid first name.");
    return;
  }

  username = capitalized;
  localStorage.setItem('username', username);
  const color = getRandomColor();
  const avatar = username[0].toUpperCase();
  socket.emit('new user', username, color, avatar);

  usernameScreen.classList.add('hidden');
  chatUI.classList.remove('hidden');
}

enterChatBtn.addEventListener('click', enterChat);
usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') enterChat();
});

function isUserNearBottom() {
  const threshold = 100; // px
  const position = messages.scrollTop + messages.clientHeight;
  const height = messages.scrollHeight;
  return position > height - threshold;
}

function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}

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
  } else {
    socket.emit('typing', true);
  }
});

input.addEventListener('keyup', () => {
  setTimeout(() => socket.emit('typing', false), 1000);
});

// Handle emoji selection
emojiBtn.addEventListener('click', () => {
  emojiContainer.classList.toggle('hidden');
});

emojiPicker.addEventListener('emoji-click', (event) => {
  input.value += event.detail.unicode;
  input.focus();
});

closeEmojiBtn.addEventListener('click', () => {
  emojiContainer.classList.add('hidden');
});

// Handle incoming messages
socket.on('chat message', (msg) => {
  const shouldScroll = isUserNearBottom();
  const div = document.createElement('div');
  div.textContent = msg;
  messages.appendChild(div);
  if (shouldScroll) scrollToBottom();
});

// Handle typing indicator
socket.on('typing', ({ username: typingUser, isTyping }) => {
  if (isTyping) {
    typingIndicator.textContent = `${typingUser} is typing...`;
  } else {
    typingIndicator.textContent = '';
  }
});

// Settings modal
settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeSettingsButton.addEventListener('click', () => settingsModal.classList.add('hidden'));

// Start private chat
startPrivateChatButton.addEventListener('click', () => {
  const recipient = privateChatInput.value.trim();
  if (recipient && recipient !== username) {
    privateRecipient = recipient;
    chatType.textContent = 'Private Chat';
    currentChatWith.textContent = `Chatting with ${privateRecipient}`;
    settingsModal.classList.add('hidden');
  } else {
    alert("Invalid username for private chat.");
  }
});

// Go back to public chat
function returnToPublicChat() {
  privateRecipient = null;
  chatType.textContent = 'Public Chat';
  currentChatWith.textContent = 'No one';
  settingsModal.classList.add('hidden');
}

publicChatButton.addEventListener('click', returnToPublicChat);
publicChatButtonTop.addEventListener('click', returnToPublicChat);

// Change username
changeUsernameButton.addEventListener('click', () => {
  const newName = capitalizeFirstLetter(changeUsernameInput.value.trim());
  if (allowedNames.includes(newName)) {
    username = newName;
    localStorage.setItem('username', username);
    socket.emit('change username', username);
    alert('Username changed successfully.');
  } else {
    alert("Invalid username. Choose from allowed names.");
  }
});

// Display private messages
socket.on('private message', ({ from, message }) => {
  const shouldScroll = isUserNearBottom();
  const div = document.createElement('div');
  div.innerHTML = `<strong>${from} (private):</strong> ${message}`;
  messages.appendChild(div);
  if (shouldScroll) scrollToBottom();
});

// Show online users
socket.on('user list', (users) => {
  onlineUsersList.innerHTML = '';
  users.forEach((user) => {
    const li = document.createElement('li');
    li.textContent = user;
    onlineUsersList.appendChild(li);
  });
});

// Private message echo (to self)
function logPrivateMessage(msg) {
  const shouldScroll = isUserNearBottom();
  const div = document.createElement('div');
  div.innerHTML = `<em>You (private):</em> ${msg}`;
  messages.appendChild(div);
  if (shouldScroll) scrollToBottom();
}

const socket = io(); // Ensure that the socket is correctly initialized
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

sendButton.addEventListener('click', sendMessage);
input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

input.addEventListener('input', () => {
  socket.emit('typing', input.value.trim() !== '');
});

emojiBtn.addEventListener('click', () => {
  emojiContainer.classList.toggle('hidden');
});

closeEmojiBtn.addEventListener('click', () => {
  emojiContainer.classList.add('hidden');
});

emojiPicker.addEventListener('emoji-click', (e) => {
  input.value += e.detail.unicode;
  input.focus();
});

socket.on('chat message', (msg, username, color, avatar) => {
  const messageElement = document.createElement('div');
  messageElement.classList.add('p-2', 'rounded', 'bg-gray-200', 'mb-2');
  messageElement.style.color = color;
  messageElement.innerHTML = `
    <span class="font-semibold">${avatar}</span>
    <span class="font-bold">${username}:</span> ${msg}
  `;
  messages.appendChild(messageElement);

  if (isUserNearBottom()) scrollToBottom();
});

socket.on('private message', (msg, username, color, avatar) => {
  const messageElement = document.createElement('div');
  messageElement.classList.add('p-2', 'rounded', 'bg-gray-200', 'mb-2');
  messageElement.style.color = color;
  messageElement.innerHTML = `
    <span class="font-semibold">${avatar}</span>
    <span class="font-bold">${username}:</span> ${msg}
  `;
  messages.appendChild(messageElement);

  if (isUserNearBottom()) scrollToBottom();
});

// Online Users update
socket.on('online users', (users) => {
  onlineUsersList.innerHTML = '';
  users.forEach((user) => {
    const userElement = document.createElement('li');
    userElement.textContent = user;
    onlineUsersList.appendChild(userElement);
  });
});

// Handle socket connection issues
socket.on('connect_error', (err) => {
  console.error('Socket connection failed:', err);
  alert('Connection to the server failed. Please try again later.');
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

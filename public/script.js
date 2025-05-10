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

const typingIndicator = document.createElement('div');
typingIndicator.classList.add('text-sm', 'text-gray-500', 'mt-2');
input.parentElement.insertBefore(typingIndicator, input);

let username = localStorage.getItem('username') || '';

// List of allowed usernames
const allowedNames = [
  "Emiliano", "Fiona", "Eliot", "Krishay", "Channing", "Anna", "Mayla",
  "Adela", "Nathaniel", "Noah", "Stefan", "Michael", "Adam", "Nicholas",
  "Samuel", "Jonah", "Amber", "Annie", "Conor", "Christopher", "Seneca",
  "Magnus", "Jace", "Martin", "Daehan", "Charles", "Ava",
  "Dexter", "Charlie", "Nick", "Sam", "Nate", "Aleksander", "Alek", "Eli"
];

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

function enterChat() {
  const enteredUsername = usernameInput.value.trim();
  const capitalizedUsername = capitalizeFirstLetter(enteredUsername);

  if (!allowedNames.includes(capitalizedUsername)) {
    alert('This username is not allowed. Please choose another one.');
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
  }
}

enterChatBtn.addEventListener('click', enterChat);
usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') enterChat();
});

// Socket listeners
socket.on('user joined', (users) => {
  updateOnlineUsersList(users);
});

socket.on('chat message', (data) => {
  const msg = document.createElement('div');
  msg.classList.add('mb-2');
  msg.innerHTML = `<strong style="color:${data.color}">${data.avatar}</strong>: <span>${data.message}</span>`;
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
});

socket.on('private message', (sender, message) => {
  if (privateRecipient) {
    const msg = document.createElement('div');
    msg.innerHTML = `<strong>${sender}</strong>: ${message}`;
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
  }
});

// Chat controls
sendButton.addEventListener('click', () => {
  const message = input.value.trim();
  if (message) {
    if (privateRecipient) {
      socket.emit('private message', privateRecipient, message);
    } else {
      socket.emit('chat message', { username, message });
    }
    input.value = '';
  }
});

emojiBtn.addEventListener('click', () => {
  emojiContainer.classList.toggle('hidden');
});

closeEmojiBtn.addEventListener('click', () => {
  emojiContainer.classList.add('hidden');
});

emojiPicker.addEventListener('emoji-click', (e) => {
  input.value += e.detail.emoji;
});

// Settings
settingsBtn.addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
});

closeSettingsButton.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

publicChatButton.addEventListener('click', () => {
  privateRecipient = null;
  chatType.innerText = 'Public Chat';
  currentChatWith.innerText = 'No one';
  settingsModal.classList.add('hidden');
});

startPrivateChatButton.addEventListener('click', () => {
  privateRecipient = privateChatInput.value.trim();
  if (privateRecipient) {
    chatType.innerText = `Private Chat with ${privateRecipient}`;
    currentChatWith.innerText = privateRecipient;
    settingsModal.classList.add('hidden');
  }
});

changeUsernameButton.addEventListener('click', () => {
  const newUsername = changeUsernameInput.value.trim();
  if (allowedNames.includes(newUsername)) {
    socket.emit('change username', newUsername);
    username = newUsername;
    localStorage.setItem('username', username);
  } else {
    alert('Invalid username!');
  }
});

function updateOnlineUsersList(users) {
  onlineUsersList.innerHTML = '';
  users.forEach(user => {
    const li = document.createElement('li');
    li.textContent = user;
    onlineUsersList.appendChild(li);
  });
}

// Typing indicator
input.addEventListener('input', () => {
  socket.emit('typing', username);
});

socket.on('typing', (user) => {
  typingIndicator.textContent = `${user} is typing...`;
});

socket.on('stop typing', () => {
  typingIndicator.textContent = '';
});

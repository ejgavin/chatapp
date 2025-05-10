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
typingIndicator.classList.add('text-sm', 'text-gray-500', 'h-5', 'mb-2', 'px-2');
messages.parentElement.insertBefore(typingIndicator, messages.nextSibling);

let username = localStorage.getItem('username') || '';

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

function sendMessage() {
  if (input.value.trim()) {
    const message = {
      username,
      text: input.value,
      privateRecipient,
    };
    socket.emit('send message', message);
    input.value = '';
  }
}

sendButton.addEventListener('click', sendMessage);
input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

emojiBtn.addEventListener('click', () => {
  emojiContainer.classList.toggle('hidden');
});

closeEmojiBtn.addEventListener('click', () => {
  emojiContainer.classList.add('hidden');
});

socket.on('receive message', (message) => {
  const { username, text, privateRecipient } = message;
  const messageElement = document.createElement('div');
  messageElement.classList.add('p-2', 'border-b');
  if (privateRecipient) {
    messageElement.classList.add('bg-gray-100');
  }
  messageElement.innerHTML = `<strong>${username}:</strong> ${text}`;
  messages.appendChild(messageElement);
  messages.scrollTop = messages.scrollHeight;
});

socket.on('online users', (users) => {
  onlineUsersList.innerHTML = '';
  users.forEach((user) => {
    const listItem = document.createElement('li');
    listItem.textContent = user;
    onlineUsersList.appendChild(listItem);
  });
});

settingsBtn.addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
});

closeSettingsButton.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

startPrivateChatButton.addEventListener('click', () => {
  const recipient = privateChatInput.value.trim();
  if (recipient) {
    privateRecipient = recipient;
    chatType.textContent = `Private Chat with ${privateRecipient}`;
    currentChatWith.textContent = privateRecipient;
    settingsModal.classList.add('hidden');
    socket.emit('start private chat', recipient);
  }
});

publicChatButton.addEventListener('click', () => {
  privateRecipient = null;
  chatType.textContent = 'Public Chat';
  currentChatWith.textContent = 'No one';
  settingsModal.classList.add('hidden');
});

changeUsernameButton.addEventListener('click', () => {
  const newUsername = changeUsernameInput.value.trim();
  if (newUsername) {
    username = newUsername;
    localStorage.setItem('username', username);
    socket.emit('change username', username);
  }
});

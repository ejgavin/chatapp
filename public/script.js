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

// Error message element
const errorMessageElement = document.createElement('div');
errorMessageElement.classList.add('text-red-500', 'mt-2');
usernameScreen.appendChild(errorMessageElement);

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
  const enteredUsername = capitalizeFirstLetter(usernameInput.value.trim());

  // Ensure valid username
  if (!allowedNames.includes(enteredUsername)) {
    errorMessageElement.textContent = "You must use your real name!";
    return;
  }

  username = enteredUsername;
  localStorage.setItem('username', username);

  usernameScreen.classList.add('hidden');
  chatUI.classList.remove('hidden');

  socket.emit('user-joined', { username });
}

function sendMessage() {
  const message = input.value.trim();

  if (message !== '') {
    socket.emit('chat-message', {
      message,
      username,
      recipient: privateRecipient,
    });

    input.value = ''; // Clear the input after sending
  }
}

function showTypingIndicator(isTyping) {
  typingIndicator.textContent = isTyping ? `${privateRecipient ? privateRecipient : "Public"} is typing...` : '';
}

// Event Listeners
enterChatBtn.addEventListener('click', enterChat);
sendButton.addEventListener('click', sendMessage);

emojiBtn.addEventListener('click', () => emojiContainer.classList.toggle('hidden'));
closeEmojiBtn.addEventListener('click', () => emojiContainer.classList.add('hidden'));

publicChatButton.addEventListener('click', () => {
  privateRecipient = null;
  chatType.textContent = 'Public Chat';
  currentChatWith.textContent = 'No one';
  socket.emit('join-public-chat');
  settingsModal.classList.add('hidden');
});

publicChatButtonTop.addEventListener('click', () => {
  privateRecipient = null;
  chatType.textContent = 'Public Chat';
  currentChatWith.textContent = 'No one';
  socket.emit('join-public-chat');
});

settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));

closeSettingsButton.addEventListener('click', () => settingsModal.classList.add('hidden'));

startPrivateChatButton.addEventListener('click', () => {
  const privateChatWith = privateChatInput.value.trim();
  if (privateChatWith) {
    privateRecipient = privateChatWith;
    chatType.textContent = 'Private Chat';
    currentChatWith.textContent = privateRecipient;
    socket.emit('start-private-chat', privateRecipient);
    settingsModal.classList.add('hidden');
  }
});

changeUsernameButton.addEventListener('click', () => {
  const newUsername = changeUsernameInput.value.trim();
  if (allowedNames.includes(newUsername)) {
    username = newUsername;
    localStorage.setItem('username', username);
    settingsModal.classList.add('hidden');
  }
});

socket.on('chat-message', (data) => {
  const { message, username, recipient } = data;
  const msgElement = document.createElement('div');
  msgElement.classList.add('p-2', 'mb-2', 'bg-gray-100', 'rounded-lg');
  msgElement.innerHTML = `<strong>${username}</strong>: ${message}`;
  messages.appendChild(msgElement);
  messages.scrollTop = messages.scrollHeight;
});

socket.on('private-message', (data) => {
  const { message, sender } = data;
  const msgElement = document.createElement('div');
  msgElement.classList.add('p-2', 'mb-2', 'bg-blue-100', 'rounded-lg');
  msgElement.innerHTML = `<strong>${sender}</strong> (Private): ${message}`;
  messages.appendChild(msgElement);
  messages.scrollTop = messages.scrollHeight;
});

socket.on('user-joined', (username) => {
  const userElement = document.createElement('li');
  userElement.textContent = username;
  onlineUsersList.appendChild(userElement);
});

socket.on('user-left', (username) => {
  const userElements = [...onlineUsersList.children];
  const userElement = userElements.find(element => element.textContent === username);
  if (userElement) {
    userElement.remove();
  }
});

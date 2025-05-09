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

function getRandomColor() {
  let color;
  do {
    color = "#" + Math.floor(Math.random() * 16777215).toString(16);
  } while (color.toLowerCase() === "#ffffff");
  return color;
}

function sanitize(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function enterChat() {
  const enteredUsername = usernameInput.value.trim();
  if (enteredUsername) {
    username = enteredUsername;
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

socket.on('chat history', (history) => {
  history.forEach(msg => displayMessage(msg));
});

socket.on('chat message', msg => displayMessage(msg));

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

socket.on('typing', data => {
  typingIndicator.textContent = data.isTyping ? `${data.user} is typing...` : '';
  chatType.textContent = privateRecipient ? 'Private Chat' : 'Public Chat';
  currentChatWith.textContent = privateRecipient ? privateRecipient : 'No one';
});

socket.on('update users', users => {
  onlineUsersList.innerHTML = '';
  users.forEach(user => {
    if (user.username === username) return;

    const userItem = document.createElement('li');
    userItem.classList.add('relative', 'group');
    userItem.innerHTML = `
      <button class="text-blue-600 underline hover:text-blue-800" data-username="${user.username}">
        ${user.username}
      </button>
    `;
    userItem.querySelector('button').addEventListener('click', () => {
      privateRecipient = user.username;
      logChatMessage(`Started private chat with ${user.username}`);
      chatType.textContent = 'Private Chat';
      currentChatWith.textContent = privateRecipient;
    });
    onlineUsersList.appendChild(userItem);
  });
});

emojiBtn.addEventListener('click', () => {
  emojiContainer.classList.remove('hidden');
});

emojiPicker.addEventListener('emoji-click', (event) => {
  input.value += event.detail.unicode;
});

closeEmojiBtn.addEventListener('click', () => {
  emojiContainer.classList.add('hidden');
});

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
  if (newUsername) {
    socket.emit('username changed', newUsername);
    username = newUsername;
    localStorage.setItem('username', username);
    logChatMessage(`Username changed to ${newUsername}`);
    changeUsernameInput.value = '';
    settingsModal.classList.add('hidden');
  } else {
    logChatMessage('Please enter a valid new username.');
  }
});

function displayMessage(msg) {
  const item = document.createElement('div');
  item.classList.add('message-item');
  item.innerHTML = `
    <div class="flex items-center space-x-2 mb-1">
      <div class="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-white text-sm font-bold" style="background-color: ${msg.color}">
        ${msg.avatar}
      </div>
      <span class="text-sm font-medium" style="color: ${msg.color}">${msg.user}</span>
      <span class="text-sm">${sanitize(msg.text)}</span>
    </div>
  `;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}

function logChatMessage(text) {
  const item = document.createElement('div');
  item.classList.add('text-sm', 'text-gray-600', 'italic');
  item.textContent = text;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}

function logPrivateMessage(text) {
  const item = document.createElement('div');
  item.innerHTML = `
    <div class="bg-blue-100 p-2 rounded-md text-right">
      <strong>You: </strong>${sanitize(text)}
    </div>
  `;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}

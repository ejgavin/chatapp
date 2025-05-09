const socket = io();
let privateRecipient = null;

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
typingIndicator.classList.add('text-sm', 'text-gray-500');
messages.appendChild(typingIndicator);

let username = localStorage.getItem('username');
if (!username) {
  username = prompt("Enter your username:");
  if (!username) username = "Anonymous";
  localStorage.setItem('username', username);
}

const color = "#" + Math.floor(Math.random() * 16777215).toString(16);
const avatar = username[0].toUpperCase();
socket.emit('new user', username, color, avatar);

sendButton.addEventListener('click', (e) => {
  e.preventDefault();
  if (input.value.trim()) {
    if (privateRecipient) {
      socket.emit('private message', { recipient: privateRecipient, message: input.value });
      logPrivateMessage(input.value); // Log private message sent
    } else {
      socket.emit('chat message', input.value);
    }
    socket.emit('typing', false);
    input.value = '';
  }
});

input.addEventListener('input', () => {
  socket.emit('typing', input.value.length > 0);
});

socket.on('chat message', msg => {
  const item = document.createElement('div');
  item.innerHTML = `
    <div class="flex items-start space-x-2">
      <div class="w-8 h-8 rounded-full text-white flex items-center justify-center text-sm" style="background:${msg.color}">${msg.avatar}</div>
      <div>
        <div class="text-sm font-semibold" style="color:${msg.color}">${msg.user} <span class="text-xs text-gray-400 ml-2">${msg.time}</span></div>
        <div>${msg.text}</div>
      </div>
    </div>
  `;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
});

socket.on('private message', msg => {
  const item = document.createElement('div');
  item.innerHTML = `
    <div class="bg-green-100 p-2 rounded-md">
      <strong>Private from ${msg.user}: </strong>${msg.text}
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
  onlineUsersList.innerHTML = ''; // Clear the list of users
  users.forEach(user => {
    if (user.username === username) return; // Skip the current user

    const userItem = document.createElement('li');
    userItem.classList.add('relative', 'group');
    userItem.innerHTML = `
      <button class="text-blue-600 underline hover:text-blue-800" data-username="${user.username}">
        ${user.username}
      </button>
    `;

    const nameBtn = userItem.querySelector('button');
    nameBtn.addEventListener('click', () => {
      privateRecipient = user.username; // Set the private recipient to the clicked user's username
      logChatMessage(`Started private chat with ${user.username}`); // Log the start of the private chat
      chatType.textContent = 'Private Chat'; // Change chat type to private
      currentChatWith.textContent = privateRecipient; // Display the private recipient
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
    logChatMessage(`Started private chat with ${privateRecipient}`); // Log the start of the private chat
    settingsModal.classList.add('hidden');
    chatType.textContent = 'Private Chat';
    currentChatWith.textContent = privateRecipient;
  } else {
    logChatMessage('Please enter a valid username'); // Log the message asking for valid username
  }
});

function switchToPublicChat() {
  privateRecipient = null;
  logChatMessage('Switched to public chat'); // Log the switch to public chat
  chatType.textContent = 'Public Chat';
  currentChatWith.textContent = 'No one';
}

publicChatButton.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
  switchToPublicChat();
});

publicChatButtonTop.addEventListener('click', () => {
  switchToPublicChat();
});

changeUsernameButton.addEventListener('click', () => {
  const newUsername = changeUsernameInput.value.trim();
  if (newUsername) {
    username = newUsername;
    localStorage.setItem('username', newUsername);
    socket.emit('username changed', newUsername);
    logChatMessage(`Username changed to ${newUsername}`); // Log the username change in the chat
    settingsModal.classList.add('hidden');
  }
});

// Function to log general chat messages
function logChatMessage(message) {
  const logItem = document.createElement('div');
  logItem.innerHTML = `
    <div class="text-xs text-gray-500 italic p-2">
      ${message}
    </div>
  `;
  messages.appendChild(logItem);
  messages.scrollTop = messages.scrollHeight;
}

// Function to log private messages with the recipient's name
function logPrivateMessage(message) {
  const logItem = document.createElement('div');
  logItem.innerHTML = `
    <div class="text-xs text-gray-500 italic p-2">
      You sent to ${privateRecipient}: ${message}
    </div>
  `;
  messages.appendChild(logItem);
  messages.scrollTop = messages.scrollHeight;
}

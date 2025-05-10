const socket = io();

// Listen for the 'shutdown initiated' event
socket.on('shutdown initiated', () => {
  // Create a full-screen overlay with the shutdown message
  const shutdownOverlay = document.createElement('div');
  shutdownOverlay.style.position = 'fixed';
  shutdownOverlay.style.top = 0;
  shutdownOverlay.style.left = 0;
  shutdownOverlay.style.width = '100vw';
  shutdownOverlay.style.height = '100vh';
  shutdownOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  shutdownOverlay.style.color = 'white';
  shutdownOverlay.style.display = 'flex';
  shutdownOverlay.style.justifyContent = 'center';
  shutdownOverlay.style.alignItems = 'center';
  shutdownOverlay.style.fontSize = '3rem';
  shutdownOverlay.style.zIndex = 1000;
  shutdownOverlay.innerText = '🚨 Admin has initiated shutdown.';

  // Append the overlay to the body
  document.body.appendChild(shutdownOverlay);

  // Optionally, disable interaction with the page during shutdown
  document.body.style.pointerEvents = 'none';
});

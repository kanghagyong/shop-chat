const { contextBridge, ipcRenderer } = require('electron');

// Seed the admin token/site filter into localStorage *before* admin.html's own
// script runs, using the URL hash (never sent to the server, unlike a query
// string) so the page never falls back to its window.prompt() flow — which
// hangs inside Electron's renderer.
const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
if (hashParams.has('token')) {
  const seedToken = hashParams.get('token');
  if (seedToken) localStorage.setItem('shopChatAdminToken', seedToken);
}
// Seed even when blank (blank = "show all sites") — admin.html only prompts
// when this key is entirely absent (localStorage.getItem returns null).
if (hashParams.has('site')) {
  localStorage.setItem('shopChatAdminSite', hashParams.get('site'));
}

contextBridge.exposeInMainWorld('shopChatDesktop', {
  notify: (title, body, conversationKey) =>
    ipcRenderer.send('new-message-notification', { title, body, conversationKey }),
  onNotificationClick: (callback) =>
    ipcRenderer.on('notification-clicked', (event, conversationKey) => callback(conversationKey)),
});

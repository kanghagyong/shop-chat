const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shopChatDesktop', {
  notify: (title, body, conversationKey) =>
    ipcRenderer.send('new-message-notification', { title, body, conversationKey }),
  onNotificationClick: (callback) =>
    ipcRenderer.on('notification-clicked', (event, conversationKey) => callback(conversationKey)),
});

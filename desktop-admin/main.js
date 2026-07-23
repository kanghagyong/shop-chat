const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, session, nativeImage } = require('electron');
const path = require('path');

const BASE_URL = process.env.SHOP_CHAT_ADMIN_URL || 'https://monitor.betterwaysys.com/s-chat/admin.html';
const SITE = process.env.SHOP_CHAT_SITE || '';
const ADMIN_URL = SITE ? `${BASE_URL}?site=${encodeURIComponent(SITE)}` : BASE_URL;

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(ADMIN_URL);

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  tray = new Tray(icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('ShopChat Admin');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '열기',
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        },
      },
      {
        label: '종료',
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on('click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'notifications');
  });

  createWindow();
  createTray();

  ipcMain.on('new-message-notification', (event, { title, body, conversationKey }) => {
    if (!Notification.isSupported()) return;

    const notification = new Notification({ title, body });
    notification.on('click', () => {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('notification-clicked', conversationKey);
    });
    notification.show();
  });
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

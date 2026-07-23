const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, session, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.SHOP_CHAT_ADMIN_URL || 'https://monitor.betterwaysys.com/s-chat/admin.html';
const FIXED_SITE = process.env.SHOP_CHAT_SITE || '';
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

let mainWindow;
let settingsWindow;
let tray;

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    return {};
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config));
}

function buildAdminUrl(config) {
  const site = FIXED_SITE || config.site || '';
  const hash = new URLSearchParams({ token: config.token || '', site }).toString();
  return `${BASE_URL}#${hash}`;
}

function createMainWindow(config) {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(buildAdminUrl(config));

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 420,
    height: 340,
    resizable: false,
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
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
        label: '설정 변경',
        click: () => {
          createSettingsWindow();
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

  ipcMain.on('save-settings', (event, config) => {
    saveConfig(config);
    if (settingsWindow) {
      settingsWindow.close();
      settingsWindow = null;
    }
    if (mainWindow) {
      mainWindow.loadURL(buildAdminUrl(config));
      mainWindow.show();
    } else {
      createMainWindow(config);
      createTray();
    }
  });

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

  const config = loadConfig();
  if (!config.token) {
    createSettingsWindow();
  } else {
    createMainWindow(config);
    createTray();
  }
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');
const bcrypt = require('bcryptjs');
const pool = require('./db');
const { translateMessage } = require('./translate');

const MySQLStore = MySQLStoreFactory(session);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const HISTORY_LIMIT = 50;

const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
});

function getClientIp(headers, fallbackAddress) {
  const forwarded = headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return (fallbackAddress || '').replace(/^::ffff:/, '');
}

function isAllowedAdminIp(ip) {
  const allowed = (process.env.ADMIN_ALLOWED_IPS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return allowed.includes(ip);
}

function requireAdminIp(req, res, next) {
  if (!isAllowedAdminIp(getClientIp(req.headers, req.socket.remoteAddress))) {
    return res.status(403).send('Forbidden');
  }
  next();
}

function sanitizeSite(site) {
  if (typeof site !== 'string') return null;
  const trimmed = site.trim().slice(0, 50);
  return /^[a-zA-Z0-9_-]+$/.test(trimmed) ? trimmed : null;
}

const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const UPLOAD_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 3;
const IMAGE_EXTENSION_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};
const UPLOADED_IMAGE_PATH = /^uploads\/[0-9a-f-]+\.(jpg|png|gif|webp)$/;

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + IMAGE_EXTENSION_BY_MIME[file.mimetype]),
  }),
  fileFilter: (req, file, cb) => cb(null, Boolean(IMAGE_EXTENSION_BY_MIME[file.mimetype])),
  limits: { fileSize: 5 * 1024 * 1024 },
});

async function cleanupOldUploads() {
  let files;
  try {
    files = await fs.promises.readdir(UPLOAD_DIR);
  } catch (err) {
    return;
  }

  const now = Date.now();
  await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(UPLOAD_DIR, file);
      try {
        const stats = await fs.promises.stat(filePath);
        if (now - stats.mtimeMs > UPLOAD_MAX_AGE_MS) {
          await fs.promises.unlink(filePath);
        }
      } catch (err) {
        console.error('failed to clean up upload:', file, err.message);
      }
    })
  );
}

cleanupOldUploads();
setInterval(cleanupOldUploads, 1000 * 60 * 60);

app.use(sessionMiddleware);
app.use(express.json());
app.get('/admin.html', requireAdminIp, (req, res, next) => next());
app.use(express.static(path.join(__dirname, 'public')));
io.engine.use(sessionMiddleware);

async function fetchHistory(conversationKey) {
  const [rows] = await pool.query(
    'SELECT sender, message, message_type, translated_text, created_at FROM chat_message WHERE conversation_key = ? ORDER BY id DESC LIMIT ?',
    [conversationKey, HISTORY_LIMIT]
  );
  return rows.reverse();
}

function parseConversationKey(conversationKey) {
  if (conversationKey.startsWith('member_')) {
    return { memberType: 'member', userId: Number(conversationKey.slice('member_'.length)), guestId: null };
  }
  if (conversationKey.startsWith('guest_')) {
    return { memberType: 'guest', userId: null, guestId: conversationKey.slice('guest_'.length) };
  }
  return { memberType: null, userId: null, guestId: null };
}

async function resolveTargetLanguage(conversationKey, sender) {
  if (sender === 'user') return 'ko';

  const [[lastUserMessage]] = await pool.query(
    "SELECT detected_lang FROM chat_message WHERE conversation_key = ? AND sender = 'user' AND detected_lang IS NOT NULL ORDER BY id DESC LIMIT 1",
    [conversationKey]
  );
  if (!lastUserMessage || lastUserMessage.detected_lang === 'ko') return null;
  return lastUserMessage.detected_lang;
}

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const [rows] = await pool.query('SELECT id, username, password FROM user WHERE username = ?', [username]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'invalid credentials' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ id: user.id, username: user.username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.post('/api/upload', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: '지원하지 않는 파일입니다 (jpg, png, gif, webp만 가능)' });
    res.json({ url: `uploads/${req.file.filename}` });
  });
});

app.get('/api/me', (req, res) => {
  if (req.session.userId) {
    res.json({ loggedIn: true, userId: req.session.userId, username: req.session.username });
  } else {
    res.json({ loggedIn: false });
  }
});

function isValidAdminToken(token) {
  return typeof token === 'string' && token.length > 0 && token === process.env.ADMIN_TOKEN;
}

app.get('/api/conversations', requireAdminIp, async (req, res) => {
  if (!isValidAdminToken(req.get('x-admin-token'))) {
    return res.status(403).json({ error: 'invalid admin token' });
  }

  const siteFilter = sanitizeSite(req.query.site);
  const [rows] = await pool.query(
    `SELECT conversation_key,
            MAX(member_type) AS member_type,
            MAX(user_id) AS user_id,
            MAX(guest_id) AS guest_id,
            MAX(site) AS site,
            MAX(created_at) AS last_message_at
     FROM chat_message
     WHERE conversation_key != 'legacy'${siteFilter ? ' AND site = ?' : ''}
     GROUP BY conversation_key
     ORDER BY last_message_at DESC`,
    siteFilter ? [siteFilter] : []
  );

  const memberIds = [...new Set(rows.filter((r) => r.member_type === 'member').map((r) => r.user_id))];
  let usernames = {};
  if (memberIds.length) {
    const [users] = await pool.query('SELECT id, username FROM user WHERE id IN (?)', [memberIds]);
    usernames = Object.fromEntries(users.map((u) => [u.id, u.username]));
  }

  const conversations = rows.map((r) => ({
    conversationKey: r.conversation_key,
    memberType: r.member_type,
    label:
      r.member_type === 'member'
        ? `[회원] ${usernames[r.user_id] || `#${r.user_id}`}`
        : `[${r.site || '비회원'}] ${r.guest_id}`,
    lastMessageAt: r.last_message_at,
  }));

  res.json(conversations);
});

io.on('connection', async (socket) => {
  console.log(`client connected: ${socket.id}`);

  const query = socket.handshake.query;
  const role = query.role === 'admin' ? 'admin' : 'user';

  if (role === 'admin') {
    const clientIp = getClientIp(socket.handshake.headers, socket.handshake.address);
    if (!isAllowedAdminIp(clientIp) || !isValidAdminToken(query.adminToken)) {
      socket.disconnect();
      return;
    }
  }

  socket.data.role = role;

  if (role === 'user') {
    const session = socket.request.session;

    if (session && session.userId) {
      socket.data.memberType = 'member';
      socket.data.userId = session.userId;
      socket.data.guestId = null;
      socket.data.conversationKey = `member_${session.userId}`;
    } else {
      const guestId = query.guestId;
      if (!guestId) {
        socket.disconnect();
        return;
      }
      socket.data.memberType = 'guest';
      socket.data.userId = null;
      socket.data.guestId = guestId;
      socket.data.site = sanitizeSite(query.site);
      socket.data.conversationKey = `guest_${guestId}`;
    }

    socket.join(socket.data.conversationKey);
    socket.emit('chat_history', await fetchHistory(socket.data.conversationKey));
  } else {
    socket.on('join_conversation', async (conversationKey) => {
      if (typeof conversationKey !== 'string' || !conversationKey) return;

      [...socket.rooms].forEach((room) => {
        if (room !== socket.id) socket.leave(room);
      });
      socket.join(conversationKey);
      socket.data.conversationKey = conversationKey;

      socket.emit('chat_history', await fetchHistory(conversationKey));
    });
  }

  socket.on('send_message', async ({ message, conversationKey: targetKey, messageType }) => {
    if (typeof message !== 'string' || !message.trim()) return;

    const type = messageType === 'image' && UPLOADED_IMAGE_PATH.test(message) ? 'image' : 'text';

    let conversationKey;
    let sender;

    if (socket.data.role === 'user') {
      conversationKey = socket.data.conversationKey;
      sender = 'user';
    } else {
      conversationKey = targetKey || socket.data.conversationKey;
      if (!conversationKey) return;
      sender = 'admin';
    }

    const { memberType, userId, guestId } = parseConversationKey(conversationKey);

    let site = socket.data.role === 'user' ? socket.data.site || null : null;
    if (!site) {
      const [[siteRow]] = await pool.query(
        'SELECT site FROM chat_message WHERE conversation_key = ? AND site IS NOT NULL ORDER BY id DESC LIMIT 1',
        [conversationKey]
      );
      site = siteRow ? siteRow.site : null;
    }

    let detectedLanguage = null;
    let translatedText = null;
    if (type === 'text') {
      const targetLanguage = await resolveTargetLanguage(conversationKey, sender);
      if (targetLanguage) {
        try {
          ({ detectedLanguage, translatedText } = await translateMessage(message, targetLanguage));
        } catch (err) {
          console.error('translation failed:', err.message);
        }
      }
    }

    const [result] = await pool.query(
      'INSERT INTO chat_message (sender, conversation_key, member_type, user_id, guest_id, site, message, message_type, detected_lang, translated_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [sender, conversationKey, memberType, userId, guestId, site, message, type, detectedLanguage, translatedText]
    );
    const [[saved]] = await pool.query(
      'SELECT sender, message, message_type, translated_text, created_at FROM chat_message WHERE id = ?',
      [result.insertId]
    );

    socket.to(conversationKey).emit('receive_message', saved);
    io.emit('conversation_activity', {
      conversationKey,
      sender,
      site,
      message: saved.message,
      messageType: saved.message_type,
      translatedText: saved.translated_text,
    });
  });

  socket.on('disconnect', () => {
    console.log(`client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`);
});

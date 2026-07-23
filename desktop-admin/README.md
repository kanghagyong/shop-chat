# ShopChat Admin (Desktop)

Windows desktop wrapper around the existing web admin console
(`public/admin.html`). Loads the same page in an Electron window, adds a
system tray icon, and shows a native Windows notification whenever a new
customer message arrives — clicking the notification brings the window to
the front and opens that conversation.

No chat logic lives here; it's a thin shell. All the actual behavior (login
token, site filter, translations, message list) is the same web page you
already use in a browser.

## Configure

Set these before running/building if you need something other than the
defaults:

| Env var | Default | Purpose |
|---|---|---|
| `SHOP_CHAT_ADMIN_URL` | `https://monitor.betterwaysys.com/s-chat/admin.html` | Which admin page to load |
| `SHOP_CHAT_SITE` | (none) | If set, appended as `?site=...` so this install only ever shows one storefront's conversations (locks the site filter in the UI too) |

To ship a build permanently locked to one site (e.g. one desktop install per
storefront), set `SHOP_CHAT_SITE` in the environment used for `npm run build`
— Windows doesn't persist env vars into the packaged app automatically, so
for a fixed per-site build, hardcode the value in `main.js`'s `SITE` constant
instead of relying on an env var at runtime.

## Run in development

```sh
npm install
npm start
```

## Build the Windows installer

**Run this on an actual Windows machine**, not inside WSL2 — electron-builder's
Windows (NSIS) target needs Wine to cross-build from Linux, which isn't set
up here.

```powershell
cd desktop-admin
npm install
npm run build
```

The installer (`.exe`) is written to `desktop-admin/dist/`.

## Notes

- Closing the window minimizes to the tray instead of quitting, so it keeps
  listening for new messages in the background. Use the tray icon's "종료"
  to actually quit.
- The admin token and site filter prompts are the same `prompt()` dialogs as
  the web version — Electron supports them natively, nothing special was
  added for this app.
- `icon.png` is a placeholder solid-color icon — swap it for a real one
  before distributing.

# House Monitor

A top-down map of your house where things visibly decay as chores go undone and
recover when you do them. It's an offline-first web app (PWA) with no server: everything
lives in the browser's IndexedDB on your device.

- Design: [`House Decay App — Architecture & Roadmap.md`](House%20Decay%20App%20—%20Architecture%20&%20Roadmap.md)
- Current plan and decisions: [`docs/phase-0-plan.md`](docs/phase-0-plan.md)
- Code conventions and architecture rules: [`CLAUDE.md`](CLAUDE.md)

## Requirements

- Node 22 or newer (developed on Node 24)
- npm
- Google Chrome, only for the screenshot and icon scripts

```sh
npm install
```

## Development

```sh
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173/).

- **Demo house:** a dev build with an empty database seeds a sample house so there's something
  to look at.
- **First run:** open http://localhost:5173/?empty. It uses a separate scratch database that's
  wiped on every load, so each visit starts at the welcome screen and your demo house is left
  alone.
- **Starting over:** your data lives in IndexedDB for that origin. In DevTools go to
  Application → Storage → Clear site data, then reload.
- **No service worker in dev:** it's only registered in production builds, so dev always
  serves fresh code.
- **On a phone:** `npm run dev -- --host` exposes the server on your LAN. That's fine for
  trying the UI, but the service worker and install prompt need HTTPS (see below).

### Checks

```sh
npm test             # Vitest, once
npm run test:watch   # Vitest, watching
npm run typecheck    # app and build tooling
```

### Tools

```sh
# Headless-Chrome screenshot plus console output (dev server must be running)
npm run screenshot -- http://localhost:5173/ out.png [light|dark]

# Re-render the PNG app icons after editing public/icons/icon.svg
npm run icons
```

## Production

### Build

```sh
npm run build
```

This typechecks and writes a static site to `dist/`. The build also generates `dist/sw.js`
(the service worker) from `build/sw.template.js`. It precaches every built file, so the app
works offline after the first visit.

Paths are relative (`base: './'`), so `dist/` can be served from a domain root or from a
subfolder.

### Try the production build locally

```sh
npm run build && npm run preview
```

Open the URL it prints (usually http://localhost:4173/). `localhost` counts as a secure
context, so the service worker, offline mode and the update prompt all work here. To test an
update, rebuild while the page is open, then switch back to the tab. An "Update available ·
Reload" toast appears, and the new version loads when you tap Reload.

### Deploy

Upload the contents of `dist/` to any static host that serves **HTTPS**, such as GitHub Pages,
Netlify, Cloudflare Pages, or a server of your own behind TLS. Service workers don't run over
plain HTTP, except on `localhost`.

No server-side configuration is needed. If your host lets you set cache headers, serve
`sw.js` with `Cache-Control: no-cache` so browsers check for updates promptly. Most hosts
already revalidate it.

### Install on a phone

1. Open the deployed URL.
2. **iOS:** Share → Add to Home Screen. **Android/Chrome:** menu → Install app.
3. Open the app from the home screen **before** entering your house. On iOS, the installed
   app keeps its own storage, separate from Safari's, so a house set up in a Safari tab won't
   appear in the installed app.

### Moving a house to another device

You can draw the house on a computer with a mouse, then move it to your phone:

1. On the computer: Settings → Export backup.
2. Get the file to the phone (AirDrop, iCloud Drive, email).
3. On the phone, open the installed app for the first time and choose **Restore from
   backup…** on the welcome screen.

This is a one-time copy, not sync: afterwards each device keeps its own log. Pick one device
(the phone) as the house's home from then on.

### Backups

All data is on-device. Open Settings (top right of the map) → Export backup to download a JSON
file. Importing a backup merges it into the current house; it never deletes anything. Export
one after setting up your house and now and then afterwards.

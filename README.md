# Tesla Manager

A desktop app for browsing, reviewing, and exporting Tesla dashcam footage. Point it at your `TeslaCam` folders on a USB drive or local copy, and manage saved events from one place.

## Download

Pre-built Windows installers are published automatically on every push to `main`.

**[Download the latest release](https://github.com/YOUR_GITHUB_USERNAME/teslamanager/releases/latest)**

| Platform | File |
| --- | --- |
| Windows (x64) | `Tesla-Manager-Setup-x.x.x.exe` |

No account or sign-up required. Pick the newest release, download the installer, and run it.

## Features

### Library and scanning

- Scan one or more TeslaCam root folders (USB drive or copied archive)
- Automatic rescan on startup when folders are configured
- Live scan progress with folder and event counts
- Reads Tesla `event.json` metadata (timestamp, city, GPS, trigger reason)
- Thumbnail previews when available

### Browse and search

- Filter by event type: Sentry, manual saves, vehicle events, and other
- Filter by date: today, last 7 days, last 30 days, custom range, or all time
- Search by city, coordinates, custom title, or timestamp
- Library views: all clips, favourites, and archive
- List layouts: minimal, default, and thumbnails
- Clips grouped by date in the sidebar

### Multi-camera playback

- Synchronized playback across all six Tesla cameras (front, rear, pillars, repeaters)
- Grid layout with click-to-focus hero view and filmstrip
- Event marker on the timeline
- Adjustable in/out markers for trimmed playback
- Configurable lead and trail seconds before and after the event
- Variable playback speed
- Custom titles for clips

### Clip management

- Mark clips as favourites
- Archive clips to hide them from the main library
- Permanently delete event folders from disk (with confirmation)
- Keyboard navigation between filtered clips

### Export

- Export trimmed clips with FFmpeg (bundled, no separate install)
- Single camera or full six-camera grid export
- Respects in/out markers and playback speed
- Save to a chosen export folder or copy directly to the clipboard
- Export progress indicator with cancel support
- Reveal exported files in Explorer

### Desktop experience

- Native frameless window with custom title bar (minimize, maximize, fullscreen, close)
- Fast local video streaming via a custom asset protocol
- Settings and library metadata stored locally on your machine

## Development

### Requirements

- Node.js 22+
- Yarn 4 (Corepack)

### Setup

```bash
corepack enable
yarn install
```

### Run in development

```bash
yarn dev
```

This starts the Vite dev server, rebuilds the Electron main process on change, and launches the app.

### Build from source

```bash
yarn build
```

### Package a Windows installer

```bash
yarn dist
```

Installers are written to the `release/` directory at the repo root.

## Project structure

```
packages/
  client/    Vue 3 UI (Vite)
  desktop/   Electron main process, IPC, scanning, export
```

## Tech stack

- **UI:** Vue 3, Pinia, Vue Router, Vite, Sass
- **Desktop:** Electron, electron-store
- **Media:** ffmpeg-static, ffprobe-static

## License

Private project. All rights reserved unless a license file is added later.

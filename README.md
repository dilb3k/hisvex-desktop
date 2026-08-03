# Hisvex Desktop

Desktop application for Hisvex — bar/cafe inventory & sales management.

Built with Electron + React + Vite + Tailwind CSS.

## Prerequisites

- Node.js >= 20
- npm

## Setup

```bash
cd desktop
npm install
```

## Development

Starts Vite dev server and Electron simultaneously:

```bash
npm run dev
```

Or run separately:

```bash
npm run dev:renderer    # Vite dev server on :5173
npm run dev:electron    # Electron (requires renderer running)
```

## Build

Compiles renderer (Vite) and Electron (TypeScript):

```bash
npm run build
```

Output:
- `build/renderer/` — compiled React app
- `build/electron/` — compiled main + preload scripts

## Package

### Windows Setup.exe

```bash
npm run package:win
```

Output: `dist/Hisvex-Setup-1.0.0.exe`

### Windows MSI

```bash
npm run package:win:msi
```

Output: `dist/Hisvex-1.0.0.msi`

### macOS DMG

```bash
npm run package:mac
```

Output: `dist/Hisvex-1.0.0-x64.dmg` (Intel) or `dist/Hisvex-1.0.0-arm64.dmg` (Apple Silicon)

### All platforms

```bash
npm run package:all
```

## Installer Configuration

Edit `electron-builder.yml` for:
- Code signing (Windows: `certificateFile`, macOS: Xcode signing identity)
- App icon: place `build/icon.png` (512x512 minimum)
- Installer behavior (per-machine, shortcuts, etc.)

## Project Structure

```
desktop/
├── electron/                # Electron main process
│   ├── main.ts             # App entry, window creation
│   ├── preload.ts          # Secure IPC bridge
│   └── ipc.ts              # IPC handlers
├── src/                     # Renderer (React app)
│   ├── App.tsx             # Root component + routing
│   ├── main.tsx            # Entry point
│   ├── electron.d.ts       # Electron API types
│   ├── types.ts            # Shared type definitions
│   ├── api/client.ts       # Axios API client
│   ├── store/              # Zustand stores
│   │   ├── authStore.ts
│   │   └── appStore.ts
│   ├── screens/            # Page components
│   ├── components/         # Shared UI components
│   └── styles/globals.css  # Tailwind + base styles
├── public/
│   └── index.html
├── build/                   # Build output (gitignored)
├── dist/                    # Packaged installers (gitignored)
├── package.json
├── electron-builder.yml     # Electron Builder config
├── vite.config.ts
├── tsconfig.json
└── tsconfig.electron.json
```

## Security

- Context isolation: enabled
- Node integration: disabled
- Sandbox: enabled for renderer
- IPC via contextBridge only
- CSP headers in HTML
- Secure credential storage via electron-store (encrypted)

# Eranos

Power to the people.

Eranos is a Nostr client focused on community ownership, expressive identity, and censorship resistance. This repository is the Eranos-branded app, a Grin-only fork of Agora (itself built from the Ditto codebase). All Bitcoin and Lightning payment rails have been removed; Grin payments land in a later phase.

**[eranos.fund](https://eranos.fund)** | **Upstream: [Agora](https://gitlab.com/soapbox-pub/agora-3)**

## What This Repo Is

- Eranos product identity (name, theme, assets, native IDs)
- Ditto-derived implementation with broad Nostr feature coverage
- Configurable deployment defaults via `eranos.json`

## Features

- **Community-first social client**: notes, articles, comments, reposts, reactions, and rich event rendering
- **Theming system**: built-in presets + custom color/font/background themes that can be shared as events
- **Private messaging**: NIP-04 and NIP-17 direct messages
- **Mobile app shell**: Capacitor-powered Android/iOS wrappers
- **Self-hostable**: static web build + configurable relay and upload infrastructure

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- npm 10.9.4+

### Development

```sh
git clone <this-repo>
cd eranos
npm install
npm run dev
```

Development server: `http://localhost:8080`

### Docker Getting Started

Use Docker Compose when you want the nginx reverse-proxy stack (necessary if you want decryptable media in messages - kind 15s of NIP 17):

```sh
git clone <this-repo>
cd eranos
cp .env.example .env
docker compose up --build
```

Proxy URL: `http://localhost:8083`

This starts:

- `vite` service on the internal Docker network (`vite:8080`)
- `web` service (`nginx`) on host port `8082`, proxying to Vite with websocket support

Stop stack:

```sh
docker compose down
```

Production-style container build:

```sh
docker compose -f docker-compose.prod.yml up --build
```

### Build

```sh
npm run build
```

Build output: `dist/`

### Validate

```sh
npm test
```

This runs type-checking, linting, unit tests, and production build checks.

## Configuration

Build-time config is read from `eranos.json` (gitignored by default so each deployment can provide its own values).

```jsonc
{
  "theme": "dark",
  "relayMetadata": {
    "relays": [
      { "url": "wss://relay.ditto.pub", "read": true, "write": true },
      { "url": "wss://relay.primal.net", "read": true, "write": true },
      { "url": "wss://relay.damus.io", "read": true, "write": true }
    ]
  },
  "blossomServers": [
    "https://blossom.ditto.pub",
    "https://blossom.primal.net/"
  ]
}
```

Configuration priority (highest first):

1. User settings (local storage)
2. Build config (`eranos.json`)
3. Hardcoded app defaults

Use a custom config path:

```sh
CONFIG_FILE=./my-config.json npm run build
```

## Deployment

Eranos builds to static files and can be deployed to any static host.

- GitLab/GitHub Pages
- Netlify/Vercel
- VPS or any web server with SPA routing fallback

For Android:

```sh
npm run build
npx cap sync
npx cap open android
```

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | React 18 |
| Build | Vite |
| Language | TypeScript |
| Styling | TailwindCSS 3 + shadcn/ui |
| Routing | React Router |
| Data | TanStack Query |
| Nostr | Nostrify + nostr-tools |
| Mobile | Capacitor |
| Testing | Vitest + React Testing Library |

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a merge request.

## License

[AGPL-3.0](LICENSE)

🤖 Built with AI pair-programming assistance (Claude)

# Hosting the game server

The server is one Node process. It serves the game page and runs the multiplayer rooms, so friends
just open its address in a browser. It needs Node 20 or newer and no other software.

## Run it on your own computer

```bash
npm ci
npm run build          # builds the game page into dist/
npm run server:build   # bundles the server into dist-server/server.mjs
npm start              # serves on http://localhost:8080
```

`npm run server` runs the server straight from the TypeScript sources instead (no server build step).

Open http://localhost:8080, type a name and press **Host a room**. You get a four-letter room code
and an invite link. Anyone who can reach your computer can join:

- **Same Wi-Fi:** they open `http://<your computer's local IP>:8080/?room=CODE`. Your firewall
  may ask to allow Node.
- **Over the internet:** forward TCP port 8080 on your router to your computer, or put it behind
  a tunnel (for example Cloudflare Tunnel or Tailscale Funnel), then share that address.

## Run it in the cloud

Any host that runs a Docker image or a Node app and supports WebSockets works (Fly.io, Render,
Railway, a small VPS). The repo has a `Dockerfile`:

```bash
docker build -t borpse .
docker run -p 8080:8080 borpse
```

On Render or Railway, create a web service from the repo and pick the Dockerfile. On Fly.io,
`fly launch` detects it. Use an `https://` address: the page then connects with secure
WebSockets (`wss://`) automatically.

A small instance is enough: a room of 8 pigs costs a few percent of one CPU core, and each player
receives roughly 30–60 KB/s.

## Online play on the GitHub Pages site

GitHub Pages only serves files, so the live site needs a game server running somewhere else
(any of the cloud options above). Then:

1. Deploy the server and note its address, e.g. `https://borpse.example.com`.
2. In the GitHub repo: **Settings → Secrets and variables → Actions → Variables → New repository
   variable**, name `GAME_SERVER_URL`, value that address.
3. Re-run the **Deploy to GitHub Pages** workflow (or push to `master`).

The live page then shows **Host a room** and connects to that server. Without the variable it hides
online play and plays solo and with bots, as before. Use an `https://` server address: a page served
over https can't connect to an insecure `ws://` server.

## Settings

| Variable     | Default | What it does |
|--------------|---------|--------------|
| `PORT`       | `8080`  | Port to listen on. |
| `HOST`       | `0.0.0.0` | Interface to listen on. |
| `STATIC_DIR` | `dist`  | Folder with the built game page. |
| `MAX_ROOMS`  | `100`   | Rooms allowed at once. |

`GET /healthz` returns the number of open rooms and connected players.

## Playing from the Vite dev server

Run `npm run server` and `npm run dev` side by side. The dev page (port 5173) connects to the game
server on port 8080 automatically. To point a page at another server, add
`?server=https://your-server.example.com` to its address.

## What doesn't work

- The game hosted as a claude.ai artifact or opened as a local file can't play online: it has no
  server to connect to. It still plays solo and with bot pigs. Any page can be pointed at a server by
  adding `?server=https://your-server.example.com` to its address.
- Rooms live in memory. Restarting the server ends every game in progress.

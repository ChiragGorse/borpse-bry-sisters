# The Borpse Bry Sisters

A 3D farm brawler in the browser. You're Kenji the pig, and Allen B. Hwang is at the gate with a bib
that has your face on it. Headbutt him off the farm before he eats the crops, the pies, and you.

Built with React, Three.js, Tailwind and Vite. Plays solo, with bot pigs, or online with up to 8
players (one of whom can play Allen). Works with keyboard and mouse, gamepads, and touch screens.

**Play it:** <https://chiraggorse.github.io/borpse-bry-sisters/> (once GitHub Pages is switched on;
see [Deploying](#deploying)).

## How to play

Defend the farm through 8 courses, from the Appetizer to The Grand Feast and a finale boss. Between fights, spend truffles at
Rickley's shop and Kingger's lab, learn moves from Trout at the lake, and hunt for truffles and rebel
hogs in haunted Folk Valley. Ring the dinner bell when you're ready for the next course.

### Controls

| Action | Keyboard + mouse | Touch |
|---|---|---|
| Move | `W` `A` `S` `D` | Joystick (lower-left) |
| Look | Mouse (click the game first), arrow keys | Drag anywhere else |
| Headbutt (chain three for a finisher) | Left click / `J` | **BUTT** |
| Hog Charge | Right click / `K` | **DASH** |
| Dodge roll | `Shift` | **ROLL** |
| Jump | `Space` | **JUMP** |
| Abilities (once unlocked) | `Q` `F` `C` `V` `X` `G` or `1`–`6` | Extra buttons appear |
| Talk / use / dig | `E` | Tap the prompt |
| Ask Herb (in Folk Valley) | `R` | Button appears |
| Pause / mute | `Esc` or `P` / `M` | Pause button |

Every key can be rebound in **Settings**, and touch buttons can be moved around. Gamepads work too;
the game shows the controller layout once it sees one.

## Running it locally

Needs Node 20 or newer.

```bash
npm ci
npm run dev
```

Then open <http://localhost:5173>.

`node_modules` is checked into the repo, but it may not match your operating system. If `npm run dev`
fails with "Permission denied" or a missing native module, run `npm ci` again; it reinstalls cleanly.

### Online play locally

Run the game server next to the dev server. The dev page connects to it automatically:

```bash
npm run server
```

```bash
npm run dev
```

Type a name, press **Host a room**, and share the four-letter room code or the invite link. In a
room, other players' names float over their pigs, and the top-right corner shows your ping and where
the server is.

## Deploying

- **Website (GitHub Pages):** `.github/workflows/pages.yml` builds the game and deploys it on every
  push to `master`. Turn it on once under **Settings → Pages → Source: GitHub Actions**.
- **Game server:** a `Dockerfile` is included and runs on Fly.io, Render, Railway or any VPS. To let
  the Pages site use it, set the repository variable `GAME_SERVER_URL` to the server's `https://`
  address and re-run the Pages workflow.

[docs/HOSTING.md](docs/HOSTING.md) covers hosting from your own PC, tunnels, server settings (including
`SERVER_LOCATION` for the ping badge) and what doesn't work.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Builds the game into a single `dist/index.html` |
| `npm run server` | Runs the multiplayer server from source (port 8080) |
| `npm run server:build` / `npm start` | Bundles the server, then runs the bundle |
| `npm run net:test` | End-to-end online test: real server plus several simulated browsers |
| `npm run sim:soak` | Headless bot herd plays the real simulation |
| `npm run allen:test` / `finale:test` / `hunt:test` | Focused simulation tests |

## Project layout

```
src/
  App.tsx            React shell: screens, HUD, touch controls
  game/Game.ts       browser client: rendering, input, camera, effects, sound
  game/sim/          every game rule, with no Three.js or DOM, so the server can run it too
  game/net/          wire protocol and the browser's connection to the game server
  ui/                HUD, menus, shop, settings, touch controls
server/              Node game server: rooms, WebSockets, serves the built page
scripts/             headless tests
docs/                MULTIPLAYER.md (architecture), HOSTING.md (running a server)
```

## Credits

Original game by [allenftc](https://github.com/allenftc/borpse-bry-sisters). This fork adds touch
controls, online multiplayer and GitHub Pages hosting.

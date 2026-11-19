# Multiplayer architecture

Goal: up to 8 players team up against Allen, optionally with one player controlling Allen, on an
authoritative game server.

## Phase 1 (this branch): simulation split from rendering, N players

```
src/game/layout.ts      map constants and collider shapes (no THREE.js)
src/game/sim/types.ts   plain-data entity types, PlayerInput, SimEvent
src/game/sim/Sim.ts     every game rule, for any number of players; no THREE.js, DOM or audio
src/game/sim/botBrain.ts  stand-in players that produce PlayerInput like a person would
src/game/Game.ts        browser client: input → PlayerInput, models synced to sim entities by id,
                        animation, camera, VFX/sound replay, HUD
scripts/sim-soak.ts     headless test: a bot herd plays the real simulation in Node
```

How a frame works in the browser:

1. `Game` turns keyboard/mouse/touch/gamepad into a `PlayerInput` for the local pig
   (`{ mx, mz }` world-space movement plus a bitmask of buttons pressed this frame). Stand-in bots
   produce theirs with `BotBrain`.
2. `sim.step(dt, inputs)` advances the game.
3. `sim.drainEvents()` returns one-shot `SimEvent`s (VFX calls, sounds, floating text, camera shake,
   map changes) that `Game` replays. Events can be addressed to one player (`only`), e.g. the
   "denied" buzz or the shake from your own hit.
4. `Game.syncAll` keeps exactly one 3D model per simulated entity (players, bots, projectiles,
   puddles, jars, hogs…), matched by `id`, and animates it from simulation state.

Every entity in the simulation is plain data with a numeric `id`, and references between entities
are ids, so the state can be serialised for the network.

### Multiplayer rules already in the simulation

- `sim.addPlayer()` / `removePlayer()`; up to 8 pigs, each with its own colour, health, stamina,
  cooldowns, combo flow and interaction prompt.
- Allen fights one pig at a time (`A.focusId`), sticking with his target unless another pig is
  clearly closer; his swipes, slams, dashes, spins and shockwaves hit every pig they catch. Hot-pot
  rain hunts random pigs. Bots and the Path Guppy go for the nearest pig or rebel hog.
- Scaling: Allen gets +60% health and +25% poise per extra pig, +1 sauce jar per two extra pigs,
  and larger kitchen waves. Truffle drops stay tied to his base health.
- A pig at 0 HP is knocked out; the run only ends when every pig is down. Knocked-out pigs get back
  up with 40% health when the course ends (50% when leaving the forest).
- Truffles and upgrades are shared by the herd. Each player opens their own shop; ringing the
  bell or entering the forest pulls everyone out of the shops and moves the whole herd.
- The opening story only plays in single-player.

### Try it

- Browser: add `?bots=6` to the URL to play with six stand-in pigs.
- Node: `npm run sim:soak -- 7 12 7` (players, simulated minutes, seed) runs a bot herd through a
  forest trip and as many courses as it survives, checking for errors, non-finite positions and
  escapes from the map.

## Phase 2 (this branch): game server and online play

```
server/index.ts         HTTP (serves dist/) + WebSocket endpoint /ws?room=CODE&name=NAME, room registry
server/room.ts          one authoritative Sim per room at 30 Hz: players, host, bots, commands, broadcast
server/ws.ts            dependency-free WebSocket server (RFC 6455) on node:http
server/maps.ts          builds the farm/forest colliders in Node; each room gets its own copy
src/game/net/protocol.ts  message types and the compact snapshot format (shared)
src/game/net/encode.ts    server: Sim → snapshot
src/game/net/NetSim.ts    client: mirrors the server's state, interpolates, forwards commands
src/game/net/NetClient.ts client: connection, lobby status
scripts/net-test.ts     starts the server and plays a room with three WebSocket clients
```

- **Rooms.** A four-letter code. Joining an unknown code creates that room; joining with no code
  creates one with a random code. The first person in is the host: they pick bot pigs and start the
  run. If the host leaves, the next person takes over. People can join a game in progress and
  appear beside the herd. A room closes when the last person leaves.
- **Ticks and snapshots.** The server steps the simulation at 30 Hz and sends every client the
  same message per tick: entity data as value arrays (key lists in `protocol.ts`, numbers rounded
  to hundredths), slow-changing state (upgrades, banners, squad, prompts) only when it changes,
  stats once a second, and that tick's events.
- **Your pig is yours.** Each browser runs its own pig's movement, physics, combos, aiming and
  cooldowns locally (`Sim.predict` on a private copy of the simulation pointed at the newest world),
  so controls respond instantly, hits and damage numbers included. It sends a `pose` message at
  30 Hz, or right away when it acted, with the pig's state, the moves it made (each with the pose it
  happened at) and the effects it showed. The server replays those moves against the shared world
  (`Sim.replay`: Allen, bots, jars, hogs take the real damage) without re-aiming, slowing the world
  down, or emitting effects, and relays the owner's effects to everyone else.
- **What the server still owns.** Health, knock-outs, revivals and forced moves. When an enemy hits
  a browser-driven pig, the server sends its owner a `knock` (it applies the knockback itself) and
  ignores further hits for 0.9 s until the owner's invulnerability arrives. Respawns, travel and
  knock-outs bump the pig's `epoch`; poses based on an older epoch are dropped, and the owner adopts
  the server's pig. There's no cheat protection beyond keeping pigs on the map: browsers are trusted.
- **Rendering.** The shared world is drawn 100 ms behind the newest snapshot and blended between
  snapshots. Your pig is drawn exactly as your browser drives it. Server events and other players'
  relayed effects play when their moment comes up on screen.
- **Online rules.** No pausing (the pause menu just opens over the live game) and no opening
  story. Shops are per player while the herd keeps playing. After a wipe anyone can retry.

See [HOSTING.md](HOSTING.md) to run it.

Tests: `npm run net:test` (server + three clients, ~40 s) and `npm run sim:soak`.

## Playing as Allen

- **Offline:** on the title screen pick **Play as: Allen**, then how many bot pigs (+3 or +7).
- **Online:** the host picks who plays Allen in the lobby (**Allen: AI / a player**). That person's pig
  leaves the herd; everyone else plays pigs. If Allen's player leaves, the AI takes him back.

Controls (keyboard / controller use the pig bindings):

| Key | Move |
|-----|------|
| WASD | Walk (he faces where you walk; moves aim at the nearest pig ahead, else straight ahead) |
| LMB / J | Claw swipe |
| RMB / K | Dash |
| Space | Body slam (lands where you're aiming) |
| Shift | Wok guard (blocks hits from the front) |
| Q | Chopstick throw |
| F | Summon kitchen bots |
| C | Hot pot rain |
| R | Sizzle spin (invincible while spinning, dizzy after) |
| E | Eat the crop or pie you're next to (walk off to stop) |

Allen wins by eating the farm or knocking out every pig; the pigs win by getting through all eight
courses. Between courses he comes back on his own after 20 s (4 s at the start) unless a pig rings
the bell first. Everything else about Allen is unchanged: his sauce-shield phases, stagger, hunger
for crops, kitchen reinforcements, and the health/jar scaling for bigger herds.

In the simulation, `sim.setAllenPlayer(true)` hands Allen to inputs keyed `ALLEN_ID`; in his
`chase` state `allenControls` turns buttons into the same states the AI picks (with the same
cooldowns), and `allenAim` stands in for his target. Online, Allen's controls go to the server as
`ain` messages and he's simulated there (not predicted in the browser). `npm run allen:test` drives
Allen with a scripted player against bot pigs.

## Next phases

3. **Co-op polish.** Reviving downed pigs, per-player shops/economy, per-player sounds.
4. **Polish.** Reconnecting to your pig after a dropped connection, a room browser, compressing
   snapshots further (deltas), persistence across server restarts.

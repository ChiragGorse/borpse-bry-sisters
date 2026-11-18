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

## Next phases

2. **Server + netcode.** A Node server runs `Sim` per room (`scripts/headless-maps.ts` shows how
   to build the map colliders in Node) at a fixed tick, receives `PlayerInput`s over WebSockets
   and broadcasts snapshots plus `SimEvent`s. Clients interpolate other entities ~100 ms behind
   and predict their own pig. `Game` reads the simulation through its public fields, so a client
   can render a snapshot-backed state object instead of a local `Sim`.
3. **Co-op polish.** Reviving downed pigs, per-player shops/economy, pause/cutscene voting,
   per-player camera shake and sounds.
4. **Player-controlled Allen.** Allen is a state machine with per-move cooldowns; a human Allen
   replaces the "pick the next move" step in `updateAllen` with button presses.
5. **Polish.** Reconnects, lobby, bandwidth tuning.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import type { HudState, UpgradeId } from './game/data';
import { Hud } from './ui/Hud';
import { Shop } from './ui/Shop';
import { GameOverScreen, OpeningCutscene, PauseScreen, TitleScreen, VictoryScreen, type MenuAction } from './ui/Screens';
import { SettingsDialog } from './ui/Settings';
import { ChangelogDialog } from './ui/Changelog';
import { navigatePadMenu } from './ui/gamepadMenu';
import { MobileControls } from './ui/MobileControls';
import { useTouchDevice } from './ui/useTouchDevice';
import { displayAddress, type NetStatus } from './game/net/NetClient';
import { clearSave, loadSave, type SaveData } from './game/save';

const initialBots = (() => {
  const q = Number(new URLSearchParams(window.location.search).get('bots'));
  const h = /^#bots-(\d)$/.exec(window.location.hash);
  return Math.min(7, Math.max(0, q || (h ? Number(h[1]) : 0)));
})();

export default function App() {
  const root = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [portraits, setPortraits] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);
  // ?bots=N or #bots-N fills the herd with N stand-in pigs for trying out multiplayer locally
  const [bots, setBotsState] = useState(initialBots);
  const [net, setNet] = useState<NetStatus | null>(null);
  const defaultServer = displayAddress(Game.serverUrl());
  const joinOnline = useCallback((room: string, name: string, url: string) => game.current?.joinOnline(room, name, url), []);
  const leaveOnline = useCallback(() => game.current?.leaveOnline(), []);
  const chooseAllen = useCallback((pid: number) => game.current?.chooseAllen(pid), []);
  const [role, setRoleState] = useState<'pig' | 'allen'>('pig');
  const setBots = useCallback((n: number) => {
    setBotsState(n);
    game.current?.setBots(n);
  }, []);
  const setRole = useCallback(
    (r: 'pig' | 'allen') => {
      setRoleState(r);
      game.current?.setRole(r);
      // Allen needs pigs to chase
      if (r === 'allen' && bots === 0) setBots(3);
    },
    [bots, setBots],
  );
  const touch = useTouchDevice();
  const getGame = useCallback(() => game.current, []);
  const interact = useCallback(() => game.current?.touchPress('KeyE'), []);

  useEffect(() => {
    let cancelled = false;
    let g: Game | null = null;
    const boot = () => {
      if (cancelled || !mount.current) return;
      try {
        g = new Game(mount.current, setHud, { bots: initialBots, onNet: setNet });
        g.setGamepadMenu((command) => root.current ? navigatePadMenu(root.current, command) : false);
        game.current = g;
        setPortraits(g.portraits);
      } catch (e) {
        console.error(e);
        setError(true);
      }
    };
    // Wait briefly for the display font so the painted farm signs use it.
    const fonts = document.fonts;
    const ready: Promise<unknown> =
      fonts && typeof fonts.load === 'function'
        ? Promise.race([fonts.load('32px "Bowlby One"'), new Promise((r) => setTimeout(r, 1500))])
        : Promise.resolve();
    ready.then(boot, boot);
    return () => {
      cancelled = true;
      g?.dispose();
      game.current = null;
    };
  }, []);

  const minimapRef = useCallback((el: HTMLCanvasElement | null) => {
    game.current?.setMinimap(el);
  }, []);
  const start = useCallback(() => game.current?.start(), []);
  // progress saved in this browser, re-read whenever the title screen comes back
  const [save, setSave] = useState<SaveData | null>(loadSave);
  const buy = useCallback((id: UpgradeId) => game.current?.buy(id), []);

  const [settings, setSettingsState] = useState(false);
  const [editTouch, setEditTouch] = useState(false);
  const [changelog, setChangelog] = useState(false);
  const closeChangelog = useCallback(() => setChangelog(false), []);
  const setSettings = useCallback((open: boolean) => setSettingsState(open), []);
  // while a settings overlay is up, Esc and P belong to it, not to the pause menu
  useEffect(() => {
    if (game.current) game.current.settingsOpen = settings || editTouch;
  }, [settings, editTouch]);

  const screen = hud?.screen;
  useEffect(() => {
    if (screen === 'title') setSave(loadSave());
  }, [screen]);
  const onlinePlay = net?.state === 'playing';
  const host = onlinePlay && net!.host;
  const toMenu = () => game.current?.toMenu();
  // what ends this run: solo, restart or quit to the title; online, the host can bring the room back to
  // the lobby (nobody's disconnected), and anyone can leave the room
  const runActions = (restart: boolean): MenuAction[] =>
    onlinePlay
      ? [
          ...(host ? [{ label: 'Back to lobby', confirm: 'Sure? Ends the run for everyone', onPress: toMenu }] : []),
          { label: 'Leave room', confirm: host ? 'Sure? Someone else becomes host' : 'Sure? You leave the room', onPress: leaveOnline },
        ]
      : [
          ...(restart ? [{ label: 'Start over', confirm: 'Sure? Back to course 1', onPress: start }] : []),
          { label: 'Main menu', confirm: 'Sure? This run ends', onPress: toMenu },
        ];
  const showHud = hud && !hud.opening && (screen === 'play' || screen === 'shop' || screen === 'paused');
  // On-screen controls only on phones/tablets, and only while actually playing (not in menus or cutscenes).
  const showTouch = touch && hud && !hud.opening && !hud.cinematic && screen === 'play' && !hud.gamepad?.active && !editTouch;

  return (
    <div
      ref={root}
      data-input={hud?.gamepad?.active ? 'gamepad' : touch ? 'touch' : 'keyboard'}
      onPointerDownCapture={() => game.current?.useKeyboard()}
      className="relative h-[100dvh] w-screen overflow-hidden bg-[#1b120d]"
    >
      <div ref={mount} className="absolute inset-0" />

      {!hud && !error && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-[#1b120d] text-paper" role="status">
          <p className="font-display text-3xl">Rounding up the farm…</p>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-mustard">planting corn · waking Kenji</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#1b120d] p-6">
          <div className="sticker max-w-md p-6" role="alert">
            <h1 className="font-display text-3xl leading-none">The barn door is stuck</h1>
            <p className="mt-3 text-base font-medium leading-snug">
              This game needs WebGL to draw the farm, and your browser would not start it. Try a recent version of Chrome, Firefox, Edge or Safari with hardware acceleration switched on.
            </p>
          </div>
        </div>
      )}

      {hud && showTouch && <MobileControls game={getGame} hud={hud} />}
      {hud && editTouch && <MobileControls game={getGame} hud={hud} edit onDone={() => setEditTouch(false)} />}
      {hud && showHud && (
        <Hud hud={hud} portraits={portraits} minimapRef={minimapRef} dim={screen !== 'play'} touch={touch && !hud.gamepad?.active} onInteract={interact} conn={net && net.state !== 'closed' ? net : null} />
      )}
      {hud?.opening && (
        <OpeningCutscene
          step={hud.opening.step}
          total={hud.opening.total}
          canSkip={hud.opening.canSkip}
          portraits={portraits}
          onSkip={() => game.current?.finishOpening()}
        />
      )}
      {hud && screen === 'title' && !editTouch && <TitleScreen
          portraits={portraits}
          pad={hud.gamepad?.layout}
          touch={touch}
          bots={bots}
          onBots={setBots}
          role={role}
          onRole={setRole}
          online={{ defaultServer, status: net, onJoin: joinOnline, onLeave: leaveOnline, onAllen: chooseAllen }}
          onStart={start}
          save={save}
          onContinue={() => {
            const d = loadSave();
            if (!d) return setSave(null);
            setRoleState('pig');
            game.current?.setRole('pig');
            setBots(Math.min(7, Math.max(0, d.bots | 0)));
            game.current?.start(d);
          }}
          onDeleteSave={() => {
            clearSave();
            setSave(null);
          }}
          onSettings={() => setSettings(true)}
          onChangelog={() => setChangelog(true)}
        />}
      {hud && changelog && screen === 'title' && <ChangelogDialog onClose={closeChangelog} />}
      {hud && screen === 'shop' && <Shop hud={hud} portraits={portraits} onBuy={buy} onClose={() => game.current?.closeShop()} />}
      {hud && screen === 'paused' && !editTouch && (
        <PauseScreen
          muted={hud.muted}
          pad={hud.gamepad?.active ? hud.gamepad.layout : undefined}
          disconnected={hud.controllerDisconnected}
          onResume={() => game.current?.resume()}
          onMute={() => game.current?.toggleMute()}
          onSettings={() => setSettings(true)}
          onSfxPreview={() => game.current?.previewSfx()}
          actions={runActions(true)}
          loadout={hud.allen ? undefined : { actives: hud.actives, owned: hud.owned, onAssign: (slot, id) => game.current?.setLoadoutSlot(slot, id) }}
          note={onlinePlay ? `Room ${net!.room} · the game keeps going while you're paused.` : hud.allen ? undefined : 'Your progress saves on this browser between courses. Pick it up again with Continue on the title screen.'}
          onReturnFarm={hud.area === 'forest' ? () => game.current?.returnToFarm() : undefined}
          grind={hud.allen ? undefined : hud}
        />
      )}
      {hud && screen === 'gameover' && <GameOverScreen hud={hud} portraits={portraits} onRetry={() => game.current?.retryCourse()} actions={runActions(true)} />}
      {hud && screen === 'victory' && <VictoryScreen hud={hud} portraits={portraits} onRestart={start} actions={runActions(false)} />}
      {hud && settings && (
        <SettingsDialog
          onClose={() => setSettings(false)}
          touch={touch}
          muted={hud.muted}
          onMute={() => game.current?.toggleMute()}
          gfx={hud.gfx}
          onGraphics={() => game.current?.cycleGraphics()}
          fps={hud.fps}
          onFps={() => game.current?.toggleFps()}
          onSfxPreview={() => game.current?.previewSfx()}
          onEditTouch={
            screen === 'paused' || screen === 'title'
              ? () => {
                  setSettings(false);
                  setEditTouch(true);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

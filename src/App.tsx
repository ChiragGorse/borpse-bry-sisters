import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import type { HudState, UpgradeId } from './game/data';
import { Hud } from './ui/Hud';
import { Shop } from './ui/Shop';
import { GameOverScreen, OpeningCutscene, PauseScreen, TitleScreen, VictoryScreen } from './ui/Screens';
import { navigatePadMenu } from './ui/gamepadMenu';
import { MobileControls } from './ui/MobileControls';
import { useTouchDevice } from './ui/useTouchDevice';

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
  const setBots = useCallback((n: number) => {
    setBotsState(n);
    game.current?.setBots(n);
  }, []);
  const touch = useTouchDevice();
  const getGame = useCallback(() => game.current, []);
  const interact = useCallback(() => game.current?.touchPress('KeyE'), []);

  useEffect(() => {
    let cancelled = false;
    let g: Game | null = null;
    const boot = () => {
      if (cancelled || !mount.current) return;
      try {
        g = new Game(mount.current, setHud, { bots: initialBots });
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
  const buy = useCallback((id: UpgradeId) => game.current?.buy(id), []);

  const screen = hud?.screen;
  const showHud = hud && !hud.opening && (screen === 'play' || screen === 'shop' || screen === 'paused');
  // On-screen controls only on phones/tablets, and only while actually playing (not in menus or cutscenes).
  const showTouch = touch && hud && !hud.opening && screen === 'play' && !hud.gamepad?.active;

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
      {hud && showHud && (
        <Hud hud={hud} portraits={portraits} minimapRef={minimapRef} dim={screen !== 'play'} touch={touch && !hud.gamepad?.active} onInteract={interact} />
      )}
      {hud?.opening && (
        <OpeningCutscene
          step={hud.opening.step}
          total={hud.opening.total}
          portraits={portraits}
          onSkip={() => game.current?.finishOpening()}
        />
      )}
      {hud && screen === 'title' && <TitleScreen portraits={portraits} pad={hud.gamepad?.layout} touch={touch} bots={bots} onBots={setBots} onStart={start} />}
      {hud && screen === 'shop' && <Shop hud={hud} portraits={portraits} onBuy={buy} onClose={() => game.current?.closeShop()} />}
      {hud && screen === 'paused' && (
        <PauseScreen
          muted={hud.muted}
          gfx={hud.gfx}
          pad={hud.gamepad?.active ? hud.gamepad.layout : undefined}
          disconnected={hud.controllerDisconnected}
          onGraphics={() => game.current?.cycleGraphics()}
          onResume={() => game.current?.resume()}
          onMute={() => game.current?.toggleMute()}
          onRestart={start}
          onReturnFarm={hud.area === 'forest' ? () => game.current?.returnToFarm() : undefined}
        />
      )}
      {hud && screen === 'gameover' && <GameOverScreen hud={hud} portraits={portraits} onRetry={() => game.current?.retryCourse()} onRestart={start} />}
      {hud && screen === 'victory' && <VictoryScreen hud={hud} portraits={portraits} onRestart={start} />}
    </div>
  );
}

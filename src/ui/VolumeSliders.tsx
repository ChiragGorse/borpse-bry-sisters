import { useSyncExternalStore } from 'react';
import { getVolume, onVolumeChange, setVolume, type Volume } from '../game/volume';

/** Music and sound-effects volume sliders (saved on this device, applied instantly). */
export function VolumeSliders({ onSfxPreview, compact = false }: { onSfxPreview?: () => void; compact?: boolean }) {
  const vol = useSyncExternalStore(onVolumeChange, getVolume);
  const row = (key: keyof Volume, label: string) => (
    <label key={key} className="flex items-center gap-3">
      <span className={`shrink-0 font-extrabold uppercase tracking-wide ${compact ? 'w-24 text-[11px]' : 'w-28 text-xs'}`}>{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(vol[key] * 100)}
        aria-label={`${label} volume`}
        onChange={(e) => setVolume({ [key]: Number(e.target.value) / 100 })}
        onPointerUp={key === 'sfx' ? onSfxPreview : undefined}
        onKeyUp={key === 'sfx' ? onSfxPreview : undefined}
        className="h-2 min-w-0 flex-1 cursor-pointer accent-[#e8a628]"
      />
      <span className="w-10 text-right font-mono text-xs font-bold tabular-nums">{Math.round(vol[key] * 100)}%</span>
    </label>
  );
  return (
    <div className="grid gap-2">
      {row('music', 'Music')}
      {row('sfx', 'Sound effects')}
    </div>
  );
}

/**
 * Path Guppy's jump-scare face: a full-screen SVG of the guppy at his most grotesque (bulging bloodshot
 * eyes, a gaping maw of needle teeth, mottled rotten skin), warped by a moving turbulence filter.
 * Built once, as a string, and dropped over the game for about a second when he leaps out.
 */

/** Deterministic jitter so the teeth look hand-made but the face is the same every time. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
}

function teeth(cx: number, cy: number, rx: number, ry: number, upper: boolean, n: number, seed: number) {
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < n; i++) {
    // spread along the lip, crowded and crooked
    const t = (i + 0.5) / n;
    const a = Math.PI * (upper ? 1 + t : 1 - t);
    const x = cx + Math.cos(a) * rx * 0.96;
    const y = cy + Math.sin(a) * ry * 0.92 * (upper ? 1 : 1);
    const len = 22 + r() * 46 * Math.sin(t * Math.PI);
    const w = 6 + r() * 7;
    const lean = (r() - 0.5) * 14;
    const tipY = upper ? y + len : y - len;
    const shade = ['#efe6bd', '#e2d39a', '#d8c27f', '#f4edcf', '#c9b071'][Math.floor(r() * 5)];
    out += `<path d="M${(x - w).toFixed(1)} ${y.toFixed(1)} Q${(x + lean * 0.4).toFixed(1)} ${((y + tipY) / 2).toFixed(1)} ${(x + lean).toFixed(1)} ${tipY.toFixed(1)} Q${(x + lean * 0.2 + 2).toFixed(1)} ${((y + tipY) / 2).toFixed(1)} ${(x + w).toFixed(1)} ${y.toFixed(1)}Z" fill="${shade}" stroke="#4d3b17" stroke-width="1.6"/>`;
    // a few drip strands hanging off the top teeth
    if (upper && r() < 0.3) {
      const d = 30 + r() * 60;
      out += `<path d="M${(x + lean).toFixed(1)} ${tipY.toFixed(1)} q${(r() * 6 - 3).toFixed(1)} ${(d / 2).toFixed(1)} 0 ${d.toFixed(1)}" stroke="#cfe3c8" stroke-opacity="0.75" stroke-width="${(1.5 + r() * 2).toFixed(1)}" fill="none"/><circle cx="${(x + lean).toFixed(1)}" cy="${(tipY + d).toFixed(1)}" r="${(2.5 + r() * 2).toFixed(1)}" fill="#dff0d8" fill-opacity="0.8"/>`;
    }
  }
  return out;
}

function veins(cx: number, cy: number, r0: number, n: number, seed: number) {
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    let x = cx + Math.cos(a) * r0;
    let y = cy + Math.sin(a) * r0;
    let d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
    const steps = 2 + Math.floor(r() * 3);
    for (let s = 0; s < steps; s++) {
      const k = (s + 1) / (steps + 1);
      const aa = a + (r() - 0.5) * 0.7;
      const nx = cx + Math.cos(aa) * r0 * (1 - k * 0.7);
      const ny = cy + Math.sin(aa) * r0 * (1 - k * 0.7);
      const qx = (x + nx) / 2 + (r() - 0.5) * 10;
      const qy = (y + ny) / 2 + (r() - 0.5) * 10;
      d += ` Q${qx.toFixed(1)} ${qy.toFixed(1)} ${nx.toFixed(1)} ${ny.toFixed(1)}`;
      x = nx;
      y = ny;
    }
    out += `<path d="${d}" stroke="#b0121c" stroke-width="${(0.6 + r() * 1.8).toFixed(1)}" fill="none" stroke-linecap="round" opacity="${(0.55 + r() * 0.4).toFixed(2)}"/>`;
  }
  return out;
}

function eye(cx: number, cy: number, rad: number, px: number, py: number, seed: number) {
  return `
    <ellipse cx="${cx}" cy="${cy + 6}" rx="${rad + 34}" ry="${rad + 26}" fill="#050a08" opacity="0.85"/>
    <circle cx="${cx}" cy="${cy}" r="${rad + 14}" fill="#5e1418"/>
    <circle cx="${cx}" cy="${cy}" r="${rad + 6}" fill="#8f2a22"/>
    <circle cx="${cx}" cy="${cy}" r="${rad}" fill="url(#gs-sclera)"/>
    ${veins(cx, cy, rad, 14, seed)}
    <circle cx="${cx + px}" cy="${cy + py}" r="${rad * 0.17}" fill="#8f7a1c" opacity="0.75"/>
    <circle cx="${cx + px}" cy="${cy + py}" r="${rad * 0.17}" fill="none" stroke="#2a1d05" stroke-width="2"/>
    <circle cx="${cx + px}" cy="${cy + py}" r="${rad * 0.045}" fill="#000"/>
    <ellipse cx="${cx - rad * 0.35}" cy="${cy - rad * 0.45}" rx="${rad * 0.3}" ry="${rad * 0.12}" fill="#fff" opacity="0.35" transform="rotate(-25 ${cx} ${cy})"/>`;
}

function spots(seed: number) {
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < 26; i++) {
    const x = r() * 400;
    const y = r() * 300;
    const big = r() * 18 + 4;
    const pale = r() < 0.4;
    out += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${big.toFixed(1)}" ry="${(big * (0.5 + r() * 0.6)).toFixed(1)}" fill="${pale ? '#a9c9a0' : '#16302a'}" opacity="${(pale ? 0.35 : 0.5).toFixed(2)}"/>`;
  }
  return out;
}

export const SCARE_FACE_SVG = `
<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="gs-skin" cx="50%" cy="45%" r="70%">
      <stop offset="0" stop-color="#6d9a7e"/>
      <stop offset="0.45" stop-color="#335a4a"/>
      <stop offset="0.8" stop-color="#1b332b"/>
      <stop offset="1" stop-color="#050807"/>
    </radialGradient>
    <radialGradient id="gs-sclera" cx="45%" cy="40%" r="60%">
      <stop offset="0" stop-color="#fffbe0"/>
      <stop offset="0.6" stop-color="#e8d79a"/>
      <stop offset="0.9" stop-color="#c76a4a"/>
      <stop offset="1" stop-color="#7a1a16"/>
    </radialGradient>
    <radialGradient id="gs-maw" cx="50%" cy="40%" r="60%">
      <stop offset="0" stop-color="#000"/>
      <stop offset="0.7" stop-color="#1c0204"/>
      <stop offset="1" stop-color="#5a0b12"/>
    </radialGradient>
    <linearGradient id="gs-under" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#d8ffd0" stop-opacity="0.18"/>
      <stop offset="0.5" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.55"/>
    </linearGradient>
    <radialGradient id="gs-vignette" cx="50%" cy="50%" r="65%">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.92"/>
    </radialGradient>
    <filter id="gs-warp" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="2" seed="7">
        <animate attributeName="baseFrequency" dur="0.5s" values="0.011;0.016;0.009;0.011" repeatCount="indefinite"/>
      </feTurbulence>
      <feDisplacementMap in="SourceGraphic" scale="16"/>
    </filter>
    <filter id="gs-grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="3"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0"/>
    </filter>
  </defs>
  <rect width="400" height="300" fill="#000"/>
  <g filter="url(#gs-warp)">
    <!-- his tattered orange fins, crowding in at the sides -->
    <path d="M-20 40 L60 70 L20 105 L70 130 L15 160 L60 190 L-20 230Z" fill="#c9822e" stroke="#4a2a0c" stroke-width="3"/>
    <path d="M420 30 L335 65 L380 100 L330 125 L385 155 L340 190 L420 240Z" fill="#c9822e" stroke="#4a2a0c" stroke-width="3"/>
    <ellipse cx="200" cy="150" rx="215" ry="190" fill="url(#gs-skin)"/>
    ${spots(11)}
    <path d="M110 40 Q200 20 290 38 M125 55 Q200 40 275 52 M150 20 Q200 10 250 18" stroke="#13261f" stroke-width="3" fill="none" opacity="0.7"/>
    <!-- gill slits -->
    <path d="M45 120 q12 30 0 60 M58 115 q12 35 0 70 M355 118 q-12 30 0 62 M342 112 q-12 36 0 72" stroke="#10201a" stroke-width="5" fill="none" stroke-linecap="round"/>
    ${eye(116, 82, 50, 4, 6, 21)}
    ${eye(290, 74, 64, -8, 9, 37)}
    <!-- nostril slits -->
    <ellipse cx="185" cy="122" rx="5" ry="10" fill="#0a1310" transform="rotate(-20 185 122)"/>
    <ellipse cx="215" cy="120" rx="5" ry="10" fill="#0a1310" transform="rotate(20 215 120)"/>
    <!-- the maw -->
    <ellipse cx="200" cy="206" rx="160" ry="84" fill="#3d0a10"/>
    <ellipse cx="200" cy="208" rx="150" ry="76" fill="url(#gs-maw)"/>
    <ellipse cx="200" cy="226" rx="58" ry="28" fill="#000"/>
    <path d="M140 250 Q200 222 260 250 Q200 272 140 250Z" fill="#6e1a24" opacity="0.85"/>
    ${teeth(200, 208, 150, 76, true, 23, 5)}
    ${teeth(200, 208, 150, 76, false, 19, 9)}
    <path d="M60 230 q10 40 4 70 M340 236 q-8 36 -2 64" stroke="#8a1018" stroke-width="5" fill="none" opacity="0.7"/>
    <ellipse cx="200" cy="206" rx="160" ry="84" fill="none" stroke="#2a0509" stroke-width="7"/>
  </g>
  <!-- lit from below, like a torch under a chin, and swallowed by the dark at the edges -->
  <rect width="400" height="300" fill="url(#gs-under)"/>
  <rect width="400" height="300" fill="url(#gs-vignette)"/>
  <rect width="400" height="300" filter="url(#gs-grain)" opacity="0.55"/>
  <rect width="400" height="300" fill="#7a0000" opacity="0.18" style="mix-blend-mode:multiply"/>
</svg>`;

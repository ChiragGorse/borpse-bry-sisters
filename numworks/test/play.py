"""
Plays the NumWorks port on a PC: fake `kandinsky` (draws into an image), `ion` (keys pressed by a bot
that looks at the screen like a player would) and `time`. Checks it runs, draws, and can be won/lost.

  python3 numworks/test/play.py [seed] [frames] [screenshot-dir]
"""
import random, sys, types
try:
    from PIL import Image  # before the fake `time` module goes in
except ImportError:
    Image = None

seed = int(sys.argv[1]) if len(sys.argv) > 1 else 1
frames_max = int(sys.argv[2]) if len(sys.argv) > 2 else 20000
shots = sys.argv[3] if len(sys.argv) > 3 else None
random.seed(seed)
import os
PASSIVE = os.environ.get('PASSIVE') == '1'
W, H = 320, 222
screen = [[(0, 0, 0)] * W for _ in range(H)]
texts = []

def fill_rect(x, y, w, h, c):
    for yy in range(max(0, y), min(H, y + h)):
        row = screen[yy]
        for xx in range(max(0, x), min(W, x + w)):
            row[xx] = tuple(c)

hud_last = ['']
marks = []
def draw_string(s, x, y, fg=(0, 0, 0), bg=(255, 255, 255)):
    if s.startswith('THE FARM FELL'): texts.append(hud_last[0])
    if s.startswith('COURSE ') or s.startswith(('THE FARM FELL', 'THE FARM IS SAVED')): marks.append((frame[0], s))
    if s[:1] == 'C' and ' HP' in s: hud_last[0] = s
    texts.append(s)
    fill_rect(x, y, 10 * len(s), 18, bg)

kd = types.ModuleType('kandinsky'); kd.fill_rect = fill_rect; kd.draw_string = draw_string
ion = types.ModuleType('ion')
KEYS = ['KEY_LEFT', 'KEY_RIGHT', 'KEY_UP', 'KEY_DOWN', 'KEY_OK', 'KEY_EXE', 'KEY_ONE', 'KEY_TWO', 'KEY_THREE', 'KEY_FOUR']
for i, k in enumerate(KEYS): setattr(ion, k, i)
held = set()
ion.keydown = lambda k: k in held
clock = [0.0]
tm = types.ModuleType('time')
tm.monotonic = lambda: clock[0]
frame = [0]

def find(color, step=2):
    xs = ys = n = 0
    for y in range(20, H, step):
        row = screen[y]
        for x in range(0, W, step):
            if row[x] == color: xs += x; ys += y; n += 1
    return (xs / n, ys / n) if n > 4 else None

stats = {'menus': 0, 'buys': 0}
def bot():
    """One decision per frame: menus get OK (and shopping), the game gets a pig that hunts Allen."""
    held.clear()
    f = frame[0]
    last = texts[-1] if texts else ''
    if any(t.startswith(('C1 ', 'C2 ', 'C3 ', 'C4 ', 'C5 ')) for t in texts[-1:]) or (texts and texts[-1][:1] == 'C' and ' HP' in texts[-1]):
        pig = find((247, 168, 184))
        allen = find((230, 130, 50)) or find((255, 60, 40)) or find((150, 150, 150)) or find((235, 235, 225))
        if pig and allen:
            dx, dy = allen[0] - pig[0], allen[1] - pig[1]
            if PASSIVE:  # a player who only runs away: Allen should eat the farm
                dx, dy = -dx, -dy
            windup = find((255, 60, 40)) is not None
            if windup and abs(dx) + abs(dy) < 40:  # back off from a swipe, or charge through it
                if random.random() < 0.5: held.add(ion.KEY_EXE)
                dx, dy = -dx, -dy
            if dx > 6: held.add(ion.KEY_RIGHT)
            if dx < -6: held.add(ion.KEY_LEFT)
            if dy > 6: held.add(ion.KEY_DOWN)
            if dy < -6: held.add(ion.KEY_UP)
            if f % 2: held.add(ion.KEY_OK)
            if abs(dx) + abs(dy) > 50 and random.random() < 0.05: held.add(ion.KEY_EXE)
        return
    # a menu: shop a little, then OK (press on even frames, release on odd ones)
    if f % 2 == 0:
        if 'BETWEEN COURSES' in texts[-7:] and random.random() < 0.9:
            held.add(random.choice([ion.KEY_ONE, ion.KEY_TWO, ion.KEY_TWO, ion.KEY_THREE])); stats['buys'] += 1
        else:
            held.add(ion.KEY_OK); stats['menus'] += 1

def sleep(s):
    clock[0] += max(s, 0.001)
    frame[0] += 1
    if frame[0] >= frames_max: raise SystemExit
    if shots and frame[0] % 2500 == 0: save(shots + '/nw-%d.png' % frame[0])
    bot()
tm.sleep = sleep

def save(path):
    if Image is None: return
    im = Image.new('RGB', (W, H))
    im.putdata([p for row in screen for p in row])
    im.resize((W * 2, H * 2)).save(path)

sys.modules['kandinsky'] = kd; sys.modules['ion'] = ion; sys.modules['time'] = tm
g = {'__name__': '__main__'}
src = open(__file__.rsplit('/', 2)[0] + '/borpse.py').read()
seen = set()
try:
    exec(compile(src, 'borpse.py', 'exec'), g)
except SystemExit:
    pass
for t in texts:
    for k in ('COURSE', 'THE FARM FELL', 'THE FARM IS SAVED', 'BETWEEN'):
        if t.startswith(k): seen.add(t)
games = []
for t in texts:
    if t.startswith('COURSE '):
        n = int(t.split()[1])
        if n == 1 or not games: games.append(1)
        else: games[-1] = n
    elif t.startswith('THE FARM IS SAVED'): games[-1] = 'WIN'
print('courses reached per game:', games)
ends = [texts[i - 1] for i, t in enumerate(texts) if t.startswith('THE FARM FELL') and i]
lens = []
start = None
print('last HUD before each loss:', ends[:4])
secs = []
for (f0, a), (f1, b) in zip(marks, marks[1:]):
    if a.startswith('COURSE'): secs.append('%s: %.0fs' % (a.split(' -')[0], (f1 - f0) / 25))
print('course lengths (at 25 fps):', secs[:12])
shop = [t for t in texts if t.startswith('Truffles: ')]
print('shop visits', len(shop), 'buy presses', stats['buys'], 'sample', shop[:6])
print('frames', frame[0], '| reached course', g.get('c'), '| truffles', g.get('truf'), '| upgrades', g.get('lv'), '| screens:', sorted(seen))

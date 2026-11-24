# The Borpse Bry Sisters: NumWorks edition

A tiny top-down version of the game for the NumWorks graphing calculator, in one MicroPython script
(`borpse.py`, about 6.5 KB). It keeps the basics: defend the farm from Allen across 4 courses, then
Allen and Earwhen together in the 5th.

## How to play

| Key | Does |
| --- | --- |
| Arrows | Move Kenji (the pink square) |
| OK | Headbutt whatever's in front of you (press once per headbutt) |
| EXE | Hog Charge: a dash that hits hard and makes you briefly untouchable (every ~3 s) |
| 1–4 | Buy upgrades between courses |
| Back (or Home) | Quit |

- **Allen** (orange) chases you, swipes when he's close (he flashes red first: back off or charge through),
  sometimes dashes at you (red flash, then a rush; if he hits the fence he's stunned, grey), and when he's
  hungry he goes to eat the crops (green squares turn yellow, then brown). Land 6 hits in a row and he's
  stunned too; stunned, he takes double damage.
- **Kitchen bots** (dark squares) come in from the top and bite. Knock them out for truffles (brown dots).
- **Course 5:** Earwhen (white) patrols the top and fires cream at you. Beat both to save the farm.
- You lose if Kenji's health or the farm hits 0. The top bar shows course, your HP, Allen's (A) and
  Earwhen's (E) health, truffles (T) and how much of the farm is left (F).
- Between courses, spend truffles: Slop (+25 max HP), Tusks (+4 damage), Trotters (speed), or replant the farm.

## Putting it on your calculator

1. Open [my.numworks.com](https://my.numworks.com) and sign in, then go to **My scripts** (Python).
2. Make a new script called `borpse.py`, paste in the contents of [`borpse.py`](borpse.py), and save it.
3. Plug the calculator in with USB and, in Chrome or Edge, use **Send to calculator**.
4. On the calculator: **Python** app → `borpse.py` → run it.

You can also try it first on the NumWorks online simulator.

## Testing it on a PC

`test/play.py` runs the script in normal Python with stand-ins for the calculator's `kandinsky`,
`ion` and `time` modules, and a bot that plays by looking at the screen:

    python3 numworks/test/play.py [seed] [frames] [screenshot-folder]

`PASSIVE=1` makes the bot only run away (Allen should then eat the farm). To check the script compiles
for the calculator's MicroPython (1.17): `pip install mpy-cross==1.17 && mpy-cross numworks/borpse.py`.

# lumenfall-arena

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/lf4916047-rgb/lumenfall-arena/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/lf4916047-rgb/lumenfall-arena/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

Lumenfall Arena is an original arena-survival roguelite for the browser. Its cast and stone floor are real pixel art from **0x72's Dungeon Tileset II** (CC0 — see `game/assets/CREDITS.md`): a robed wizzard stands in for the Star-Warden, winged wogols swarm as **Void Moths**, chort imps dive as **Gloomwings**, hulking ogres lumber as **Hexshell Hulks**, a hooded necromancer drifts as **the Watcher**, and the pack's big demon looms as **the Hollow King** — all of it sounded entirely with synthesized WebAudio. You are the last Star-Warden: survive five minutes against the swarm in a dark indigo arena, gather the lumen shards they drop, level up and choose between new weapons (Orbit Blades, Nova Pulse, Chain Spark) and blessings, then face the Hollow King at the four-minute mark, his dark heart still swirling with live magic. Survive to dawn with the King defeated to win.

Every kill scores — moths 10, darters 15, Watchers 25, brutes 40, elites 250, the King 5,000 — and chained kills inside three seconds build a combo multiplier up to ×5. The end screen grades the run S/A/B/C and remembers your best score. Gilded elite foes drop **relics of the court**: when one falls, the game pauses into a draft of three from a pool of ten — ignite your hits with the Ember Brand, slow the swarm with a Frost Aura, block a killing blow with an Aegis Shard, erupt in a nova when you dash, and more. A loadout panel at the arena's edge tracks your weapons, blessings and relics as the build comes together (it folds away on narrow screens). Named phase banners mark the night's turnings — THE SWARM STIRS, THE DARK DEEPENS, THE COURT AWAKENS, THE KING'S HERALD. Move with WASD or the arrow keys, dash with Space or Shift, pause with P — or play on a phone with the virtual joystick and dash button. Your weapons fire on their own, so the game is all positioning, timing and build choices.

## Run it

```sh
node main.ts && python3 -m http.server 8080 --directory out/game
# then open http://localhost:8080 in a browser, desktop or phone — or serve the game/ folder
# directly with any static file server and open its index.html
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=bh0ya4f5&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>

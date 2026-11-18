# lumenfall-arena

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/lf4916047-rgb/lumenfall-arena/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/lf4916047-rgb/lumenfall-arena/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

Lumenfall Arena is an original arena-survival roguelite for the browser. Its cast and stone floor are real pixel art from **0x72's Dungeon Tileset II** (CC0 — see `game/assets/CREDITS.md`): a robed wizzard stands in for the Star-Warden, winged wogols swarm as **Void Moths**, chort imps dive as **Gloomwings**, hulking ogres lumber as **Hexshell Hulks**, a hooded necromancer drifts as **the Watcher**, and the pack's big demon looms twice over — ember-washed as **the Ashen Herald**, the King's lieutenant at the run's midpoint, and dark-crowned as **the Hollow King** himself — all of it sounded entirely with synthesized WebAudio. You are the last Star-Warden: the five-minute vigil is a journey across **three chapters** — the Twilight Court, the Ember Deep, the Frost Throne — tracked on a road map across the top of the HUD, with spawn knots previewed on an INCOMING line before they land. Gather the lumen shards the swarm drops, level up and choose between new weapons (Orbit Blades, Nova Pulse, Chain Spark) and blessings, break the Herald at 2:30, then face the Hollow King at the four-minute mark, his dark heart still swirling with live magic. Survive to dawn with the King defeated to win.

Every kill scores — moths 10, darters 15, Watchers 25, brutes 40, elites 250, the Herald 1,500, the King 5,000 — and chained kills inside three seconds build a combo multiplier up to ×5; every kill floats its score in amber, crits land gold and large, and fallen champions leave a soul-wisp and a heartbeat of hit-stop. Relics come in **Silver, Gold and Prismatic** tiers from a pool of fourteen: gilded elites open a draft of three, and felling the Herald guarantees a Gold-or-better draft — call meteors down on your crits with the Skyfall Brand, crown yourself in tempest lightning, detonate a nova every level-up. The end screen crowns the run with a rank medallion (S/A/B/C) and itemises the run's wages — Stardust from kills, elites, both bosses, score and time, banked into a persistent Workshop of fourteen growth nodes that makes every vigil start stronger than the last. A loadout panel at the arena's edge lists your run upgrades with pips and your relics with tier marks (it folds into a slide-in strip on phones). Move with WASD or the arrow keys, dash with Space or Shift, pause with P — or play on a phone in landscape with the virtual joystick and dash button. Your weapons fire on their own, so the game is all positioning, timing and build choices.

## Run it

```sh
node main.ts && python3 -m http.server 8080 --directory out/game
# then open http://localhost:8080 in a browser, desktop or phone — or serve the game/ folder
# directly with any static file server and open its index.html
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=bh0ya4f5&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>

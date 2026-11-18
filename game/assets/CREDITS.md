# Art credits

All sprite and floor art in this folder comes from one pack, so the whole game
shares a single pixel-art style:

## Dungeon Tileset II (v1.7) — by 0x72 (Robert)

- **Source:** https://0x72.itch.io/dungeontileset-ii (downloaded from the
  author's itch.io page as `0x72_DungeonTilesetII_v1.7.zip`)
- **Author:** 0x72 (Robert) — https://0x72.itch.io/
- **Licence:** **CC0 1.0 Universal (public domain)** — free to use, modify and
  redistribute, including commercially; no attribution required. Credited here
  anyway, because the art carries the game.
- **Files used** (in `frames/`, unmodified PNGs from the pack):
  - `wizzard_m_*` — the Star-warden (player)
  - `wogol_idle_*` — the Void Moth (flyer)
  - `chort_*` — the Gloomwing (charger)
  - `ogre_*` — the Hexshell Hulk (brute)
  - `necromancer_*` — the Watcher (ranged caster)
  - `big_demon_*` — the Hollow King (boss)
  - `floor_1` … `floor_8` — the arena's stone floor tiles
  - `column` — pillars baked into the arena floor
- **Adaptations made in code** (the PNG files themselves are untouched):
  elite variants are the same frames washed gold at load; the floor tiles are
  tinted toward the arena's indigo palette when the background is baked;
  white hit-flash silhouettes are derived from the frames at load.

Everything else in the game — the summoning circle, nebula sky, horizon,
particles, glow and UI — is drawn in code, as before. The lumen shard sprite
is also code-drawn.

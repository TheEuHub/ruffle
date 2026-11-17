# Games folder

One folder per game, named after the `id` in `../../games.json`:

```
assets/games/my-game/
  game.swf     ← required (any filename works, just match "file" in games.json)
  cover.svg    ← optional cover art, 16:10 looks best
  extra.swf    ← optional: files the movie loads at runtime, kept side by side
```

To add a game run `npm run add-game -- path/to/file.swf "Title"`, or edit
`games.json` by hand — see the top-level [README](../../README.md).

## Bundled games and their licenses

Every SWF here was built by its original author and is redistributed under the license
recorded for it in `games.json`. If you remove a game, please keep its credit somewhere
or delete the files entirely.

| Folder | Game | Author | License | Source |
| --- | --- | --- | --- | --- |
| `pacman/` | Pac-Man | Roy Massaad | MIT | <https://github.com/roymasad/pacman-flash-game> |
| `fruit-madness/` | Fruit Madness | Vladimir "Leinstay" Belyaev | MIT | <https://github.com/leinstay/fruitmadness> |
| `pixel-shooter/` | Pixel Shooter | Ian Ramzy | MIT | <https://github.com/ianramzy/pixel-shooter> |
| `moflegame/` | Mofle Game | Sindre Sorhus | MIT | <https://github.com/sindresorhus/moflegame> |

The player itself lives in `../ruffle/` and is Ruffle, dual-licensed MIT / Apache-2.0.

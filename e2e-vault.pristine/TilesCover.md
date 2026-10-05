# Tile covers (B-152)

A separate note, so the tile count and order the other specs assert on
`Dashboard.md` stay untouched. Both tiles carry a cover; the second is an
accent tile, whose thicker left border must not shift the cover either.

```tiles
columns: 2
items:
  - { label: Diary, path: Diary, image: cover.png }
  - { label: Journal, path: Journal, image: cover.png, accent: true }
```

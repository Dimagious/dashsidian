# Dashy

Dashboard blocks for [Obsidian](https://obsidian.md). Tiles, stats, progress bars and a
year heatmap — configured in YAML inside a code block. No JavaScript, no Dataview.

> Status: **v0.1.0, pre-release.** `tiles` and `heatmap` work. `stats`, `progress`,
> `today` and `countdown` are specified in [`docs/SPEC.md`](docs/SPEC.md) and not built yet.

## Blocks

````markdown
```tiles
columns: 4
items:
  - { label: Inbox, path: 00-Inbox, icon: 📥, badge: count }
  - { label: Sport, path: 01-Areas/Sport/Training-Log, icon: 🏆, sub: тренировки, accent: true }
```
````

````markdown
```heatmap
source: 01-Areas/Personal/Diary
field: sleep_score
color: purple
bands: [90, 80, 60]
```
````

Every colour comes from your theme's CSS variables, so the blocks follow whatever theme
and accent colour you run.

Full reference: [`docs/SKILL.preview.md`](docs/SKILL.preview.md) — generated from
`src/blocks/schema.json`, so it cannot drift from the code.

## Works with your AI agent

Settings → **AI agent skill** → *Install* writes `.claude/skills/dashy/SKILL.md` into your
vault. After that you can just ask your agent:

> сделай мне сетку плиток 3 на 3 по областям
> нарисуй календарь веса за год

The agent reads the skill and writes a correct block. The file is written only when you
press the button.

## Development

```bash
npm install
npm test          # vitest + coverage gates
npm run lint      # eslint + eslint-plugin-obsidianmd
npm run typecheck
npm run build     # styles.css + main.js
npm run build:skill   # regenerate the agent skill from the schema
```

`VAULT_PLUGIN="/path/to/vault/.obsidian/plugins/dashsidian" npm run dev:vault` builds
straight into a test vault and watches.

## License

MIT

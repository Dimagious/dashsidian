#!/usr/bin/env node
/**
 * Собирает SKILL.md для AI-агента из src/blocks/schema.json.
 *
 * Зачем генерация, а не рукописный файл: документация для агента — это и есть
 * контракт блоков. Написанная руками, она разъезжается с кодом за пару релизов,
 * и агент начинает уверенно сочинять несуществующие ключи.
 *
 * Пишет:
 *   src/skill/skill-content.ts  — то, что плагин кладёт в хранилище
 *   docs/dashy.schema.json      — машиночитаемая копия для любых других тулов
 *
 * `--check` ничего не пишет, а падает, если сгенерированное разошлось с тем,
 * что лежит в репозитории. Этим гейтом CI ловит «поправил схему, забыл пересобрать».
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const schema = JSON.parse(fs.readFileSync(path.join(root, "src/blocks/schema.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const check = process.argv.includes("--check");

const SKILL_PATH = ".claude/skills/dashy/SKILL.md";

/** Вертикальная черта внутри ячейки рвёт markdown-таблицу — экранируем. */
function cell(v) {
    return String(v).replace(/\|/g, "\\|");
}

function fields(map) {
    const rows = Object.entries(map).map(([key, f]) => {
        const req = f.required ? "да" : "—";
        const def = f.default !== undefined ? `\`${cell(f.default)}\`` : "—";
        const alias = f.aliases ? f.aliases.map((a) => `\`${a}\``).join(", ") : "—";
        return `| \`${key}\` | ${cell(f.type)} | ${req} | ${def} | ${alias} | ${cell(f.doc)} |`;
    });
    return ["| ключ | тип | обяз. | по умолч. | синонимы | что делает |",
            "|---|---|---|---|---|---|", ...rows].join("\n");
}

function blockSection(name, b) {
    const parts = [`### \`${name}\``, "", b.summary, ""];
    if (b.root) parts.push("**Корень блока**", "", fields(b.root), "");
    if (b.item) parts.push("**Элемент списка**", "", fields(b.item), "");
    parts.push("**Пример**", "", "````markdown", "```" + name, b.example, "```", "````", "");
    if (b.notes) parts.push(...b.notes.map((n) => `- ${n}`), "");
    return parts.join("\n");
}

const blocks = Object.entries(schema.blocks);
const markdown = `---
name: dashy
description: >-
  Собрать дашборд в заметке Obsidian блоками плагина Dashy: сетка плиток для
  навигации, тепловая карта года по числу из frontmatter. Использовать, когда
  просят сделать дашборд, домашнюю страницу, сетку плиток, календарь по дням,
  тепловую карту, трекер привычки или визуальную точку входа в хранилище.
version: ${schema.version}
---

# Dashy — блоки дашборда

Плагин **${manifest.name}** (\`${manifest.id}\`) рисует дашборд из markdown-блоков.
Конфиг — YAML внутри блока. Никакого JavaScript, Dataview не нужен.

Всего блоков: ${blocks.length}.

${blocks.map(([n, b]) => blockSection(n, b)).join("\n")}
## Чего плагин НЕ делает

Не выдумывай блоки, которых нет. Если просят что-то из этого списка — скажи, чем это делается на самом деле.

${Object.entries(schema.notInV1).map(([k, v]) => `- **${k}** — ${v}`).join("\n")}

## Общие правила

- Значения с двоеточием, запятой или решёткой бери в кавычки: \`label: "Дом: вход"\`.
- Синонимы ключей из таблиц выше распознаются, но в новых конфигах пиши канонический ключ.
- Неизвестный ключ не ломает блок — рисуется предупреждение. Но лишним ключам там не место.
- Блок сам выводит ошибку конфига прямо в заметку. Если пользователь прислал текст ошибки — читай его буквально, там есть номер строки.
`;

const contentTs = `/**
 * ВНИМАНИЕ: файл собирается скриптом \`npm run build:skill\` из src/blocks/schema.json.
 * Руками не править — правка потеряется на следующей сборке, а документация
 * разъедется с поведением. Именно так протухают инструкции для агентов.
 */
export const SKILL_VERSION = ${JSON.stringify(schema.version)};
export const SKILL_PATH = ${JSON.stringify(SKILL_PATH)};
export const SKILL_MARKDOWN = ${JSON.stringify(markdown)};
`;

const targets = [
    { file: "src/skill/skill-content.ts", body: contentTs },
    { file: "docs/dashy.schema.json", body: JSON.stringify(schema, null, 2) + "\n" },
    { file: "docs/SKILL.preview.md", body: markdown },
];

let stale = [];
for (const t of targets) {
    const full = path.join(root, t.file);
    const current = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
    if (current === t.body) continue;
    if (check) { stale.push(t.file); continue; }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, t.body, "utf8");
    console.log(`[${manifest.id}] wrote ${t.file}`);
}

if (check && stale.length) {
    console.error(`[${manifest.id}] скилл разошёлся со схемой: ${stale.join(", ")}`);
    console.error(`[${manifest.id}] запусти: npm run build:skill`);
    process.exit(1);
}
if (check) console.log(`[${manifest.id}] скилл в синхроне со схемой`);

# Dashy — Claude project notes

> Локальные заметки для ассистента. Держать коротко (≤300 строк) и не давать протухнуть.

## Где лежит остальная память

- `.claude/brain/README.md` — соглашения по brain
- `.claude/brain/backlog.md` — что дальше, с приоритетами
- `.claude/brain/sessions/` — журналы сессий
- `.claude/brain/decisions/` — ADR по нетривиальным решениям
- `.claude/skills/release-bump/SKILL.md` — как резать релиз (`/release-bump`)
- `.claude/skills/tech-writer/SKILL.md` — держать README и docs в синхроне (`/tech-writer`)

В начале сессии: глянуть `backlog.md` и последний файл в `sessions/`.

## Что это

**Dashy** (id `dashsidian`) — плагин Obsidian, который рисует дашборд из markdown-блоков.
Конфиг — YAML внутри блока, без JavaScript и без Dataview.

- Автор: Dmitriy Yurkin (`Dimagious`), MIT, Obsidian ≥ 1.5.0, `isDesktopOnly: false`
- Полное ТЗ: `docs/SPEC.md`
- Второй плагин автора; харнесс перенесён из [`Dimagious/snipsidian`](https://github.com/Dimagious/snipsidian)

## Имя ≠ id, и это не случайность

`name: Dashy`, `id: dashsidian`, репозиторий `dashsidian`. Расхождение намеренное.

Ревью Obsidian **заворачивает имя плагина, похожее на «Obsidian»**. Первый плагин автора
подавался как `Snipsidian` и получил отказ именно по имени; после переименования в
`Snipsy` прошёл. При этом **id остался `snipsidian`** и живёт в публичном URL
`community.obsidian.md/plugins/snipsidian` — то есть правило действует на `name`, а не
на `id`.

Отсюда схема, которую повторяем: `id` и репозиторий — `<что-то>sidian`, `name` — короткое
собственное слово. Менять `name` на что-то вроде `Dashsidian` нельзя, завернут.

## Состояние

v0.1.0, до публикации. Работают `tiles`, `stats` и `heatmap`. `progress`, `today`,
`countdown` описаны в ТЗ и не написаны. Ядро под `progress` (`core/aggregate.ts`)
уже есть и покрыто тестами. Спарклайн `trend` в `stats` — отдельный пункт B-008,
в схеме его сознательно нет.

## Раскладка

```
src/
  main.ts              реэкспорт app/plugin
  app/plugin.ts        регистрация блок-процессоров
  core/                ЧИСТЫЙ слой: ни Obsidian, ни DOM. Сюда — всю логику.
    calendar.ts          раскладка года, longestStreak/currentStreak
    source.ts            отбор заметок: source/tag/where + микроязык where
    aggregate.ts         count/sum/avg/min/max/latest/streak, series
    palette.ts           именованные цвета → rgb
  adapters/vault.ts    единственное место, где блоки трогают Obsidian
  blocks/              отрисовка, по файлу на блок
    schema.json          ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ по ключам блоков
  shared/parse.ts      YAML + синонимы ключей + диагностика
  shared/render.ts     вывод диагностики, внутренние ссылки
  ui/settings.ts       настройки + кнопка установки скилла
  skill/               СГЕНЕРИРОВАНО, руками не править
  styles/              main → variables + blocks
```

## Соглашения

1. **Логика живёт в `core/`.** Там нет импортов `obsidian` и обращений к DOM — поэтому
   она покрывается тестами без моков. Блоки только рисуют.
2. **Ключи блоков — только в `src/blocks/schema.json`.** Оттуда их читает и валидатор,
   и генератор скилла. Не дублировать список ключей в коде.
3. **После правки схемы — `npm run build:skill`.** CI падает на рассинхроне
   (`build:skill -- --check`).
4. **Токены CSS объявлять на `body`, не на `:root`.** В `:root` (это `html`)
   обсидиановых переменных ещё нет; `color-mix` от них невалиден, и плашки схлопываются
   в прозрачность. Проверено болезненно.
5. **Дату собирать из `getFullYear/getMonth/getDate`.** `toISOString()` в UTC+ уводит
   локальную полночь на сутки назад.
6. **Блок обязан показать свою ошибку** через `renderDiagnostics`. Молча пустой блок —
   худший исход: конфиг мог написать агент, который отрисовку не видит.
7. **Ни одного жёсткого цвета в CSS**, кроме фолбэков внутри `var()`.

## Ветки и коммиты

Один пункт бэклога — одна ветка — один (или несколько) коммитов. Пункта нет —
сначала пункт, потом ветка: имя ветки обязано указывать в бэклог.

**Ветка:** `<area>/<b-nnn>-<slug>`

`area` — колонка `area` из бэклога как есть (`blocks`, `ui`, `perf`, `parse`,
`meta`, `tests`, `docs`, `i18n`). `b-nnn` — id пункта в нижнем регистре.
`slug` — одно-три слова латиницей через дефис.

```
blocks/b-003-today
parse/b-019-scoped-key-aliases
ui/b-004-periodic-folder-settings
```

- База — `master`. Это единственная долгоживущая ветка.
- Зависимая работа ветвится от предыдущей ветки, а не от `master`: `today`
  не собрался бы без починки синонимов.
- Готово и зелено — `git switch master && git merge --ff-only <ветка>`.
  История линейная, мерж-коммитов нет.

**Коммит:** Conventional Commits, тема по-русски, до 72 символов, без точки.

```
<type>(<scope>): <что сделано>

<зачем; что было не так; что решили и почему — не пересказ диффа>

Backlog: B-003
```

`type` — `feat fix docs refactor perf test chore`. `scope` — блок или слой
(`stats`, `today`, `heatmap`, `parse`, `settings`, `skill`, `git`).
Трейлер `Backlog:` — в каждом коммите, который двигает пункт.

**Чего в коммитах не бывает:**

- `.claude/brain/` — бэклог, журналы сессий и ADR. Личная память, выведена
  из индекса через `.git/info/exclude`. Не коммитим и не пушим никогда.
- Соавторства ИИ, упоминаний ассистента и ссылок на сессии — ни в теме,
  ни в теле, ни в трейлерах. Автор — разработчик.

**Пуш.** Remote нет. Не заводить и не пушить без явной просьбы: в истории
до коммита `chore(git): вывести .claude/brain из индекса` лежит личная память,
её надо вычистить до первого пуша (B-022).

## Команды

| | |
|---|---|
| `npm test` | vitest + гейты покрытия (90/80) |
| `npm run lint` | eslint + eslint-plugin-obsidianmd |
| `npm run typecheck` | tsc --noEmit |
| `npm run build` | styles.css + main.js |
| `npm run build:skill` | пересобрать скилл из схемы |
| `npm run scorecard:check` | зеркало сканера community-plugins |
| `npm run release` | полный гейт + zip |
| `npm run dev:vault` | сборка в тестовое хранилище с watch |

## Ссылки

- Репозиторий: https://github.com/Dimagious/dashsidian *(создать)*
- Харнесс-донор: https://github.com/Dimagious/snipsidian
- Публичный листинг: *(после ревью)*

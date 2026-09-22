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

v0.1.0, до публикации. Работают `tiles` и `heatmap`. `stats`, `progress`, `today`,
`countdown` описаны в ТЗ и не написаны. Ядро под `stats`/`progress` (`core/aggregate.ts`)
уже есть и покрыто тестами.

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

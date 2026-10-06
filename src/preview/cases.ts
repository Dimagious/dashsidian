/**
 * Every state a block can be in, on one page.
 *
 * The value of the stand is not that it draws a dashboard — Obsidian does that
 * better — but that it puts the awkward states next to the good ones: an empty
 * selection, a broken config, a goal already passed, a note that does not exist
 * yet. Those are the ones that look wrong first and get noticed last.
 */

export interface PreviewCase {
    block: string;
    title: string;
    source: string;
}

export const CASES: PreviewCase[] = [
    {
        block: "tiles",
        title: "tiles — навигация, счётчики, акцент, обложка",
        source: `columns: 4
items:
  - { label: Inbox, path: Inbox, icon: 📥, badge: count, image: "https://picsum.photos/seed/dashy-inbox/400/200" }
  - { label: Diary, path: Diary, icon: 📔, badge: count, sub: 120 дней }
  - { label: Empty, path: Nowhere, icon: 🕳, badge: count }
  - { label: Accent, path: Diary, icon: ⭐, accent: true }`,
    },
    {
        block: "tiles",
        title: "tiles — сломанный конфиг, обложка не найдена",
        source: `items:
  - { lable: Typo, path: Diary }
  - { icon: 🕳 }
  - { label: Gym, path: Diary, image: Attachments/missing.jpg }`,
    },
    {
        block: "stats",
        title: "stats — все агрегаты, единицы, спарклайны",
        source: `columns: 4
items:
  - { label: Дней, source: Diary, agg: count, icon: 📔 }
  - { label: Средний сон, source: Diary, field: sleep_score, agg: avg, precision: 1, trend: 30d }
  - { label: Шагов всего, source: Diary, field: steps, agg: sum, unit: шаг }
  - { label: Лучший сон, source: Diary, field: sleep_score, agg: max, trend: 90d }
  - { label: Подряд, source: Diary, field: sleep_score, agg: streak, unit: дн. }
  - { label: Последние шаги, source: Diary, field: steps, agg: latest, sub: самая поздняя }
  - { label: Хорошие ночи, source: Diary, where: "sleep_score >= 90", agg: count }
  - { label: Сон и шаги, source: Diary, where: [sleep_score >= 85, "steps > 10000"], agg: count }
  - { label: Нет данных, source: Nowhere, field: steps, agg: max }`,
    },
    {
        block: "stats",
        title: "stats — опечатка, агрегат без поля, непонятный where",
        source: `items:
  - { label: Опечатка, source: Diary, field: steps, agg: avgg }
  - { label: Без поля, source: Diary, agg: avg }
  - { label: Через or, source: Diary, where: "year = 2026 or rating >= 4", agg: count }`,
    },
    {
        block: "stats",
        title: "stats — streak по будням (days: weekdays)",
        source: `columns: 3
items:
  - { label: Подряд, все дни, source: Diary, field: sleep_score, agg: streak, unit: дн. }
  - { label: Подряд, будни, source: Diary, field: sleep_score, agg: streak, days: weekdays, unit: дн. }
  - { label: Порог 8000 шагов по будням, source: Diary, field: steps, agg: streak, at_least: 8000, days: weekdays, unit: дн. }`,
    },
    {
        block: "stats",
        title: "stats — лучшая серия и текущая (current_streak)",
        source: `columns: 4
items:
  - { label: Лучшая серия, source: Diary, field: sleep_score, agg: streak }
  - { label: Дней подряд, source: Diary, field: sleep_score, agg: current_streak }
  - { label: Подряд 8000 шагов, source: Diary, field: steps, agg: current_streak, at_least: 8000 }
  - { label: Подряд в этом месяце, source: Diary, field: steps, agg: current_streak, at_least: 8000, period: month }`,
    },
    {
        block: "progress",
        title: "progress — обычная, выполненная, перевыполненная, сломанная",
        source: `columns: 2
items:
  - { label: Дней в дневнике, source: Diary, agg: count, goal: 365, icon: 📔 }
  - { label: Ровно в цель, source: Diary, agg: count, goal: 120 }
  - { label: Перевыполнено, source: Diary, agg: count, goal: 50 }
  - { label: Шаги, source: Diary, field: steps, agg: sum, goal: 1000000, unit: шагов, sub: за год }
  - { label: Без цели, source: Diary, agg: count }`,
    },
    {
        block: "stats",
        title: "stats — длительности (sleep_duration: 7h 12min)",
        source: `columns: 3
items:
  - { label: Средний сон, source: Diary, field: sleep_duration, agg: avg, period: week, compare: true, better: up }
  - { label: Сон за месяц, source: Diary, field: sleep_duration, agg: sum, period: month }
  - { label: Ночей от 7 часов, source: Diary, field: sleep_duration, agg: streak, at_least: 7h }`,
    },
    {
        block: "stats",
        title: "stats — в одну строку (layout: inline)",
        source: `layout: inline
items:
  - { label: дней в дневнике, source: Diary, agg: count, icon: 📔 }
  - { label: шагов за неделю, source: Diary, field: steps, agg: sum, period: week, compare: true, better: up }
  - { label: средний сон, source: Diary, field: sleep_duration, agg: avg }
  - { label: без поля, source: Diary, agg: avg }`,
    },
    {
        block: "stats",
        title: "stats — закрытая неделя (period: LAST_WEEK), сравнение со всей прошлой",
        source: `source: Diary
period: LAST_WEEK
items:
  - { label: Дней, agg: count, compare: true }
  - { label: Шагов, field: steps, agg: sum, compare: true, better: up }
  - { label: Подряд к концу недели, field: steps, agg: current_streak, at_least: 8000 }`,
    },
    {
        block: "stats",
        title: "stats — неделя ещё не началась (period: NEXT_WEEK)",
        source: `source: Diary
period: NEXT_WEEK
items:
  - { label: Дней, agg: count }
  - { label: Шагов, field: steps, agg: sum }`,
    },
    {
        block: "progress",
        title: "progress — длительность к цели 8h",
        source: `items:
  - { label: Сон за неделю, source: Diary, field: sleep_duration, agg: avg, period: week, goal: 8h }`,
    },
    {
        block: "today",
        title: "today — день, неделя, месяц",
        source: `daily: true
weekly: true
monthly: true`,
    },
    {
        block: "today",
        title: "today — свой заголовок, всё выключено",
        source: `title: мой день
daily: true`,
    },
    {
        block: "today",
        title: "today — часы с секундами над датой",
        source: `clock: seconds
daily: true
weekly: true`,
    },
    {
        block: "today",
        title: "today — непонятное значение clock",
        source: `clock: hours
daily: true`,
    },
    {
        block: "countdown",
        title: "countdown — впереди, сегодня, позади, каждый год, битая дата",
        source: `columns: 4
items:
  - { label: Далеко впереди, date: 2099-01-01, icon: 🏊 }
  - { label: Завтра, date: TOMORROW, icon: 🌅 }
  - { label: Сегодня, date: TODAY, icon: 🎂 }
  - { label: Давно прошло, date: 2000-01-01 }
  - { label: День рождения, date: 1990-05-12, repeat: yearly, sub: каждый год }
  - { label: Битая дата, date: 15.11.2026 }`,
    },
    {
        block: "heatmap",
        title: "heatmap — полосы, свой заголовок",
        source: `source: Diary
field: sleep_score
color: purple
bands: [90, 80, 60]
title: Сон за год`,
    },
    {
        block: "heatmap",
        title: "heatmap — другое поле и цвет, автоматический заголовок",
        source: `source: Diary
field: steps
color: green
bands: [12000, 8000, 5000]`,
    },
    {
        block: "heatmap",
        title: "heatmap — нет обязательного поля",
        source: `source: Diary
feild: sleep_score`,
    },
    {
        block: "heatmap",
        title: "heatmap — skip_field, закрашенный и пустой день отпуска",
        source: `source: Diary
field: sleep_score
color: purple
skip_field: vacation`,
    },
    {
        block: "heatmap",
        title: "heatmap — сегодняшняя ячейка обведена кольцом",
        source: `source: Diary
field: steps
color: green
bands: [12000, 8000, 5000]`,
    },
    {
        block: "heatmap",
        title: "heatmap — range: 365d, одна сетка на скользящий год",
        source: `source: Diary
field: sleep_score
color: purple
bands: [90, 80, 60]
range: 365d`,
    },
    {
        block: "heatmap",
        title: "heatmap — range: month, текущий месяц по сегодня",
        source: `source: Diary
field: steps
color: green
range: month`,
    },
    {
        block: "heatmap",
        title: "heatmap — layout: calendar, месяц с точками, отпуск штрихом",
        source: `source: Diary
field: steps
color: green
range: month
layout: calendar
skip_field: vacation`,
    },
    {
        block: "heatmap",
        title: "heatmap — layout: calendar со слоями, точка на слой",
        source: `source: Diary
range: month
layout: calendar
layers:
  - field: steps
    color: green
    label: Steps
  - field: sleep_score
    color: purple
    label: Sleep`,
    },
    {
        block: "chart",
        title: "chart — линия по дням, всё по умолчанию, пропуски",
        source: `source: Diary
field: sleep_score`,
    },
    {
        block: "chart",
        title: "chart — столбцы по неделям, цель, частичная неделя",
        source: `source: Diary
field: steps
type: bar
bucket: week
unit: шагов
goal: 60000
title: Шаги за неделю`,
    },
    {
        block: "chart",
        title: "chart — несколько серий, легенда",
        source: `source: Diary
bucket: week
series:
  - { field: sleep_score, agg: max, label: Лучшая ночь }
  - { field: sleep_score, agg: avg, label: В среднем, color: purple }
  - { field: sleep_score, agg: min, label: Худшая ночь, color: gray }`,
    },
    {
        block: "chart",
        title: "chart — месяцы за год, данные только за последние",
        source: `source: Diary
field: sleep_score
agg: avg
bucket: month
type: bar`,
    },
    {
        block: "chart",
        title: "chart — длительности (sleep_duration), цель 7h",
        source: `source: Diary
field: sleep_duration
agg: avg
bucket: week
goal: 7h`,
    },
    {
        block: "chart",
        title: "chart — закрытая неделя (range: LAST_WEEK), без «пока»",
        source: `source: Diary
field: steps
range: LAST_WEEK`,
    },
    {
        block: "chart",
        title: "chart — пустое окно, не ошибка",
        source: `source: Diary
field: sleep_score
where: "sleep_score >= 90"
range: 7d`,
    },
    {
        block: "chart",
        title: "chart — список в field, ошибка",
        source: `source: Diary
field: [sleep_score, steps]`,
    },
    {
        block: "chart",
        title: "chart — ключи соседей, битая цель, одна корзина",
        source: `source: Diary
field: steps
per_day: avg
layers: []
goal: много
bucket: month
range: week`,
    },
];

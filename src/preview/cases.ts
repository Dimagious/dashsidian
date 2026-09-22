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
        title: "tiles — навигация, счётчики, акцент",
        source: `columns: 4
items:
  - { label: Inbox, path: Inbox, icon: 📥, badge: count }
  - { label: Diary, path: Diary, icon: 📔, badge: count, sub: 120 дней }
  - { label: Empty, path: Nowhere, icon: 🕳, badge: count }
  - { label: Accent, path: Diary, icon: ⭐, accent: true }`,
    },
    {
        block: "tiles",
        title: "tiles — сломанный конфиг",
        source: `items:
  - { lable: Typo, path: Diary }
  - { icon: 🕳 }`,
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
  - { label: Нет данных, source: Nowhere, field: steps, agg: max }`,
    },
    {
        block: "stats",
        title: "stats — опечатка, агрегат без поля, непонятный where",
        source: `items:
  - { label: Опечатка, source: Diary, field: steps, agg: avgg }
  - { label: Без поля, source: Diary, agg: avg }
  - { label: Два условия, source: Diary, where: "year = 2026 and rating >= 4", agg: count }`,
    },
    {
        block: "progress",
        title: "progress — обычная, выполненная, перевыполненная, сломанная",
        source: `items:
  - { label: Дней в дневнике, source: Diary, agg: count, goal: 365, icon: 📔 }
  - { label: Ровно в цель, source: Diary, agg: count, goal: 120 }
  - { label: Перевыполнено, source: Diary, agg: count, goal: 50 }
  - { label: Шаги, source: Diary, field: steps, agg: sum, goal: 1000000, unit: шагов, sub: за год }
  - { label: Без цели, source: Diary, agg: count }`,
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
        block: "countdown",
        title: "countdown — впереди, сегодня, позади, битая дата",
        source: `columns: 4
items:
  - { label: Далеко впереди, date: 2099-01-01, icon: 🏊 }
  - { label: Завтра, date: TOMORROW, icon: 🌅 }
  - { label: Сегодня, date: TODAY, icon: 🎂 }
  - { label: Давно прошло, date: 2000-01-01 }
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
];

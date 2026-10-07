#!/usr/bin/env node
/**
 * Builds the vault the listing screenshots are taken from.
 *
 * Generated rather than committed: the dates have to end today or the heatmap
 * is a stripe that stops in the middle and the day row links to nothing. Three
 * hundred committed notes that go stale in a week are worse than a script.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const out = path.join(root, ".capture", "vault");

const key = (d) =>
    [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");

// Knobs the snippets on the site have to match, kept in one place.
const SERIES_RANGE = "";
const STREAK_COLUMNS = "2";

/** Minutes as a duration the way people type them: `7h 38min`, sometimes `6:55` or `8h 5m`. */
function duration(minutes, back) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (back % 5 === 2) return `"${h}:${String(m).padStart(2, "0")}"`;
    if (m === 0) return `"${h}h"`;
    return back % 7 === 3 ? `"${h}h ${m}m"` : `"${h}h ${m}min"`;
}

/**
 * Sleep as a duration, on the last five months only: the heatmap then shows
 * where tracking began. The same seasonal and weekly wave as `sleep_score`,
 * this week a little better than the last, and the last five nights over 7h
 * after a short one, so "7h+ nights in a row" has a run to count.
 */
function sleepHours(back, seasonal, weekly) {
    if (back > 150) return [];
    const noise = ((back * 7) % 11) - 5;
    let minutes = Math.round(435 + seasonal * 30 + weekly * 35 + noise * 4 - (back % 13 === 6 ? 50 : 0));
    if (back <= 3) minutes += 20;
    if (back <= 4) minutes = Math.max(minutes, 425);
    if (back === 5) minutes = 400;
    return [`sleep: ${duration(Math.min(530, Math.max(340, minutes)), back)}`];
}

/** A run's time at 5:10 to 6:00 a km, as `51min`, `1h 12m` or `0:48:30`. */
function runTime(km, back) {
    const seconds = Math.round((km * (310 + ((back * 13) % 51))) / 10) * 10;
    const minutes = Math.round(seconds / 60);
    if (back % 3 === 1) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `"${h}:${String(m).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}"`;
    }
    if (minutes < 60) return `"${minutes}min"`;
    return `"${Math.floor(minutes / 60)}h ${minutes % 60}m"`;
}

/**
 * Triathlon training by weekday. Runs on Tuesday, Thursday, a long one on
 * Sunday and every other Saturday; a build-up over the last two months, so
 * the weekly bars cross a 30 km goal both ways; two weeks with no running
 * three months back (an injury), which the chart must show as a gap, not a
 * zero. Rides on Wednesday and the other Saturdays, swims on Monday and every
 * other Friday. Rest days carry no property at all.
 */
function training(back, weekday, weeksBack) {
    const lines = [];
    const injured = weeksBack === 12 || weeksBack === 13;
    // Built up to a peak three weeks back, then an easier fortnight, so this
    // week, back to full load, reads up on the same days of the last.
    const build = [1.3, 0.85, 0.9, 1.3, 1.25, 1.15, 1.05, 1][weeksBack] ?? 1;
    const plan = { 2: 6 + (weeksBack % 3), 4: 7 + (weeksBack % 2) * 1.5, 0: 10 + (weeksBack % 4) };
    if (weekday === 6 && weeksBack % 2 === 0) plan[6] = 5;
    const base = plan[weekday];
    if (base !== undefined && !injured) {
        const km = Math.round(Math.min(14, base * build) * 10) / 10;
        lines.push(`run_km: ${km}`, `run_time: ${runTime(km, back)}`);
    }
    const ride = weekday === 3 ? 90 + (weeksBack % 3) * 15 : weekday === 6 && weeksBack % 2 === 1 ? 120 + (weeksBack % 4) * 15 : 0;
    if (ride) lines.push(`bike_time: ${duration(ride, 0)}`);
    const swim = weekday === 1 ? 35 + (weeksBack % 5) * 4 : weekday === 5 && weeksBack % 2 === 0 ? 45 + (weeksBack % 3) * 5 : 0;
    if (swim) lines.push(`swim_time: "${swim}min"`);
    return lines;
}

/**
 * A meditation checkbox: a current run of twelve days ending today, a best run
 * of 31 days four to five months back, and short runs everywhere else, broken
 * by an unticked day every week or so.
 */
function meditated(back) {
    if (back <= 11) return true;
    if (back === 12 || back === 124 || back === 156) return false;
    if (back >= 125 && back <= 155) return true;
    return !(back % 6 === 1 || back % 11 === 7);
}

/**
 * Properties for the site guides, added rather than edited so no existing
 * picture moves.
 *
 * `read`: a second checkbox for the two-activities heatmap. Tuesday, Thursday
 * and Sunday all year, plus Fridays in the last ten weeks, where it lands on
 * gym's standing Friday: those days paint orange, the first layer, which is
 * the point the guide makes. Gym's two-week push also covers reading days.
 *
 * `deep_work`: a workday habit for the weekend-skipping streak. Weekends
 * carry no property at all. Kept every workday in the last two weeks and in
 * the best run (125..155 back, the same unbroken stretch `meditate` uses),
 * otherwise missed now and then. `vacation: true` marks one holiday week,
 * 15..21 back, which has notes (no missed-note day falls in it), so
 * `skip_field` bridges it and the current run reaches past it.
 */
function guideHabits(back, weekday) {
    const lines = [`read: ${weekday === 0 || weekday === 2 || weekday === 4 || (weekday === 5 && back < 70)}`];
    const vacation = back >= 15 && back <= 21;
    if (vacation) lines.push("vacation: true");
    if (weekday !== 0 && weekday !== 6) {
        const kept = back <= 14 || (back >= 125 && back <= 155);
        lines.push(`deep_work: ${vacation ? false : kept ? true : back % 9 !== 4}`);
    }
    return lines;
}

/**
 * The weekly chart guide's "From `dataviewjs` to Dashy" picture: the same
 * weekly chart as a Dataview script drawn by Obsidian Charts, and as a Dashy
 * block. Both snippets are the guide's, verbatim, and the third-party side
 * keeps its defaults: styling it either way would make the comparison
 * dishonest.
 *
 * Optional. The two plugins are never downloaded here and never committed:
 * they are copied from `.capture/livecheck/` when someone put them there. The
 * copies stay disabled; the capture spec switches them on for this shot only.
 */
const COMPARE_PLUGINS = ["dataview", "obsidian-charts"];
const COMPARE_NOTE = `## dataviewjs + Obsidian Charts

\`\`\`dataviewjs
const weeks = {};
for (const p of dv.pages('"Diary"').where(p => p.run_km && p.file.day)) {
  const key = p.file.day.startOf("week").toFormat("yyyy-MM-dd");
  weeks[key] = (weeks[key] ?? 0) + p.run_km;
}
const labels = Object.keys(weeks).sort().slice(-26);
window.renderChart({
  type: "bar",
  data: { labels, datasets: [{ label: "Run, km", data: labels.map(k => weeks[k]) }] },
}, this.container);
\`\`\`

## Dashy

\`\`\`dashy-chart
source: Diary
field: run_km
type: bar
bucket: week
unit: km
goal: 30
\`\`\`
`;

function compareSetup() {
    const from = path.join(root, ".capture", "livecheck", ".obsidian", "plugins");
    const missing = COMPARE_PLUGINS.filter((id) => !fs.existsSync(path.join(from, id, "main.js")));
    if (missing.length > 0) {
        console.log(`[capture] no ${missing.join(", ")} under .capture/livecheck: the dataviewjs comparison shot is skipped`);
        return;
    }
    for (const id of COMPARE_PLUGINS) {
        fs.cpSync(path.join(from, id), path.join(out, ".obsidian", "plugins", id), { recursive: true });
    }
    const settings = path.join(out, ".obsidian", "plugins", "dataview", "data.json");
    const current = fs.existsSync(settings) ? JSON.parse(fs.readFileSync(settings, "utf8")) : {};
    fs.writeFileSync(settings, JSON.stringify({ ...current, enableDataviewJs: true }, null, 2) + "\n");
    fs.writeFileSync(path.join(out, "Dataview compare.md"), COMPARE_NOTE);
}

/**
 * The notes behind the birthday, books-per-year and homepage guides (B-155),
 * in folders of their own, so no count on an existing picture moves: every
 * existing block reads `Diary`, `Books` or `Inbox`. Each block below is the
 * guide's YAML verbatim, except the homepage's holiday date, which follows
 * the year the way `Dashboard.md`'s countdown does.
 *
 * `People`: Anna's birthday 28 days ahead, her 35th, and Leo born on
 * 29 February. `Documents`: a passport years ahead and a first aid
 * certificate 40 days past, so one card counts up. `Reading`: a log from five
 * years back with this year a little ahead of last year to date, two books
 * not finished yet (no `date_read`), and one empty year so the chart's 0
 * shows. `Projects`: four notes with the folder note next to the folder.
 */
function guideNotes(today) {
    const year = today.getFullYear();
    const shift = (days) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
    const write = (rel, text) => {
        fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
        fs.writeFileSync(path.join(out, rel), text);
    };

    const anna = shift(28);
    const annaBorn = new Date(anna.getFullYear() - 35, anna.getMonth(), anna.getDate());
    write("People/Anna.md", `---\nname: Anna\nbirthday: ${key(annaBorn)}\n---\n\nLikes: climbing, Japanese whisky.\n`);
    write("People/Leo.md", "---\nname: Leo\nbirthday: 2000-02-29\n---\n");
    write("Documents/Passport.md", `---\ntype: passport\nexpires: ${key(shift(1621))}\n---\n`);
    write("Documents/First aid.md", `---\ntype: first-aid\nexpires: ${key(shift(-40))}\n---\n`);

    // Books a year, five years back to last year; the year three back is empty.
    const perYear = [14, 19, 0, 21, 25];
    let n = 0;
    const book = (finished) => {
        n += 1;
        write(`Reading/Book ${n}.md`, `---\ndate_read: ${key(finished)}\npages: ${180 + ((n * 37) % 420)}\nrating: ${3 + (n % 3)}\n---\n`);
    };
    perYear.forEach((count, i) => {
        for (let b = 0; b < count; b++) book(new Date(year - 5 + i, 0, 1 + Math.floor(((b + 0.5) / count) * 364)));
    });
    // This year at a pace of 28 a year up to today, against last year's 25:
    // the `compare` delta on "Books this year" reads up.
    const daysSoFar = Math.round((today.getTime() - new Date(year, 0, 1).getTime()) / 86_400_000);
    const thisYear = Math.max(1, Math.floor((28 * (daysSoFar + 1)) / 365));
    for (let b = 0; b < thisYear; b++) book(new Date(year, 0, 1 + Math.floor(((b + 0.5) / thisYear) * daysSoFar)));
    write("Reading/Still reading.md", "---\nstatus: reading\npages: 320\n---\n");
    write("Reading/Next up.md", "---\nstatus: to-read\npages: 210\n---\n");

    for (const name of ["Garden", "Kitchen", "Conference talk", "Archive/Old website"]) {
        write(`Projects/${name}.md`, `# ${name.replace(/.*\//, "")}\n`);
    }
    write("Projects.md", "# Projects\n");

    write("Birthdays.md", `\`\`\`countdown
items:
  - { label: Anna, field: birthday, repeat: yearly, source: People, where: "name = Anna", icon: 🎂 }
  - { label: Leo, field: birthday, repeat: yearly, source: People, where: "name = Leo", icon: 🎂 }
  - { label: Our wedding, date: 2015-06-20, repeat: yearly, icon: 💍 }
\`\`\`

\`\`\`countdown
columns: 2
items:
  - { label: Passport, field: expires, where: "type = passport", icon: 🛂 }
  - { label: First aid certificate, field: expires, where: "type = first-aid", icon: ⛑️ }
\`\`\`
`);

    write("Reading log.md", `\`\`\`stats
source: Reading
date_field: date_read
period: year
items:
  - { label: Books this year, agg: count, compare: true, better: up, icon: 📚 }
  - { label: Pages this year, field: pages, agg: sum }
  - { label: Average rating, field: rating, agg: avg, precision: 1 }
\`\`\`

\`\`\`chart
source: Reading
date_field: date_read
agg: count
bucket: year
type: bar
range: 1825d
label: Books
goal: 24
\`\`\`
`);

    write("Home.md", `\`\`\`today
clock: true
daily: true
weekly: true
\`\`\`

\`\`\`stats
layout: inline
items:
  - { label: notes, agg: count }
  - { label: in the inbox, source: Inbox, agg: count }
  - { label: diary days this month, source: Diary, agg: count, period: month }
  - { label: books this year, source: Reading, date_field: date_read, period: year, agg: count }
\`\`\`

\`\`\`tiles
items:
  - { label: Inbox, path: Inbox, icon: 📥, badge: count }
  - { label: Diary, path: Diary, icon: 📔, badge: count, period: week, sub: this week }
  - { label: Reading, path: Reading, icon: 📚, badge: count }
  - { label: Projects, path: Projects, icon: 🗂, badge: count, accent: true }
\`\`\`

\`\`\`countdown
items:
  - { label: Holiday, date: ${year + 1}-01-20, icon: 🏖 }
  - { label: Anna, field: birthday, repeat: yearly, source: People, where: "name = Anna", icon: 🎂 }
  - { label: Passport, field: expires, where: "type = passport", icon: 🛂 }
\`\`\`
`);

    // The monthly habit calendar guide (B-161): its whole note, verbatim.
    // It reads the `gym`, `read`, `meditate` and `vacation` properties the
    // diary already carries, so it adds no note of its own beyond this one
    // (which, like every note here, the homepage's whole-vault count sees).
    write("Habit calendar.md", `\`\`\`heatmap
source: Diary
range: month
layout: calendar
layers:
  - { field: gym, color: orange, label: Gym }
  - { field: read, color: green, label: Reading }
  - { field: meditate, color: purple, label: Meditation }
\`\`\`

\`\`\`heatmap
source: Diary
field: gym
color: orange
range: week
layout: calendar
skip_field: vacation
\`\`\`
`);

    // The weekly review guide (B-163): its two templates, verbatim, in notes
    // named for last week (ISO, the format Dashy reads without Periodic Notes
    // settings) and last month, both over, so `compare: true` reads the whole
    // period before. They read `sleep_score`, `gym`, `steps` and `meditate`,
    // which the diary already carries.
    const REVIEW_STATS = `\`\`\`stats
source: Diary
period: note
columns: 2
items:
  - { label: Sleep, field: sleep_score, agg: avg, compare: usual, better: up }
  - { label: Gym days, field: gym, agg: sum, compare: true, better: up }
  - { label: Steps a day, field: steps, agg: avg, precision: 0, compare: true, better: up }
  - { label: Meditation in a row, field: meditate, agg: current_streak, unit: days }
\`\`\``;
    const lastWeek = shift(-7);
    write(`Reviews/${isoWeekName(lastWeek)}.md`, `${REVIEW_STATS}

\`\`\`chart
source: Diary
field: steps
label: Steps
type: bar
range: note
goal: 10000
\`\`\`

## What went well

## What to change
`);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    write(`Reviews/${key(lastMonth).slice(0, 7)}.md`, `${REVIEW_STATS}

\`\`\`heatmap
source: Diary
range: note
layout: calendar
layers:
  - { field: gym, color: orange, label: Gym }
  - { field: meditate, color: purple, label: Meditation }
\`\`\`

## The month in a few lines
`);
}

/** The ISO week a date falls in, named the way Dashy reads it without settings: `2026-W40`. */
function isoWeekName(date) {
    // The Thursday of the date's week decides its ISO year and week.
    const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 3 - ((date.getDay() + 6) % 7));
    const dayOfYear = Math.round((thursday.getTime() - new Date(thursday.getFullYear(), 0, 1).getTime()) / 86_400_000);
    const week = Math.floor(dayOfYear / 7) + 1;
    return `${thursday.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function build() {
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(path.join(out, "Diary"), { recursive: true });
    fs.mkdirSync(path.join(out, "Inbox"), { recursive: true });
    fs.mkdirSync(path.join(out, "Books"), { recursive: true });
    fs.mkdirSync(path.join(out, ".obsidian"), { recursive: true });

    const today = new Date();
    // Date-only: `today` still carries the hour the script happened to run
    // at, and that hour crossing midnight nudged the last book's `finished`
    // date computed below into tomorrow, which `period: year` then excludes
    // (this year's book count flipped 15/16 depending on the time of day).
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // A year of days with a believable rhythm: a slow seasonal swing, a weekly
    // one, and gaps where life got in the way. Flat noise looks generated.
    let days = 0;
    // Weeks start on Sunday in the capture's English locale, the same as the
    // chart's week buckets, so "this week" and "two weeks off" line up with bars.
    const todayWeekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
    for (let back = 364; back >= 0; back--) {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
        const seasonal = Math.sin((back / 365) * Math.PI * 2);
        const weekly = Math.sin((back / 7) * Math.PI * 2);
        // The meditation streaks below need unbroken runs of notes: the last
        // two weeks and the best run, four to five months back.
        const unbroken = back < 14 || (back >= 125 && back <= 155);
        if (!unbroken && (back % 17 === 5 || back % 23 === 11)) continue; // missed days
        days += 1;
        const sleep = Math.round(80 + seasonal * 8 + weekly * 5);
        const steps = Math.round(9500 + seasonal * 2500 + weekly * 2000 + (back % 5) * 300);

        // A habit checkbox, not a number. Monday/Wednesday/Friday are the
        // standing plan, kept all year so no stretch of the grid ever reads
        // as "gave up" — a seasonal gate that zeroes out half the year was
        // tried and rejected for exactly that. Saturday is a bonus session
        // added only in the easier half of the year, which is what varies
        // the adherence rate without ever emptying a season. A two-week push
        // and a break sit on top: real training has both. The push's range
        // (41..54 back) sits inside a stretch with no missed-day note gaps,
        // so it reads as a real fourteen-day streak rather than one cut short
        // by an unrelated missing note.
        const weekday = date.getDay(); // 0 Sun .. 6 Sat
        const gymCore = weekday === 1 || weekday === 3 || weekday === 5; // Mon/Wed/Fri
        const gymSaturday = weekday === 6 && Math.sin((back / 365) * Math.PI * 2) > 0;
        const gymPushRest = back === 40 || back === 55; // a rest day bracketing the push below
        const gymPush = back >= 41 && back < 55; // a strong fortnight, every day counts
        const gymBreak = back >= 110 && back < 129; // an off patch, months back: injury or travel
        // The current week picks up Tuesday and Thursday too, so "this week"
        // honestly beats the same days of last week on any run date after Monday.
        const gymRecent = back < 7 && (weekday === 2 || weekday === 4);
        const gym = gymBreak ? false : gymPushRest ? false : gymPush ? true : gymCore || gymSaturday || gymRecent;

        const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate() - weekday);
        const weeksBack = Math.round((todayWeekStart.getTime() - weekStart.getTime()) / (7 * 86_400_000));
        const extra = [
            ...sleepHours(back, seasonal, weekly),
            ...training(back, weekday, weeksBack),
            `meditate: ${meditated(back)}`,
            ...guideHabits(back, weekday),
        ];

        fs.writeFileSync(
            path.join(out, "Diary", `${key(date)}.md`),
            `---\nsleep_score: ${sleep}\nsteps: ${steps}\ngym: ${gym}\n${extra.join("\n")}\n---\n\n## ${key(date)}\n`,
        );
    }

    for (let i = 1; i <= 7; i++) {
        fs.writeFileSync(path.join(out, "Inbox", `idea-${i}.md`), `# Idea ${i}\n`);
    }
    for (let i = 1; i <= 23; i++) {
        const thisYear = i % 3 !== 0;
        const bookYear = thisYear ? today.getFullYear() : today.getFullYear() - 1;
        // Spread `finished` dates across the book's year so `period: year`
        // (see the stats and progress blocks below) counts a believable
        // subset instead of every book landing on the same day. This year's
        // books stop at today, since a book cannot be finished tomorrow.
        const yearStart = new Date(bookYear, 0, 1);
        const yearEnd = thisYear ? todayMidnight : new Date(bookYear, 11, 31);
        const span = Math.round((yearEnd.getTime() - yearStart.getTime()) / 86_400_000);
        const finished = key(new Date(bookYear, 0, 1 + Math.floor((i / 23) * span)));
        fs.writeFileSync(
            path.join(out, "Books", `book-${i}.md`),
            `---\nyear: ${bookYear}\nrating: ${3 + (i % 3)}\nfinished: ${finished}\n---\n\n# Book ${i}\n`,
        );
    }

    const year = today.getFullYear();
    fs.writeFileSync(path.join(out, "Dashboard.md"), `\`\`\`today
daily: true
weekly: true
monthly: true
\`\`\`

\`\`\`tiles
columns: 4
items:
  - { label: Inbox, path: Inbox, icon: 📥, badge: count }
  - { label: Diary, path: Diary, icon: 📔, badge: count, sub: one note a day }
  - { label: Books, path: Books, icon: 📚, badge: count }
  - { label: Sport, path: Diary, icon: 🏃, accent: true, sub: training log }
\`\`\`

\`\`\`stats
columns: 4
items:
  - { label: Days logged, source: Diary, agg: count, icon: 📔 }
  - { label: Average sleep, source: Diary, field: sleep_score, agg: avg, precision: 1, trend: 30d }
  - { label: Steps this week, source: Diary, field: steps, agg: sum, unit: steps, period: week }
  - { label: Best night, source: Diary, field: sleep_score, agg: max, trend: 90d }
  - { label: Longest streak, source: Diary, field: sleep_score, agg: streak, unit: days }
  - { label: Latest steps, source: Diary, field: steps, agg: latest, sub: most recent note }
  - { label: Great nights, source: Diary, where: "sleep_score >= 90", agg: count }
  - { label: Books read, source: Books, period: year, date_field: finished, agg: count, icon: 📚 }
\`\`\`

\`\`\`progress
items:
  - { label: Days logged this year, source: Diary, agg: count, goal: 365, icon: 📔 }
  - { label: Books this year, source: Books, period: year, date_field: finished, agg: count, goal: 24, icon: 📚 }
  - { label: Steps, source: Diary, field: steps, agg: sum, goal: 3000000, unit: steps, sub: three million }
\`\`\`

\`\`\`countdown
columns: 3
items:
  - { label: IRONMAN 70.3, date: ${year + 1}-06-14, icon: 🏊 }
  - { label: Holiday, date: ${year + 1}-01-20, icon: 🏖, sub: two weeks off }
  - { label: Review, date: ${year + 1}-03-01, icon: 🗒 }
\`\`\`

\`\`\`heatmap
source: Diary
field: sleep_score
color: purple
bands: [90, 80, 70]
title: Sleep, last twelve months
\`\`\`

\`\`\`heatmap
source: Diary
field: steps
color: green
bands: [12000, 9000, 6000]
title: Steps, last twelve months
\`\`\`

\`\`\`stats
columns: 4
items:
  - { label: Gym days, source: Diary, field: gym, agg: sum, icon: 🏋️ }
  - { label: Longest gym streak, source: Diary, field: gym, agg: streak, unit: days, icon: 🔥 }
  - { label: Gym this week, source: Diary, field: gym, agg: sum, period: week, icon: 📅, compare: true, better: up }
  - { label: Gym this month, source: Diary, field: gym, agg: sum, period: month, icon: 🗓 }
\`\`\`

\`\`\`heatmap
source: Diary
field: gym
color: orange
title: Gym
\`\`\`
`);

    // The file name is the heading Obsidian draws, so the note has none of its own.
    fs.writeFileSync(path.join(out, "A config with a mistake.md"), `\`\`\`heatmap
source: Diary
feild: sleep_score
\`\`\`

\`\`\`stats
items:
  - { label: Average sleep, source: Diary, agg: avgg, field: sleep_score }
  - { label: Great nights, source: Diary, where: "sleep_score >= 90 or steps > 10000", agg: count }
\`\`\`

\`\`\`chart
source: Diary
field: sleep_score
layers: [sleep_score]
\`\`\`
`);

    // The 2.0 hero (B-184): what an agent wrote, given only the Dashy skill and
    // the prompt in scripts/agent-hero.cjs, run against this vault on
    // 2026-10-06. The blocks are its output word for word; only the marathon's
    // year follows the vault's dates, by the agent's own rule: this year's
    // 17 May if it is still ahead, else next year's.
    // Re-run the agent rather than editing this by hand: the picture claims
    // the agent wrote it.
    const marathon = today < new Date(year, 4, 17) ? year : year + 1;
    fs.writeFileSync(path.join(out, "Running.md"), `\`\`\`countdown
items:
  - { label: Marathon, date: ${marathon}-05-17, icon: 🏅 }
\`\`\`

\`\`\`stats
source: Diary
columns: 2
items:
  - { label: This week, field: run_km, agg: sum, period: week, compare: true, better: up, unit: km, icon: 🏃 }
  - { label: Current streak, field: run_km, agg: current_streak, unit: days, icon: 🔥 }
\`\`\`

\`\`\`chart
source: Diary
field: run_km
type: bar
bucket: week
unit: km
goal: 40
title: Weekly distance
\`\`\`
`);

    // Blocks photographed one at a time, each YAML exactly as the site prints it.
    fs.writeFileSync(path.join(out, "Charts.md"), `\`\`\`chart
source: Diary
field: run_km
type: bar
bucket: week
unit: km
goal: 30
\`\`\`

\`\`\`chart
source: Diary
type: bar
bucket: week
${SERIES_RANGE ? `range: ${SERIES_RANGE}\n` : ""}series:
  - { field: run_time, label: Run }
  - { field: bike_time, label: Bike, color: orange }
  - { field: swim_time, label: Swim, color: cyan }
\`\`\`

\`\`\`stats
${STREAK_COLUMNS ? `columns: ${STREAK_COLUMNS}\n` : ""}items:
  - { label: Days in a row, source: Diary, field: meditate, agg: current_streak, unit: days, icon: 🔥 }
  - { label: Best streak, source: Diary, field: meditate, agg: streak, unit: days }
\`\`\`
`);

    fs.writeFileSync(path.join(out, "Sleep.md"), `\`\`\`stats
columns: 3
items:
  - { label: Sleep this week, source: Diary, field: sleep, agg: avg, period: week, compare: true, better: up }
  - { label: Shortest night, source: Diary, field: sleep, agg: min, period: month }
  - { label: 7h+ nights in a row, source: Diary, field: sleep, agg: current_streak, at_least: 7h }
\`\`\`

\`\`\`chart
source: Diary
field: sleep
agg: avg
goal: 8h
\`\`\`

\`\`\`heatmap
source: Diary
field: sleep
color: purple
bands: [8h, 7h, 6h]
range: 182d
\`\`\`
`);

    fs.writeFileSync(path.join(out, "Workdays.md"), `\`\`\`stats
columns: 3
items:
  - { label: Workdays in a row, source: Diary, field: deep_work, agg: current_streak, days: weekdays, skip_field: vacation, unit: days, icon: 💻 }
  - { label: With weekends, source: Diary, field: deep_work, agg: current_streak, unit: days }
  - { label: Best run of workdays, source: Diary, field: deep_work, agg: streak, days: weekdays, skip_field: vacation, unit: days }
\`\`\`

\`\`\`heatmap
source: Diary
field: deep_work
skip_field: vacation
color: blue
range: 91d
title: Deep work
\`\`\`
`);

    fs.writeFileSync(path.join(out, "Layers.md"), `\`\`\`heatmap
source: Diary
layers:
  - { field: gym, color: orange, label: Gym }
  - { field: read, color: green, label: Reading }
title: Gym and reading
\`\`\`
`);

    guideNotes(todayMidnight);

    fs.writeFileSync(path.join(out, ".obsidian", "community-plugins.json"), '["dashsidian"]\n');
    fs.writeFileSync(
        path.join(out, ".obsidian", "app.json"),
        JSON.stringify({ promptDelete: false, showLineNumber: false }, null, 2) + "\n",
    );
    fs.writeFileSync(
        path.join(out, ".obsidian", "appearance.json"),
        JSON.stringify({ theme: "obsidian", showRibbon: false }, null, 2) + "\n",
    );
    fs.writeFileSync(
        path.join(out, ".obsidian", "workspace.json"),
        JSON.stringify({
            main: {
                id: "cap-main", type: "split", direction: "vertical",
                children: [{
                    id: "cap-tabs", type: "tabs",
                    children: [{
                        id: "cap-leaf", type: "leaf",
                        state: {
                            type: "markdown",
                            state: { file: "Dashboard.md", mode: "preview", source: false },
                            icon: "lucide-file", title: "Dashboard",
                        },
                    }],
                }],
            },
            left: { id: "cap-left", type: "split", children: [], direction: "horizontal", width: 0, collapsed: true },
            right: { id: "cap-right", type: "split", children: [], direction: "horizontal", width: 0, collapsed: true },
            active: "cap-leaf",
            lastOpenFiles: ["Dashboard.md", "A config with a mistake.md"],
        }, null, 2) + "\n",
    );

    compareSetup();

    // Symlink the built plugin in, the way the E2E setup does.
    const pluginDir = path.join(out, ".obsidian", "plugins", "dashsidian");
    fs.mkdirSync(pluginDir, { recursive: true });
    for (const f of ["main.js", "manifest.json", "styles.css"]) {
        fs.symlinkSync(path.join(root, f), path.join(pluginDir, f));
    }

    console.log(`[capture] demo vault: ${out} (${days} diary notes)`);
}

build();

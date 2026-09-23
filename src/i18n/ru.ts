import type { Catalog } from "./en";

/**
 * Russian catalog. Typed as a partial one on purpose: a language may lag
 * behind `en.ts` without breaking the build, and the missing keys simply
 * fall back to English.
 */
export const ru: Catalog = {
    "parse.emptyBlock": "Блок пустой.",
    "parse.yamlError": "Не разобрать YAML: {message}",
    "parse.unknownKey": "Ключ «{key}» неизвестен и пропущен.",
    "parse.unknownKeyGuess": "Ключ «{key}» неизвестен. Возможно, имелся в виду «{guess}».",

    "render.line": "строка {line}",

    "bands.hasData": "есть данные",
    "bands.from": "от {min}",

    "where.noSuchFolder": "Под `{folder}` ничего нет — числа ниже посчитаны по пустоте. Укажите в `source` свою папку.",
    "where.unreadable":
        "`where: {where}` не разобрать, условие пропущено — числа ниже без фильтра. Ожидается что-то вроде `year = 2026`, `rating >= 4` или `tags contains книги`.",
    "where.conjunction":
        "В `where: {where}` больше одного условия, а поддерживается одно — фильтр пропущен. Сузьте через `source` или `tag`, либо возьмите значение в кавычки, если слово — его часть.",

    "tiles.empty": "Список плиток пуст. Ожидается `items:` или массив.",

    "stats.empty": "Список карточек пуст. Ожидается `items:` или массив.",
    "stats.unlabeledCard": "карточка без подписи",
    "stats.unknownAgg": "{card}: агрегат «{agg}» неизвестен. Доступны: {available}.",
    "stats.unknownAggGuess":
        "{card}: агрегат «{agg}» неизвестен. Возможно, «{guess}». Доступны: {available}.",
    "stats.fieldRequired":
        "{card}: агрегату «{agg}» нужно число — добавь `field:` с полем frontmatter.",
    "stats.badPrecision":
        "{card}: `precision` ожидает целое от 0 до {max}, получено «{value}» — округляю по умолчанию.",

    "progress.empty": "Список полос пуст. Ожидается `items:` или массив.",
    "progress.goalRequired": "{card}: `goal:` ожидает число — иначе не к чему стремиться.",
    "progress.goalNotPositive": "{card}: цель {goal} нечем заполнять — она должна быть больше нуля.",

    "stats.trendNeedsField": "{card}: `trend` нужно `field:` — у счёта заметок нет формы.",
    "stats.trendInvalid": "{card}: `trend` ожидает число дней, например 30d, получено «{value}».",

    "countdown.empty": "Список дат пуст. Ожидается `items:` или массив.",
    "countdown.dateRequired": "{card}: не задан `date:` — не до чего считать.",
    "countdown.dateInvalid": "{card}: «{date}» не похоже на дату. Ожидается YYYY-MM-DD.",
    "countdown.today": "Сегодня",
    "countdown.daysLeft.one": "день остался",
    "countdown.daysLeft.few": "дня осталось",
    "countdown.daysLeft.many": "дней осталось",
    "countdown.daysLeft.other": "дня осталось",
    "countdown.daysAgo.one": "день назад",
    "countdown.daysAgo.few": "дня назад",
    "countdown.daysAgo.many": "дней назад",
    "countdown.daysAgo.other": "дня назад",

    "today.expectFields": "Ожидается набор полей, например `daily: true`.",
    "today.nothingToShow": "Нечего показывать: включи `daily`, `weekly` или `monthly`.",
    "today.notBoolean": "`{key}` ожидает true или false, получено «{value}» — считаю за {read}.",
    "today.daily": "Сегодня",
    "today.weekly": "Эта неделя",
    "today.monthly": "Этот месяц",
    "today.missingNote": "{path} — заметки ещё нет, клик её создаст",

    "heatmap.expectFields": "Ожидается набор полей, например `source:` и `field:`.",
    "heatmap.fieldRequired": "Не задано `field` — какое число из frontmatter красить.",
    "heatmap.noData":
        "Нет заметок с именем-датой и числом в поле «{field}». Проверь `source`.",
    "heatmap.titleYear": "{title} — {year}",
    "heatmap.caption": "{year} — {field}: среднее {average}, {present} из {total} дн.",
    "heatmap.cell": "{date} — {field} {value}",
    "heatmap.cellEmpty": "{date} — нет данных",

    "insert.name": "Вставить блок",
    "insert.placeholder": "Какой блок?",
    "block.tiles": "Плитки навигации со счётчиками",
    "block.stats": "Карточки чисел по выборке заметок",
    "block.progress": "Полосы к цели",
    "block.today": "Сегодняшняя дата и периодические заметки",
    "block.countdown": "Сколько дней до даты",
    "block.heatmap": "Год по дням, раскрашенный числом",

    "about.heading": "О плагине",
    "about.bug": "Сообщить об ошибке",
    "about.bugDesc": "Откроет GitHub с уже подставленными версиями.",
    "about.feature": "Предложить возможность",
    "about.featureDesc": "Расскажите, что хотели собрать и не вышло.",
    "about.docs": "Документация",
    "about.docsDesc": "Все блоки и ключи с примерами.",
    "about.funding": "Купить мне кофе",
    "about.fundingDesc": "Плагин бесплатный и останется таким. Это только если захочется.",
    "about.open": "Открыть",

    "settings.periodicHeading": "Периодические заметки",
    "settings.dailyFolder": "Папка заметок дня",
    "settings.dailyFolderDesc": "Оставьте пустым, чтобы взять настройки плагина Periodic Notes.",
    "settings.weeklyFolder": "Папка заметок недели",
    "settings.monthlyFolder": "Папка заметок месяца",
    "settings.followPeriodic": "Нужна блоку today. Пусто — берём из Periodic Notes.",
    "settings.skillHeading": "Скилл для ИИ-агента",
    "settings.skillName": "Файл скилла в этом хранилище",
    "settings.skillNotInstalled":
        "Запишет {path}, чтобы агент (Claude Code, Cursor) писал эти блоки за вас.",
    "settings.skillCurrent": "Установлен, версия {version}. Делать нечего.",
    "settings.skillOutdated": "Установлена версия {installed}, доступна {available}.",
    "settings.agentsName": "AGENTS.md в корне хранилища",
    "settings.agentsNotInstalled":
        "Запишет {path} для агентов, которые не читают скиллы Claude, — Cursor, Codex и прочих. Наша только секция между маркерами, остальное в файле не трогаем.",
    "settings.agentsCurrent": "Записан, версия {version}. Делать нечего.",
    "settings.agentsOutdated": "Записана версия {installed}, доступна {available}.",
    "settings.agentsUntouched":
        "В {path} есть недописанная секция Dashy, файл оставлен как есть. Уберите лишний маркер и повторите.",

    "settings.install": "Установить",
    "settings.update": "Обновить",
    "settings.copyMarkdown": "Скопировать markdown",
    "settings.copied": "Markdown скилла скопирован.",
    "settings.written": "Скилл записан в {path}",
    "settings.writeFailed": "Не удалось записать скилл: {message}",
    "settings.copyFailed": "Не удалось скопировать: {message}. Нажмите «Установить».",
};

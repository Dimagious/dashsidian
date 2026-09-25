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

    "where.noSuchFolder": "Под `{folder}` ничего нет. Числа ниже посчитаны по пустоте. Укажите в `source` свою папку.",
    "where.unreadable":
        "`where: {where}` не разобрать, условие пропущено. Числа ниже без фильтра. Ожидается что-то вроде `year = 2026`, `rating >= 4` или `tags contains книги`.",
    "where.conjunction":
        "В `where: {where}` больше одного условия, а поддерживается одно. Фильтр пропущен. Сузьте через `source` или `tag`, либо возьмите значение в кавычки, если слово входит в него.",

    "tiles.empty": "Список плиток пуст. Ожидается `items:` или массив.",

    "stats.empty": "Список карточек пуст. Ожидается `items:` или массив.",
    "stats.unlabeledCard": "карточка без подписи",
    "stats.unknownAgg": "{card}: агрегат «{agg}» неизвестен. Доступны: {available}.",
    "stats.unknownAggGuess":
        "{card}: агрегат «{agg}» неизвестен. Возможно, «{guess}». Доступны: {available}.",
    "stats.fieldRequired":
        "{card}: агрегату «{agg}» нужно число. Добавь `field:` с полем frontmatter.",
    "stats.fieldMissing":
        "{card}: ни у одной заметки в выборке нет «{field}». Проверьте имя и `source`.",
    "stats.fieldNotNumeric":
        "{card}: «{field}» хранит текст или другое значение, а не число или чекбокс. Чтобы посчитать такие заметки, используйте `where: \"{field} contains ...\"` с `agg: count`.",
    "stats.badPrecision":
        "{card}: `precision` ожидает целое от 0 до {max}, получено «{value}». Округляю по умолчанию.",

    "progress.empty": "Список полос пуст. Ожидается `items:` или массив.",
    "progress.goalRequired": "{card}: `goal:` ожидает число. Иначе не к чему стремиться.",
    "progress.goalNotPositive": "{card}: цель {goal} нечем заполнять. Она должна быть больше нуля.",

    "stats.trendNeedsField": "{card}: `trend` нужно `field:`. У счёта заметок нет формы.",
    "stats.trendInvalid": "{card}: `trend` ожидает число дней, например 30d, получено «{value}».",

    "period.invalid":
        "{card}: `period` ожидает week, month, year или скользящее окно вроде 30d, получено «{value}». Рисуется без окна.",
    "period.noDatedNotes":
        "{card}: ни у одной выбранной заметки нет имени, начинающегося с даты вида YYYY-MM-DD. Добавьте `date_field:`, если дата лежит в свойстве.",
    "period.noDatedNotesField": "{card}: ни у одной выбранной заметки нет даты в «{field}».",
    "period.dateFieldUnused":
        "{card}: `date_field` здесь ни на что не влияет. Он управляет только `period`, `streak`, `latest` и `trend`.",

    "compare.notBoolean": "{card}: `compare` ожидает true или false, получено «{value}». Сравнение пропущено.",
    "compare.needsPeriod": "{card}: `compare` работает только вместе с `period`. Сравнивать не с чем.",
    "compare.streakUnsupported":
        "{card}: `compare` не работает со `streak`. У серии нет отдельного значения за предыдущий период для сравнения.",
    "compare.betterUnused": "{card}: `better` не действует без `compare: true`.",
    "compare.badBetter": "{card}: `better` ожидает `up` или `down`, получено «{value}». Разница остаётся нейтральной.",
    "compare.vsWeek": "относительно тех же дней прошлой недели: {value}",
    "compare.vsMonth": "относительно тех же дней прошлого месяца: {value}",
    "compare.vsYear": "относительно тех же дней прошлого года: {value}",
    "compare.vsDays.one": "за предыдущий день: {value}",
    "compare.vsDays.few": "за предыдущие {count} дня: {value}",
    "compare.vsDays.many": "за предыдущие {count} дней: {value}",
    "compare.vsDays.other": "за предыдущие {count} дней: {value}",

    "countdown.empty": "Список дат пуст. Ожидается `items:` или массив.",
    "countdown.dateRequired": "{card}: не задан `date:`. Не до чего считать.",
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
    "today.notBoolean": "`{key}` ожидает true или false, получено «{value}». Считаю за {read}.",
    "today.daily": "Сегодня",
    "today.weekly": "Эта неделя",
    "today.monthly": "Этот месяц",
    "today.missingNote": "{path}: заметки ещё нет, клик её создаст",

    "heatmap.expectFields": "Ожидается набор полей, например `source:` и `field:`.",
    "heatmap.fieldRequired": "Не задано `field`. Какое число из frontmatter красить.",
    "heatmap.noData":
        "Нет заметок с определяемой датой и числом или чекбоксом в поле «{field}». Проверь `source`, или `date_field`, если дата лежит в свойстве.",
    "heatmap.fieldMissing":
        "Ни у одной заметки в выборке нет «{field}». Проверьте имя и `source`.",
    "heatmap.fieldNotNumeric":
        "«{field}» хранит текст или другое значение, а не число или чекбокс. Чтобы посчитать такие заметки, используйте `where: \"{field} contains ...\"` с `agg: count` в карточке stats.",
    "heatmap.titleYear": "{title} ({year})",
    "heatmap.caption": "{year}, {field}: среднее {average}, {present} из {total} дн.",
    "heatmap.captionMarks": "{year}, {field}: {present} из {total} дн.",
    "heatmap.cell": "{date}: {field} {value}",
    "heatmap.cellEmpty": "{date}: нет данных",

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

    "settings.languageHeading": "Язык",
    "settings.language": "Язык плагина",
    "settings.languageDesc": "На каком языке говорят блоки. По умолчанию. Как в Obsidian.",
    "settings.languageAuto": "Как в Obsidian",

    "settings.periodicHeading": "Периодические заметки",
    "settings.dailyFolder": "Папка заметок дня",
    "settings.dailyFolderDesc": "Оставьте пустым, чтобы взять настройки плагина Periodic Notes.",
    "settings.weeklyFolder": "Папка заметок недели",
    "settings.monthlyFolder": "Папка заметок месяца",
    "settings.followPeriodic": "Нужна блоку today. Пусто. Берём из Periodic Notes.",

    "settings.startDayHeading": "Новый день",
    "settings.startDayHour": "Новый день начинается в",
    "settings.startDayHourDesc":
        "Что каждый блок считает сегодняшним днём: какую заметку открывает блок today и где заканчиваются окна period, compare и trend. Полночь сохраняет текущее поведение и не меняет день самой заметки.",

    "settings.skillHeading": "Скилл для ИИ-агента",
    "settings.skillName": "Файл скилла в этом хранилище",
    "settings.skillNotInstalled":
        "Запишет {path}, чтобы агент (Claude Code, Cursor) писал эти блоки за вас.",
    "settings.skillCurrent": "Установлен, версия {version}. Делать нечего.",
    "settings.skillOutdated": "Установлена версия {installed}, доступна {available}.",
    "settings.agentsName": "AGENTS.md в корне хранилища",
    "settings.agentsNotInstalled":
        "Запишет {path} для агентов, которые не читают скиллы Claude,: Cursor, Codex и прочих. Наша только секция между маркерами, остальное в файле не трогаем.",
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

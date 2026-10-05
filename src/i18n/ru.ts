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
    "parse.unknownKeyHint": "Ключ «{key}» неизвестен. В этом блоке он называется «{hint}».",

    "render.line": "строка {line}",

    "bands.hasData": "есть данные",
    "bands.from": "от {min}",

    "duration.hours": "{value}\u00A0ч",
    "duration.minutes": "{value}\u00A0мин",
    "duration.seconds": "{value}\u00A0с",

    "where.noSuchFolder": "Под `{folder}` ничего нет. Числа ниже посчитаны по пустоте. Укажите в `source` свою папку.",
    "where.unreadable":
        "`where: {where}` не разобрать, условие пропущено. Числа ниже без фильтра. Ожидается что-то вроде `year = 2026`, `rating >= 4` или `tags contains книги`.",
    "where.conjunction":
        "В `where: {where}` есть `or`, а он не поддерживается. Фильтр пропущен, числа ниже без фильтра. Чтобы требовать все условия сразу, соедините их через `and` или перечислите списком, например `[year = 2026, rating >= 4]`; возьмите значение в кавычки, если слово входит в него.",
    "where.badCondition":
        "Условие `{condition}` в `where` не разобрать, поэтому пропущен весь фильтр. Числа ниже без фильтра. Условие выглядит так: `year = 2026`, `rating >= 4` или `tags contains книги`.",
    "where.badItem":
        "В списке `where` есть `{value}`, а это не условие, поэтому пропущен весь фильтр. Числа ниже без фильтра. Каждый пункт списка должен быть одним условием вроде `year = 2026`.",
    "where.emptyList":
        "`where` задан пустым списком, фильтр пропущен, числа ниже без фильтра. Перечислите условия, например `[year = 2026, rating >= 4]`, или уберите ключ.",

    "inherit.rootPeriodInvalid":
        "`period` в корне блока ожидает week, month, year или скользящее окно вроде 30d, получено «{value}». Всё, что его наследует, рисуется без окна.",
    "inherit.rootDateFieldUndated":
        "`date_field` в корне блока: ни у одной заметки, выбранной для {cards}, нет даты в «{field}».",
    "inherit.blankSourceRoot":
        "`source` в корне блока пуст, поэтому читается всё хранилище. Укажите папку или уберите ключ, если нужно всё хранилище.",
    "inherit.blankTagRoot":
        "`tag` в корне блока пуст, поэтому фильтра по тегу нет. Укажите тег или уберите ключ, если фильтр по тегу не нужен.",
    "inherit.blankSource":
        "{card}: `source` пуст, поэтому читается всё хранилище, а не папка из корня блока. Уберите ключ, чтобы унаследовать эту папку.",
    "inherit.blankTag":
        "{card}: `tag` пуст, поэтому фильтра по тегу нет, хотя в корне блока тег задан. Уберите ключ, чтобы унаследовать этот тег.",
    "inherit.blankSourceNoRoot":
        "{card}: `source` пуст, поэтому читается всё хранилище. Укажите папку или уберите ключ, если нужно всё хранилище.",
    "inherit.blankTagNoRoot":
        "{card}: `tag` пуст, поэтому фильтра по тегу нет. Укажите тег или уберите ключ, если фильтр по тегу не нужен.",

    "tiles.empty": "Список плиток пуст. Ожидается `items:` или массив.",
    "tiles.dateFieldUnused": "{card}: `date_field` не действует без `period`.",
    "tiles.selectionUnused": "{card}: `tag`, `where`, `period` и `date_field` только сужают `badge: count`.",
    "tiles.imageMissing": "{card}: изображение «{path}» не найдено.",
    "tiles.imageUnsupported":
        "{card}: `image` ожидает путь в хранилище, `[[викилинк]]` или ссылку `https://`, получено «{value}».",

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
        "{card}: «{field}» хранит текст или другое значение, а не число, длительность вроде `7h 30m` или чекбокс. Чтобы посчитать такие заметки, используйте `where: \"{field} contains ...\"` с `agg: count`.",
    "stats.badPrecision":
        "{card}: `precision` ожидает целое от 0 до {max}, получено «{value}». Округляю по умолчанию.",
    "stats.streakKeysIgnored":
        "{card}: `at_least`, `at_most`, `days` и `skip_field` действуют только при `agg: streak` и `agg: current_streak`, пропущено.",
    "stats.streakThresholdNeedsField":
        "{card}: `at_least` и `at_most` нужны вместе с `field:`, иначе нечего суммировать. Пропущено.",
    "stats.streakThresholdInvalid": "{card}: `{key}` ожидает число или длительность вроде `7h 30m`, получено «{value}». Пропущено.",
    "stats.streakThresholdImpossible":
        "{card}: `at_least` больше `at_most`, ни один день не подойдёт под оба условия. Серия равна 0.",
    "stats.streakDaysInvalid": "{card}: `days` ожидает `all` или `weekdays`, получено «{value}». Использую `all`.",
    "stats.skipFieldInvalid": "{card}: `skip_field` ожидает имя свойства, получено «{value}». Пропущено.",
    "stats.durationMixed": "{card}: в «{field}» смешаны длительности («{durationNote}») и простые числа («{plainNote}»). Всё посчитано в минутах и показано простым числом.",
    "stats.durationUnitIgnored": "{card}: `unit: {unit}` пропущен. В «{field}» длительности, у них уже есть свои единицы.",
    "stats.durationThresholdOnPlain": "{card}: `{key}: {value}` задан как длительность, но в «{field}» простые числа. Порог применён в минутах.",
    "stats.layoutInvalid": "`layout` принимает cards или inline, а получено «{value}». Рисую карточки.",
    "stats.inlineColumnsIgnored": "`columns` не действует при `layout: inline`: там одна строка.",
    "stats.inlineTrendHidden": "`trend` не рисуется при `layout: inline`: {cards}. Чтобы его увидеть, нужен `layout: cards`.",
    "stats.inlineSubHidden": "`sub` не показывается при `layout: inline`: {cards}. Чтобы его увидеть, нужен `layout: cards`.",

    "progress.empty": "Список полос пуст. Ожидается `items:` или массив.",
    "progress.goalRequired": "{card}: `goal:` ожидает число или длительность вроде `7h 30m`. Иначе не к чему стремиться.",
    "progress.goalNotPositive": "{card}: цель {goal} нечем заполнять. Она должна быть больше нуля.",
    "progress.goalDurationOnCount": "{card}: `goal: {value}` задан как длительность, но `agg: {agg}` считает дни или заметки, а не время. Цель применена в минутах.",

    "stats.trendNeedsField": "{card}: `trend` нужно `field:`. У счёта заметок нет формы.",
    "stats.trendInvalid": "{card}: `trend` ожидает число дней, например 30d, получено «{value}».",

    "period.invalid":
        "{card}: `period` ожидает week, month, year или скользящее окно вроде 30d, получено «{value}». Рисуется без окна.",
    "period.noDatedNotes":
        "{card}: ни у одной выбранной заметки нет имени, начинающегося с даты вида YYYY-MM-DD. Добавьте `date_field:`, если дата лежит в свойстве.",
    "period.noDatedNotesField": "{card}: ни у одной выбранной заметки нет даты в «{field}».",
    "period.dateFieldUnused":
        "{card}: `date_field` здесь ни на что не влияет. Он управляет только `period`, `streak`, `current_streak`, `latest` и `trend`.",

    "compare.notBoolean": "{card}: `compare` ожидает true или false, получено «{value}». Сравнение пропущено.",
    "compare.needsPeriod": "{card}: `compare` работает только вместе с `period`. Сравнивать не с чем.",
    "compare.streakUnsupported":
        "{card}: `compare` не работает со `streak` и `current_streak`. У серии нет отдельного значения за предыдущий период для сравнения.",
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
    "countdown.dateRequired": "{card}: не задан ни `date:`, ни `field:`. Не до чего считать.",
    "countdown.dateInvalid": "{card}: «{date}» не похоже на дату. Ожидается YYYY-MM-DD.",
    "countdown.dateAndField": "{card}: заданы и `date:`, и `field:`. Оставьте что-то одно: дату здесь или свойство из заметки.",
    "countdown.fieldInvalid": "{card}: `field` ожидает имя свойства, получено «{value}».",
    "countdown.fieldMissing": "{card}: ни в одной заметке выборки не заполнено «{field}». Проверьте имя, `source`, `tag` и `where`.",
    "countdown.fieldNotDate": "{card}: «{field}» в заметке «{note}» равно «{value}», это не дата. Ожидается YYYY-MM-DD.",
    "countdown.repeatInvalid": "{card}: `repeat` ожидает `yearly`, получено «{value}».",
    "countdown.selectionUnused": "{card}: `source`, `tag` и `where` выбирают заметку, из которой читается `field`. Рядом с `date:` они не действуют.",
    "countdown.today": "Сегодня",
    "countdown.daysLeft.one": "день остался",
    "countdown.daysLeft.few": "дня осталось",
    "countdown.daysLeft.many": "дней осталось",
    "countdown.daysLeft.other": "дня осталось",
    "countdown.daysAgo.one": "день назад",
    "countdown.daysAgo.few": "дня назад",
    "countdown.daysAgo.many": "дней назад",
    "countdown.daysAgo.other": "дня назад",
    "countdown.years.one": "год",
    "countdown.years.few": "года",
    "countdown.years.many": "лет",
    "countdown.years.other": "года",

    "today.expectFields": "Ожидается набор полей, например `daily: true`.",
    "today.nothingToShow": "Нечего показывать: включи `daily`, `weekly` или `monthly`.",
    "today.notBoolean": "`{key}` ожидает true или false, получено «{value}». Считаю за {read}.",
    "today.badClock": "`clock` ожидает true, false, minutes или seconds, получено «{value}». Часы не показаны.",
    "today.daily": "Сегодня",
    "today.weekly": "Эта неделя",
    "today.monthly": "Этот месяц",
    "today.missingNote": "{path}: заметки ещё нет, клик её создаст",

    "heatmap.expectFields": "Ожидается набор полей, например `source:` и `field:`.",
    "heatmap.fieldRequired": "Не задано `field`. Какое число из frontmatter красить.",
    "heatmap.noData":
        "Нет заметок с определяемой датой и числом, длительностью вроде `7h 30m` или чекбоксом в поле «{field}». Проверь `source`, или `date_field`, если дата лежит в свойстве.",
    "heatmap.fieldMissing":
        "Ни у одной заметки в выборке нет «{field}». Проверьте имя и `source`.",
    "heatmap.fieldNotNumeric":
        "«{field}» хранит текст или другое значение, а не число, длительность вроде `7h 30m` или чекбокс. Чтобы посчитать такие заметки, используйте `where: \"{field} contains ...\"` с `agg: count` в карточке stats.",
    "heatmap.fieldInvalid": "`field` ожидает имя свойства или их список, получено «{value}».",
    "heatmap.fieldListEmpty": "Список `field` пуст. Добавьте хотя бы одно имя свойства.",
    "heatmap.fieldListInvalid": "Элементы списка `field` должны быть простыми именами свойств, получено «{value}».",
    "heatmap.perDayInvalid": "`per_day` принимает sum, avg или max, получено «{value}». Используется sum.",
    "heatmap.skipFieldInvalid": "`skip_field` ожидает имя свойства, получено «{value}». Пропущено.",
    "heatmap.fieldUnused":
        "«{field}» ни разу не дало значения в этой выборке. Проверьте имя, или что там действительно число, длительность вроде `7h 30m` либо чекбокс.",
    "heatmap.layersAndField":
        "Заданы сразу `layers` и `field`. Используйте что-то одно: `layers` для нескольких цветов, `field` для одного.",
    "heatmap.layersColorIgnored": "`color` игнорируется: у каждого элемента `layers` свой собственный цвет.",
    "heatmap.layersInvalid": "`layers` ожидает список карт, получено «{value}».",
    "heatmap.layersEmpty": "Список `layers` пуст. Добавьте хотя бы один слой.",
    "heatmap.layerNotMap": "Слой {position} должен быть картой с `field`, получено «{value}».",
    "heatmap.layerLabelInvalid": "Слой {position}: `label` ожидает имя, получено «{value}».",
    "heatmap.layerAt": "Слой {position}: {message}",
    "heatmap.rangeInvalid":
        "`range` ожидает week, month, year или скользящее окно вроде 30d, получено «{value}». Рисуется сетка по годам.",
    "heatmap.titleYear": "{title} ({year})",
    "heatmap.caption": "{year}, {field}: среднее {average}, {present} из {total} дн.",
    "heatmap.captionMarks": "{year}, {field}: {present} из {total} дн.",
    "heatmap.captionRange": "{field}: среднее {average}, {present} из {total} дн.",
    "heatmap.captionRangeMarks": "{field}: {present} из {total} дн.",
    "heatmap.cell": "{date}: {field} {value}",
    "heatmap.cellLayers": "{date}: {parts}",
    "heatmap.cellPart": "{label} {value}",
    "heatmap.cellWithNote": "{cell} ({note})",
    "heatmap.notesCount.one": "{count} заметка",
    "heatmap.notesCount.few": "{count} заметки",
    "heatmap.notesCount.many": "{count} заметок",
    "heatmap.notesCount.other": "{count} заметок",
    "heatmap.cellEmpty": "{date}: нет данных",
    "heatmap.cellSkipped": "{cell}, выходной",
    "heatmap.cellEmptySkipped": "{date}: выходной",
    "heatmap.cellToday": "{cell}, сегодня",
    "heatmap.legendSkipped": "Выходной",
    "heatmap.durationMixed": "В «{field}» смешаны длительности («{durationNote}») и простые числа («{plainNote}»). Всё посчитано в минутах и показано простыми числами.",
    "heatmap.checkboxListNumber": "В «{note}» поле «{field}» хранит число, поэтому флажки этого списка не считаются по дням: день только с флажками закрашен полностью.",
    "heatmap.durationThresholdOnPlain": "Порог `bands` «{value}» задан как длительность, но в «{field}» простые числа. Он применён в минутах.",

    "chart.expectFields": "Ожидался набор полей, например `source:` и `field:`.",
    "chart.fieldRequired": "Не задано ни `field`, ни `series`. Рисовать нечего. Добавьте `field:` или `agg: count`, чтобы считать заметки.",
    "chart.fieldInvalid": "`field` ожидает имя свойства, получено «{value}».",
    "chart.seriesAndField": "Заданы и `series`, и `field`. Оставьте одно: `field` для одной линии, `series` для нескольких.",
    "chart.fieldListAtRoot": "Здесь `field` принимает одно свойство. Для нескольких линий используйте `series:`, а чтобы сложить их в одну, `series: [{field: [a, b]}]`.",
    "chart.seriesInvalid": "`series` ожидает список словарей, получено «{value}».",
    "chart.seriesEmpty": "`series` пустой. Добавьте хотя бы одну серию.",
    "chart.seriesTooMany": "В `series` записей: {count}, а на один график помещается не больше {max}. Разнесите их по двум блокам.",
    "chart.seriesNotMap": "Серия {position} должна быть словарём с `field`, получено «{value}».",
    "chart.seriesAt": "Серия {position}: {message}",
    "chart.seriesFieldRequired": "Не задано `field`. Рисовать нечего.",
    "chart.labelInvalid": "`label` ожидает название, получено «{value}».",
    "chart.labelIgnored": "`label` пропущен: у каждой записи в `series` своя подпись.",
    "chart.colorIgnored": "`color` пропущен: у каждой записи в `series` свой цвет.",
    "chart.typeInvalid": "`type` ожидает line или bar, получено «{value}». Рисую линию.",
    "chart.bucketInvalid": "`bucket` ожидает day, week, month или year, получено «{value}». Беру day.",
    "chart.aggInvalid": "Неизвестный агрегат «{value}». Доступны: {available}.",
    "chart.aggInvalidGuess": "Неизвестный агрегат «{value}». Возможно, имелся в виду «{guess}». Доступны: {available}.",
    "chart.countIgnoresField": "`agg: count` считает датированные заметки и не читает `field`. Поле пропущено.",
    "chart.countLabel": "заметки",
    "chart.rangeInvalid": "`range` ожидает week, month, year или скользящее окно вроде 30d, получено «{value}». Беру окно по умолчанию для корзины.",
    "chart.tooManyBuckets": "В окне больше {max} корзин. Нарисованы только последние {max}. Попробуйте `bucket: {next}`.",
    "chart.rangeShorterThanBucket": "В окне всего одна корзина, тренда не видно. Расширьте `range` или возьмите `bucket` помельче.",
    "chart.goalInvalid": "`goal` ожидает число или длительность вроде `7h 30m`, получено «{value}». Пропущено.",
    "chart.goalDurationOnPlain": "`goal: {value}` задан длительностью, а на графике простые числа. Применено как минуты.",
    "chart.unitInvalid": "`unit` ожидает текст, получено «{value}». Пропущено.",
    "chart.badPrecision": "`precision` ожидает целое число от 0 до {max}, получено «{value}». Округляю как обычно.",
    "chart.durationUnitIgnored": "`unit: {unit}` пропущен для «{field}»: там длительности, у них свои единицы.",
    "chart.durationMixed": "В «{field}» смешаны длительности («{durationNote}») и простые числа («{plainNote}»). Всё посчитано в минутах и показано простыми числами.",
    "chart.fieldMissing": "Ни у одной заметки в выборке нет «{field}». Проверьте имя и `source`.",
    "chart.fieldNotNumeric": "В «{field}» текст или другое значение, которое не число, не длительность вроде `7h 30m` и не флажок, так что рисовать нечего.",
    "chart.noData": "Числа в «{field}» есть только у заметок без даты. Называйте ежедневные заметки YYYY-MM-DD или добавьте `date_field:`, если дата лежит в свойстве.",
    "chart.fieldUnused": "«{field}» ни разу не дало значения. Проверьте имя или что там действительно число, длительность вроде `7h 30m` или флажок.",
    "chart.noDatedNotes": "Ни одна выбранная заметка не называется датой вида YYYY-MM-DD. Добавьте `date_field:`, если дата лежит в свойстве.",
    "chart.noDatedNotesField": "Ни у одной выбранной заметки нет даты в «{field}».",
    "chart.caption": "{label}: {agg} {per}, {span}",
    "chart.captionMixed": "{label}: {per}, {span}",
    "chart.aggSum": "сумма",
    "chart.aggAvg": "среднее",
    "chart.aggMin": "минимум",
    "chart.aggMax": "максимум",
    "chart.aggCount": "количество",
    "chart.perDay": "за день",
    "chart.perWeek": "за неделю",
    "chart.perMonth": "за месяц",
    "chart.perYear": "за год",
    "chart.days.one": "последний {count} день",
    "chart.days.few": "последние {count} дня",
    "chart.days.many": "последние {count} дней",
    "chart.days.other": "последние {count} дней",
    "chart.weeks.one": "последняя {count} неделя",
    "chart.weeks.few": "последние {count} недели",
    "chart.weeks.many": "последние {count} недель",
    "chart.weeks.other": "последние {count} недель",
    "chart.months.one": "последний {count} месяц",
    "chart.months.few": "последние {count} месяца",
    "chart.months.many": "последние {count} месяцев",
    "chart.months.other": "последние {count} месяцев",
    "chart.years.one": "последний {count} год",
    "chart.years.few": "последние {count} года",
    "chart.years.many": "последние {count} лет",
    "chart.years.other": "последние {count} лет",
    "chart.notesCount.one": "{count} заметка",
    "chart.notesCount.few": "{count} заметки",
    "chart.notesCount.many": "{count} заметок",
    "chart.notesCount.other": "{count} заметок",
    "chart.point": "{date}: {series} {value}",
    "chart.pointParts": "{date}: {parts}",
    "chart.pointPart": "{label} {value}",
    "chart.pointNoData": "{date}: нет данных",
    "chart.pointWithNote": "{point} ({note})",
    "chart.soFar": "{point}, пока что",
    "chart.weekOf": "Неделя с {date}",
    "chart.goalLabel": "цель {value}",
    "chart.emptyRange": "Нет данных: {span}",
    "chart.kindLine": "Линейный график",
    "chart.kindBar": "Столбчатая диаграмма",
    "chart.summary": "{kind}: {series}, {span}",
    "chart.valueWithUnit": "{value} {unit}",

    "insert.name": "Вставить блок",
    "insert.placeholder": "Какой блок?",
    "block.tiles": "Плитки навигации со счётчиками",
    "block.stats": "Карточки чисел по выборке заметок",
    "block.progress": "Полосы к цели",
    "block.today": "Сегодняшняя дата и периодические заметки",
    "block.countdown": "Сколько дней до даты",
    "block.heatmap": "Год по дням, раскрашенный числом",
    "block.chart": "Линии или столбцы числа по дням, неделям или месяцам",

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

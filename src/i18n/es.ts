/**
 * Spanish catalog. Keys come from en.ts; a key missing here falls back to
 * English, so a partial translation stays a valid one.
 *
 * Weekday and month names are absent on purpose: they come from Obsidian's
 * own `moment`. See adapters/datetime.ts.
 */
import type { Catalog } from "./en";

export const es: Catalog = {
    "parse.emptyBlock": "El bloque está vacío.",
    "parse.yamlError": "No se pudo leer el YAML: {message}",
    "parse.unknownKey": "Clave desconocida «{key}», ignorada.",
    "parse.unknownKeyGuess": "Clave desconocida «{key}». ¿Querías decir «{guess}»?",
    "parse.unknownKeyHint": "Clave desconocida «{key}». En este bloque se llama «{hint}».",

    "render.line": "línea {line}",

    "bands.hasData": "con datos",
    "bands.from": "desde {min}",

    "duration.hours": "{value}\u00A0h",
    "duration.minutes": "{value}\u00A0min",
    "duration.seconds": "{value}\u00A0s",

    "where.noSuchFolder": "No hay nada bajo `{folder}`. Los números de abajo no cuentan nada. Apunta `source` a una carpeta tuya.",
    "where.unreadable":
        "`where: {where}` no se pudo leer y se ignoró. Los números de abajo están sin filtrar. Se espera algo como `year = 2026`, `rating >= 4` o `tags contains books`.",
    "where.conjunction":
        "`where: {where}` usa `or`, que no se admite. El filtro se ignoró y los números de abajo están sin filtrar. Para exigir todas las condiciones, únelas con `and` o escríbelas como lista, por ejemplo `[year = 2026, rating >= 4]`; entrecomilla el valor si la palabra forma parte de él.",
    "where.badCondition":
        "`{condition}` en `where` no se pudo leer, así que se ignoró todo el filtro. Los números de abajo están sin filtrar. Una condición se parece a `year = 2026`, `rating >= 4` o `tags contains books`.",
    "where.badItem":
        "`where` incluye `{value}`, que no es una condición, así que se ignoró todo el filtro. Los números de abajo están sin filtrar. Cada elemento es una condición como `year = 2026`.",
    "where.emptyList":
        "`where` es una lista vacía, así que el filtro se ignoró y los números de abajo están sin filtrar. Enumera condiciones, por ejemplo `[year = 2026, rating >= 4]`, o quita la clave.",
    "where.sourceNumber":
        "`source` debe ser un nombre de carpeta en texto, se recibió `{value}`, así que la clave se ignoró y se lee toda la bóveda. Pon el nombre de la carpeta entre comillas, tal como está escrito: `source: \"2024\"`.",
    "where.sourceNotText":
        "`source` debe ser un solo nombre de carpeta en texto, se recibió `{value}`, así que la clave se ignoró y se lee toda la bóveda. Indica una carpeta, por ejemplo `source: Journal`.",
    "where.tagNumber":
        "`tag` debe ser un nombre de etiqueta en texto, se recibió `{value}`, así que la clave se ignoró y no se aplica ningún filtro por etiqueta. Pon el nombre de la etiqueta entre comillas, tal como está escrito: `tag: \"2024\"`.",
    "where.tagNotText":
        "`tag` debe ser un solo nombre de etiqueta en texto, se recibió `{value}`, así que la clave se ignoró y no se aplica ningún filtro por etiqueta. Indica una etiqueta, por ejemplo `tag: book`.",

    "inherit.rootPeriodInvalid":
        "`period` en la raíz del bloque espera week, month, year, una ventana móvil como 30d, note, un periodo como 2026-W40 o las fechas from y to, recibido «{value}». Todo lo que lo hereda se dibuja sin la ventana.",
    "inherit.rootDateFieldUndated":
        "`date_field` en la raíz del bloque: ninguna de las notas seleccionadas para {cards} tiene fecha en «{field}».",
    "inherit.blankSourceRoot":
        "`source` en la raíz del bloque está vacío, así que se lee toda la bóveda. Indica una carpeta, o quita la clave si quieres toda la bóveda.",
    "inherit.blankTagRoot":
        "`tag` en la raíz del bloque está vacío, así que no se aplica ningún filtro por etiqueta. Indica una etiqueta, o quita la clave si no quieres filtrar por etiqueta.",
    "inherit.blankSource":
        "{card}: `source` está vacío, así que lee toda la bóveda en lugar de la carpeta de la raíz del bloque. Quita la clave para heredar esa carpeta.",
    "inherit.blankTag":
        "{card}: `tag` está vacío, así que no filtra por etiqueta en lugar de usar la etiqueta de la raíz del bloque. Quita la clave para heredar esa etiqueta.",
    "inherit.blankSourceNoRoot":
        "{card}: `source` está vacío, así que lee toda la bóveda. Indica una carpeta, o quita la clave si quieres toda la bóveda.",
    "inherit.blankTagNoRoot":
        "{card}: `tag` está vacío, así que no se aplica ningún filtro por etiqueta. Indica una etiqueta, o quita la clave si no quieres filtrar por etiqueta.",

    "tiles.empty": "No hay mosaicos que dibujar. Se espera `items:` o una lista.",
    "tiles.dateFieldUnused": "{card}: `date_field` no tiene efecto sin `period`.",
    "tiles.selectionUnused": "{card}: `tag`, `where`, `period` y `date_field` solo acotan `badge: count`.",
    "tiles.imageMissing": "{card}: imagen «{path}» no encontrada.",
    "tiles.imageUnsupported":
        "{card}: `image` espera una ruta del almacén, un `[[wikienlace]]` o una URL `https://`, recibido «{value}».",

    "stats.empty": "No hay tarjetas que dibujar. Se espera `items:` o una lista.",
    "stats.unlabeledCard": "una tarjeta sin etiqueta",
    "stats.unknownAgg": "{card}: agregado «{agg}» desconocido. Disponibles: {available}.",
    "stats.unknownAggGuess":
        "{card}: agregado «{agg}» desconocido. ¿Querías decir «{guess}»? Disponibles: {available}.",
    "stats.fieldRequired":
        "{card}: el agregado «{agg}» necesita un número. Añade `field:` con una propiedad del frontmatter.",
    "stats.fieldMissing":
        "{card}: ninguna nota de la selección tiene «{field}». Revisa el nombre y `source`.",
    "stats.fieldNotNumeric":
        "{card}: «{field}» contiene texto u otro valor que no es un número, una duración como `7h 30m` ni una casilla. Usa `where: \"{field} contains ...\"` con `agg: count` para contarlo.",
    "stats.badPrecision":
        "{card}: `precision` espera un entero de 0 a {max}, recibido «{value}». Se redondea como por defecto.",
    "stats.streakKeysIgnored":
        "{card}: `at_least`, `at_most`, `days` y `skip_field` solo se aplican a `agg: streak` y `agg: current_streak`, ignorado.",
    "stats.streakThresholdNeedsField":
        "{card}: `at_least` y `at_most` necesitan un `field:` para sumar. Ignorado.",
    "stats.streakThresholdInvalid": "{card}: `{key}` espera un número o una duración como `7h 30m`, recibido «{value}». Ignorado.",
    "stats.streakThresholdImpossible":
        "{card}: `at_least` es mayor que `at_most`, ningún día puede cumplir ambos. La racha es 0.",
    "stats.streakDaysInvalid": "{card}: `days` espera `all` o `weekdays`, recibido «{value}». Usando `all`.",
    "stats.skipFieldInvalid": "{card}: `skip_field` espera un nombre de propiedad, recibido «{value}». Ignorado.",
    "stats.durationMixed": "{card}: «{field}» mezcla duraciones («{durationNote}») y números simples («{plainNote}»). Todo se cuenta en minutos y se muestra como un número simple.",
    "stats.durationUnitIgnored": "{card}: `unit: {unit}` se ignora. «{field}» contiene duraciones, que ya llevan sus propias unidades.",
    "stats.durationThresholdOnPlain": "{card}: `{key}: {value}` es una duración, pero «{field}» contiene números simples. Se aplica en minutos.",
    "stats.layoutInvalid": "`layout` espera cards o inline, se recibió «{value}». Se dibujan tarjetas.",
    "stats.inlineColumnsIgnored": "`columns` no tiene efecto con `layout: inline`, que dibuja una sola línea.",
    "stats.inlineTrendHidden": "`trend` no se dibuja con `layout: inline`: {cards}. Use `layout: cards` para verlo.",
    "stats.inlineSubHidden": "`sub` no se muestra con `layout: inline`: {cards}. Use `layout: cards` para verlo.",

    "progress.empty": "No hay barras que dibujar. Se espera `items:` o una lista.",
    "progress.goalRequired": "{card}: `goal:` necesita un número o una duración como `7h 30m`. No hay nada con lo que medir.",
    "progress.goalNotPositive": "{card}: un objetivo de {goal} no deja nada que llenar. Tiene que ser mayor que cero.",
    "progress.goalDurationOnCount": "{card}: `goal: {value}` es una duración, pero `agg: {agg}` cuenta días o notas, no tiempo. El objetivo se aplica en minutos.",

    "stats.trendNeedsField": "{card}: `trend` necesita un `field:` que trazar. Contar notas no tiene forma.",
    "stats.trendInvalid": "{card}: `trend` espera un número de días como 30d, recibido «{value}».",

    "dateFormat.invalid": "`date_format` espera un formato de fecha como DD.MM.YYYY, recibido «{value}». Ignorado.",
    "dateFormat.notADay":
        "`date_format: {format}` no tiene año, mes y día, así que no puede nombrar un día. Ignorado. Escríbelo como DD.MM.YYYY.",
    "dateFormat.unmatched":
        "`date_format: {format}` no encaja con ninguna de las notas seleccionadas: «{example}», por ejemplo, no está escrito así.",

    "period.invalid":
        "{card}: `period` espera week, month, year, una ventana móvil como 30d, note, un periodo como 2026-W40 o las fechas from y to, recibido «{value}». Dibujado sin la ventana.",
    "period.noDatedNotes":
        "{card}: ninguna de las notas seleccionadas tiene un nombre que empiece con una fecha como YYYY-MM-DD. Indica `date_format:` si los nombres la escriben de otra forma, como DD.MM.YYYY, o añade `date_field:` si la fecha está en una propiedad.",
    "period.noDatedNotesField": "{card}: ninguna de las notas seleccionadas tiene fecha en «{field}».",
    "period.dateFieldUnused":
        "{card}: `date_field` no tiene efecto aquí. Solo dirige `period`, `streak`, `current_streak`, `latest` y `trend`.",
    "period.noteNotAPeriod": "`{key}: note` necesita una nota con nombre de día, semana, mes, trimestre o año, y esta nota se llama «{name}». Nómbrala en uno de estos formatos: {formats}.",
    "period.boundsInvalid": "`{key}` como mapa acepta `from` y `to`, cada uno una fecha como 2026-09-01, recibido «{value}».",
    "period.boundsNoFrom": "`{key}` tiene `to` pero no `from`. Una ventana necesita un inicio: añade `from:` con una fecha como 2026-09-01.",
    "period.boundsOrder": "`{key}` empieza después de terminar: `from: {from}` es posterior a `to: {to}`. Intercámbialos.",
    "period.atCard": "{card}: {message}",
    "period.noteFuture": "Esta ventana empieza el {date}, todavía no hay nada que contar.",
    "period.windowSpan": "del {from} al {to}",

    "compare.notBoolean": "{card}: `compare` espera true o false, recibido «{value}». Comparación omitida.",
    "compare.needsPeriod": "{card}: `compare` necesita `period`. No hay nada con qué comparar.",
    "compare.streakUnsupported":
        "{card}: `compare` no funciona con `streak` ni `current_streak`. Una racha no tiene un valor propio del período anterior con el que comparar.",
    "compare.betterUnused": "{card}: `better` no tiene efecto sin `compare: true`.",
    "compare.badBetter": "{card}: `better` espera `up` o `down`, recibido «{value}». La diferencia queda neutra.",
    "compare.vsWeek": "respecto a los mismos días de la semana pasada: {value}",
    "compare.vsMonth": "respecto a los mismos días del mes pasado: {value}",
    "compare.vsYear": "respecto a los mismos días del año pasado: {value}",
    "compare.vsQuarter": "respecto a los mismos días del trimestre pasado: {value}",
    "compare.vsPreviousDay": "respecto al día anterior: {value}",
    "compare.vsPreviousWeek": "respecto a la semana anterior: {value}",
    "compare.vsPreviousMonth": "respecto al mes anterior: {value}",
    "compare.vsPreviousQuarter": "respecto al trimestre anterior: {value}",
    "compare.vsPreviousYear": "respecto al año anterior: {value}",
    "compare.vsDays.one": "respecto al día anterior: {value}",
    "compare.vsDays.few": "respecto a los {count} días anteriores: {value}",
    "compare.vsDays.many": "respecto a los {count} días anteriores: {value}",
    "compare.vsDays.other": "respecto a los {count} días anteriores: {value}",

    "countdown.empty": "No hay fechas que dibujar. Se espera `items:` o una lista.",
    "countdown.dateRequired": "{card}: no hay ni `date:` ni `field:`. No hay nada hacia lo que contar.",
    "countdown.dateInvalid": "{card}: «{date}» no es una fecha. Se espera YYYY-MM-DD.",
    "countdown.dateAndField": "{card}: `date:` y `field:` están definidos a la vez. Deja uno: una fecha escrita aquí, o una propiedad leída de una nota.",
    "countdown.fieldInvalid": "{card}: `field` espera un nombre de propiedad, se recibió «{value}».",
    "countdown.fieldMissing": "{card}: ninguna nota de la selección tiene «{field}» rellenado. Revisa el nombre, `source`, `tag` y `where`.",
    "countdown.fieldNotDate": "{card}: «{field}» en «{note}» es «{value}», no una fecha. Se espera YYYY-MM-DD, u otro formato indicado con `date_format:` junto a `items:`.",
    "countdown.repeatInvalid": "{card}: `repeat` espera `yearly`, se recibió «{value}».",
    "countdown.selectionUnused": "{card}: `source`, `tag` y `where` solo eligen la nota de la que se lee `field`. Con `date:` se ignoran.",
    "countdown.today": "Hoy",
    "countdown.daysLeft.one": "día restante",
    "countdown.daysLeft.few": "días restantes",
    "countdown.daysLeft.many": "días restantes",
    "countdown.daysLeft.other": "días restantes",
    "countdown.daysAgo.one": "día atrás",
    "countdown.daysAgo.few": "días atrás",
    "countdown.daysAgo.many": "días atrás",
    "countdown.daysAgo.other": "días atrás",
    "countdown.years.one": "año",
    "countdown.years.few": "años",
    "countdown.years.many": "años",
    "countdown.years.other": "años",

    "today.expectFields": "Se espera un conjunto de campos, por ejemplo `daily: true`.",
    "today.nothingToShow": "Nada que mostrar: activa `daily`, `weekly` o `monthly`.",
    "today.notBoolean": "`{key}` espera true o false, recibido «{value}». Se lee como {read}.",
    "today.badClock": "`clock` espera true, false, minutes o seconds, recibido «{value}». El reloj no se muestra.",
    "today.daily": "Hoy",
    "today.weekly": "Esta semana",
    "today.monthly": "Este mes",
    "today.missingNote": "{path}: la nota todavía no existe, al hacer clic se crea",

    "heatmap.expectFields": "Se espera un conjunto de campos, por ejemplo `source:` y `field:`.",
    "heatmap.fieldRequired": "No se indicó `field`. No hay número con el que colorear.",
    "heatmap.noData":
        "No hay notas con una fecha reconocible y un número, una duración como `7h 30m` o una casilla en «{field}». Revisa `source`, `date_format` si los nombres escriben las fechas de otra forma, como DD.MM.YYYY, o `date_field` si la fecha está en una propiedad.",
    "heatmap.fieldMissing":
        "Ninguna nota de la selección tiene «{field}». Revisa el nombre y `source`.",
    "heatmap.fieldNotNumeric":
        "«{field}» contiene texto u otro valor que no es un número, una duración como `7h 30m` ni una casilla. Usa `where: \"{field} contains ...\"` con `agg: count` en una tarjeta stats para contarlo.",
    "heatmap.fieldInvalid": "`field` espera un nombre de propiedad o una lista de ellos, se obtuvo «{value}».",
    "heatmap.fieldListEmpty": "`field` es una lista vacía. Añade al menos un nombre de propiedad.",
    "heatmap.fieldListInvalid": "Los elementos de la lista `field` deben ser nombres de propiedad simples, se obtuvo «{value}».",
    "heatmap.perDayInvalid": "`per_day` espera sum, avg o max, se obtuvo «{value}». Se usará sum.",
    "heatmap.skipFieldInvalid": "`skip_field` espera un nombre de propiedad, se obtuvo «{value}». Ignorado.",
    "heatmap.fieldUnused":
        "«{field}» nunca aportó un valor aquí. Revisa el nombre, o que realmente contenga un número, una duración como `7h 30m` o una casilla.",
    "heatmap.layersAndField":
        "`layers` y `field` están definidos a la vez. Usa uno u otro: `layers` para varios colores, `field` para uno solo.",
    "heatmap.layersColorIgnored": "`color` se ignora: cada entrada de `layers` tiene su propio color.",
    "heatmap.layersInvalid": "`layers` espera una lista de mapas, se obtuvo «{value}».",
    "heatmap.layersEmpty": "`layers` es una lista vacía. Añade al menos una capa.",
    "heatmap.layerNotMap": "La capa {position} debe ser un mapa con `field`, se obtuvo «{value}».",
    "heatmap.layerLabelInvalid": "Capa {position}: `label` espera un nombre, se obtuvo «{value}».",
    "heatmap.layerAt": "Capa {position}: {message}",
    "heatmap.pickInvalid": "`pick` espera first o max, se obtuvo «{value}». Se usará first.",
    "heatmap.pickWithoutLayers": "`pick` se ignora: solo elige entre `layers`, y este bloque tiene un único `field`.",
    "heatmap.rangeInvalid":
        "`range` espera week, month, year, una ventana móvil como 30d, note, un periodo como 2026-W40 o las fechas from y to, se obtuvo «{value}». Se dibuja una cuadrícula por año.",
    "heatmap.layoutInvalid": "`layout` espera grid o calendar, se obtuvo «{value}». Se usa grid.",
    "heatmap.calendarNeedsRange": "`layout: calendar` necesita un mes o una semana: `range: month`, `range: week` o un solo mes o semana como `range: 2026-10` o `range: note` en una nota semanal. Se dibuja la cuadrícula en su lugar.",
    "heatmap.calendarBandsIgnored": "`bands` se ignora con `layout: calendar`: un día muestra puntos, no un tono.",
    "heatmap.calendarSpan": "{from} a {to}",
    "heatmap.caption": "{year}, {field}: media {average}, {present} de {total} días",
    "heatmap.captionMarks": "{year}, {field}: {present} de {total} días",
    "heatmap.captionRange": "{field}: media {average}, {present} de {total} días",
    "heatmap.captionRangeMarks": "{field}: {present} de {total} días",
    "heatmap.titleYear": "{title} ({year})",
    "heatmap.cell": "{date}: {field} {value}",
    "heatmap.cellLayers": "{date}: {parts}",
    "heatmap.cellPart": "{label} {value}",
    "heatmap.cellWithNote": "{cell} ({note})",
    "heatmap.notesCount.one": "{count} nota",
    "heatmap.notesCount.few": "{count} notas",
    "heatmap.notesCount.many": "{count} notas",
    "heatmap.notesCount.other": "{count} notas",
    "heatmap.cellEmpty": "{date}: sin datos",
    "heatmap.cellSkipped": "{cell}, día libre",
    "heatmap.cellEmptySkipped": "{date}: día libre",
    "heatmap.cellToday": "{cell}, hoy",
    "heatmap.legendSkipped": "Día libre",
    "heatmap.durationMixed": "«{field}» mezcla duraciones («{durationNote}») y números simples («{plainNote}»). Todo se cuenta en minutos y se muestra en números simples.",
    "heatmap.checkboxListNumber": "«{field}» tiene un número en «{note}», así que las casillas de esta lista no se cuentan por día: un día solo con casillas marcadas se pinta en color pleno.",
    "heatmap.durationThresholdOnPlain": "El umbral de `bands` «{value}» es una duración, pero «{field}» contiene números simples. Se aplica en minutos.",

    "chart.expectFields": "Se esperaba un conjunto de campos, por ejemplo `source:` y `field:`.",
    "chart.fieldRequired": "No se indica `field` ni `series`. No hay ningún número que dibujar. Añade `field:`, o `agg: count` para contar notas.",
    "chart.fieldInvalid": "`field` espera un nombre de propiedad, se recibió «{value}».",
    "chart.seriesAndField": "`series` y `field` están definidos a la vez. Usa uno: `field` para una línea, `series` para varias.",
    "chart.fieldListAtRoot": "`field` admite aquí una sola propiedad. Usa `series:` para varias líneas, o `series: [{field: [a, b]}]` para juntarlas en una.",
    "chart.seriesInvalid": "`series` espera una lista de mapas, se recibió «{value}».",
    "chart.seriesEmpty": "`series` es una lista vacía. Añade al menos una serie.",
    "chart.seriesTooMany": "`series` tiene {count} entradas, y en un gráfico caben como mucho {max}. Repártelas en dos bloques.",
    "chart.seriesNotMap": "La serie {position} debe ser un mapa con `field`, se recibió «{value}».",
    "chart.seriesAt": "Serie {position}: {message}",
    "chart.seriesFieldRequired": "No se indica `field`. No hay ningún número que dibujar.",
    "chart.labelInvalid": "`label` espera un nombre, se recibió «{value}».",
    "chart.labelIgnored": "`label` se ignora: cada entrada de `series` lleva su propia etiqueta.",
    "chart.colorIgnored": "`color` se ignora: cada entrada de `series` lleva su propio color.",
    "chart.typeInvalid": "`type` espera line o bar, se recibió «{value}». Se dibuja una línea.",
    "chart.bucketInvalid": "`bucket` espera day, week, month o year, se recibió «{value}». Se usa day.",
    "chart.aggInvalid": "Agregado desconocido «{value}». Disponibles: {available}.",
    "chart.aggInvalidGuess": "Agregado desconocido «{value}». ¿Querías decir «{guess}»? Disponibles: {available}.",
    "chart.countIgnoresField": "`agg: count` cuenta notas con fecha y no lee ningún `field`. El campo se ignora.",
    "chart.countLabel": "notas",
    "chart.rangeInvalid": "`range` espera week, month, year, una ventana móvil como 30d, note, un periodo como 2026-W40 o las fechas from y to, se recibió «{value}». Se usa la predeterminada del agrupamiento.",
    "chart.tooManyBuckets": "Más de {max} agrupamientos en la ventana. Solo se dibujan los {max} más recientes. Prueba `bucket: {next}`.",
    "chart.rangeShorterThanBucket": "La ventana contiene un solo agrupamiento, así que no se ve ninguna tendencia. Amplía `range` o elige un `bucket` más pequeño.",
    "chart.goalInvalid": "`goal` espera un número o una duración como `7h 30m`, se recibió «{value}». Se ignora.",
    "chart.goalDurationOnPlain": "`goal: {value}` es una duración, pero el gráfico contiene números simples. Se aplica como minutos.",
    "chart.unitInvalid": "`unit` espera texto, se recibió «{value}». Se ignora.",
    "chart.badPrecision": "`precision` espera un número entero de 0 a {max}, se recibió «{value}». Se redondea de la forma habitual.",
    "chart.durationUnitIgnored": "`unit: {unit}` se ignora para «{field}», que contiene duraciones con sus propias unidades.",
    "chart.durationMixed": "«{field}» mezcla duraciones («{durationNote}») y números simples («{plainNote}»). Todo se cuenta en minutos y se muestra en números simples.",
    "chart.fieldMissing": "Ninguna nota de la selección tiene «{field}». Revisa el nombre y `source`.",
    "chart.fieldNotNumeric": "«{field}» contiene texto u otro valor que no es un número, ni una duración como `7h 30m`, ni una casilla, así que no hay nada que dibujar.",
    "chart.noData": "«{field}» solo tiene números en notas sin fecha. Nombra las notas diarias como YYYY-MM-DD, indica `date_format:` si se llaman de otra forma, como DD.MM.YYYY, o añade `date_field:` si la fecha está en una propiedad.",
    "chart.fieldUnused": "«{field}» nunca aportó un valor aquí. Revisa el nombre, o que de verdad contenga un número, una duración como `7h 30m` o una casilla.",
    "chart.noDatedNotes": "Ninguna de las notas seleccionadas tiene un nombre que empiece por una fecha como YYYY-MM-DD. Indica `date_format:` si los nombres la escriben de otra forma, como DD.MM.YYYY, o añade `date_field:` si la fecha está en una propiedad.",
    "chart.noDatedNotesField": "Ninguna de las notas seleccionadas tiene una fecha en «{field}».",
    "chart.caption": "{label}: {agg} {per}, {span}",
    "chart.captionMixed": "{label}: {per}, {span}",
    "chart.aggSum": "suma",
    "chart.aggAvg": "media",
    "chart.aggMin": "mínimo",
    "chart.aggMax": "máximo",
    "chart.aggCount": "número",
    "chart.perDay": "por día",
    "chart.perWeek": "por semana",
    "chart.perMonth": "por mes",
    "chart.perYear": "por año",
    "chart.days.one": "último {count} día",
    "chart.days.few": "últimos {count} días",
    "chart.days.many": "últimos {count} días",
    "chart.days.other": "últimos {count} días",
    "chart.weeks.one": "última {count} semana",
    "chart.weeks.few": "últimas {count} semanas",
    "chart.weeks.many": "últimas {count} semanas",
    "chart.weeks.other": "últimas {count} semanas",
    "chart.months.one": "último {count} mes",
    "chart.months.few": "últimos {count} meses",
    "chart.months.many": "últimos {count} meses",
    "chart.months.other": "últimos {count} meses",
    "chart.years.one": "último {count} año",
    "chart.years.few": "últimos {count} años",
    "chart.years.many": "últimos {count} años",
    "chart.years.other": "últimos {count} años",
    "chart.notesCount.one": "{count} nota",
    "chart.notesCount.few": "{count} notas",
    "chart.notesCount.many": "{count} notas",
    "chart.notesCount.other": "{count} notas",
    "chart.point": "{date}: {series} {value}",
    "chart.pointParts": "{date}: {parts}",
    "chart.pointPart": "{label} {value}",
    "chart.pointNoData": "{date}: sin datos",
    "chart.pointWithNote": "{point} ({note})",
    "chart.soFar": "{point}, hasta ahora",
    "chart.weekOf": "Semana del {date}",
    "chart.goalLabel": "meta {value}",
    "chart.emptyRange": "Sin datos: {span}",
    "chart.emptyWindow": "Sin datos: {window}",
    "chart.kindLine": "Gráfico de líneas",
    "chart.kindBar": "Gráfico de barras",
    "chart.summary": "{kind}: {series}, {span}",
    "chart.valueWithUnit": "{value} {unit}",

    "insert.name": "Insertar bloque",
    "insert.placeholder": "¿Qué bloque?",
    "block.tiles": "Mosaicos de navegación con el número de notas por carpeta",
    "block.stats": "Tarjetas de números sobre una selección de notas",
    "block.progress": "Barras hacia un objetivo",
    "block.today": "La fecha de hoy y las notas periódicas",
    "block.countdown": "Días hasta una fecha",
    "block.heatmap": "Un año de días, coloreado por un número",
    "block.chart": "Líneas o barras de un número por días, semanas o meses",

    "about.heading": "Acerca de",
    "about.bug": "Informar de un error",
    "about.bugDesc": "Abre GitHub con las versiones ya rellenadas.",
    "about.feature": "Proponer una función",
    "about.featureDesc": "Cuéntame qué quisiste construir y no pudiste.",
    "about.docs": "Documentación",
    "about.docsDesc": "Cada bloque, cada clave, con ejemplos.",
    "about.funding": "Invítame a un café",
    "about.fundingDesc": "El plugin es gratis y seguirá siéndolo. Esto es solo si te apetece.",
    "about.open": "Abrir",

    "settings.languageHeading": "Idioma",
    "settings.language": "Idioma del plugin",
    "settings.languageDesc": "En qué idioma hablan los bloques. El de Obsidian por defecto.",
    "settings.languageAuto": "Seguir a Obsidian",

    "settings.periodicHeading": "Notas periódicas",
    "settings.dailyFolder": "Carpeta de notas diarias",
    "settings.dailyFolderDesc": "Déjalo vacío para usar los ajustes del plugin Periodic Notes cuando esté instalado.",
    "settings.weeklyFolder": "Carpeta de notas semanales",
    "settings.monthlyFolder": "Carpeta de notas mensuales",
    "settings.followPeriodic": "Lo usa el bloque today. Déjalo vacío para seguir a Periodic Notes.",

    "settings.startDayHeading": "Nuevo día",
    "settings.startDayHour": "El nuevo día empieza a las",
    "settings.startDayHourDesc":
        "Lo que cada bloque llama hoy: qué nota enlaza el bloque today y dónde terminan las ventanas de period, compare y trend. Medianoche mantiene el comportamiento actual y nunca cambia el día de la propia nota.",

    "settings.skillHeading": "Skill para agentes de IA",
    "settings.skillName": "Archivo de skill en esta bóveda",
    "settings.skillNotInstalled":
        "Escribe {path} para que un agente (Claude Code, Cursor) escriba estos bloques por ti.",
    "settings.skillCurrent": "Instalado, versión {version}. Nada que hacer.",
    "settings.skillOutdated": "Instalada la versión {installed}, disponible {available}.",
    "settings.agentsName": "AGENTS.md en la raíz de la bóveda",
    "settings.agentsNotInstalled":
        "Escribe {path} para agentes que no leen skills de Claude: Cursor, Codex y los demás. Solo la sección delimitada es nuestra; el resto del archivo se queda como está.",
    "settings.agentsCurrent": "Escrito, versión {version}. Nada que hacer.",
    "settings.agentsOutdated": "Escrito en la versión {installed}, disponible {available}.",
    "settings.agentsUntouched":
        "{path} tiene una sección de Dashy a medio escribir y se dejó como estaba. Quita el marcador suelto e inténtalo de nuevo.",

    "settings.install": "Instalar",
    "settings.update": "Actualizar",
    "settings.copyMarkdown": "Copiar markdown",
    "settings.copied": "Markdown del skill copiado.",
    "settings.written": "Skill escrito en {path}",
    "settings.writeFailed": "No se pudo escribir el skill: {message}",
    "settings.copyFailed": "No se pudo copiar: {message}. Usa Instalar en su lugar.",
};

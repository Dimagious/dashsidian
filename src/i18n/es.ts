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
    "parse.unknownKey": "Clave desconocida «{key}» — ignorada.",
    "parse.unknownKeyGuess": "Clave desconocida «{key}». ¿Querías decir «{guess}»?",

    "render.line": "línea {line}",

    "bands.hasData": "con datos",
    "bands.from": "desde {min}",

    "where.noSuchFolder": "No hay nada bajo `{folder}` — los números de abajo no cuentan nada. Apunta `source` a una carpeta tuya.",
    "where.unreadable":
        "`where: {where}` no se pudo leer y se ignoró — los números de abajo están sin filtrar. Se espera algo como `year = 2026`, `rating >= 4` o `tags contains books`.",
    "where.conjunction":
        "`where: {where}` contiene más de una condición y solo se admite una — el filtro se ignoró. Acota con `source` o `tag`, o entrecomilla el valor si la palabra forma parte de él.",

    "tiles.empty": "No hay mosaicos que dibujar. Se espera `items:` o una lista.",

    "stats.empty": "No hay tarjetas que dibujar. Se espera `items:` o una lista.",
    "stats.unlabeledCard": "una tarjeta sin etiqueta",
    "stats.unknownAgg": "{card}: agregado «{agg}» desconocido. Disponibles: {available}.",
    "stats.unknownAggGuess":
        "{card}: agregado «{agg}» desconocido. ¿Querías decir «{guess}»? Disponibles: {available}.",
    "stats.fieldRequired":
        "{card}: el agregado «{agg}» necesita un número — añade `field:` con una propiedad del frontmatter.",
    "stats.badPrecision":
        "{card}: `precision` espera un entero de 0 a {max}, recibido «{value}» — se redondea como por defecto.",

    "progress.empty": "No hay barras que dibujar. Se espera `items:` o una lista.",
    "progress.goalRequired": "{card}: `goal:` necesita un número — no hay nada con lo que medir.",
    "progress.goalNotPositive": "{card}: un objetivo de {goal} no deja nada que llenar — tiene que ser mayor que cero.",

    "stats.trendNeedsField": "{card}: `trend` necesita un `field:` que trazar — contar notas no tiene forma.",
    "stats.trendInvalid": "{card}: `trend` espera un número de días como 30d, recibido «{value}».",

    "countdown.empty": "No hay fechas que dibujar. Se espera `items:` o una lista.",
    "countdown.dateRequired": "{card}: falta `date:` — no hay nada hacia lo que contar.",
    "countdown.dateInvalid": "{card}: «{date}» no es una fecha. Se espera YYYY-MM-DD.",
    "countdown.today": "Hoy",
    "countdown.daysLeft.one": "día restante",
    "countdown.daysLeft.few": "días restantes",
    "countdown.daysLeft.many": "días restantes",
    "countdown.daysLeft.other": "días restantes",
    "countdown.daysAgo.one": "día atrás",
    "countdown.daysAgo.few": "días atrás",
    "countdown.daysAgo.many": "días atrás",
    "countdown.daysAgo.other": "días atrás",

    "today.expectFields": "Se espera un conjunto de campos, por ejemplo `daily: true`.",
    "today.nothingToShow": "Nada que mostrar: activa `daily`, `weekly` o `monthly`.",
    "today.notBoolean": "`{key}` espera true o false, recibido «{value}» — se lee como {read}.",
    "today.daily": "Hoy",
    "today.weekly": "Esta semana",
    "today.monthly": "Este mes",
    "today.missingNote": "{path} — la nota todavía no existe, al hacer clic se crea",

    "heatmap.expectFields": "Se espera un conjunto de campos, por ejemplo `source:` y `field:`.",
    "heatmap.fieldRequired": "No se indicó `field` — no hay número con el que colorear.",
    "heatmap.noData":
        "No hay notas con una fecha por nombre y un número en «{field}». Revisa `source`.",
    "heatmap.caption": "{year} — {field}: media {average}, {present} de {total} días",
    "heatmap.titleYear": "{title} — {year}",
    "heatmap.cell": "{date} — {field} {value}",
    "heatmap.cellEmpty": "{date} — sin datos",

    "insert.name": "Insertar bloque",
    "insert.placeholder": "¿Qué bloque?",
    "block.tiles": "Mosaicos de navegación con el número de notas por carpeta",
    "block.stats": "Tarjetas de números sobre una selección de notas",
    "block.progress": "Barras hacia un objetivo",
    "block.today": "La fecha de hoy y las notas periódicas",
    "block.countdown": "Días hasta una fecha",
    "block.heatmap": "Un año de días, coloreado por un número",

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

    "settings.periodicHeading": "Notas periódicas",
    "settings.dailyFolder": "Carpeta de notas diarias",
    "settings.dailyFolderDesc": "Déjalo vacío para usar los ajustes del plugin Periodic Notes cuando esté instalado.",
    "settings.weeklyFolder": "Carpeta de notas semanales",
    "settings.monthlyFolder": "Carpeta de notas mensuales",
    "settings.followPeriodic": "Lo usa el bloque today. Déjalo vacío para seguir a Periodic Notes.",
    "settings.skillHeading": "Skill para agentes de IA",
    "settings.skillName": "Archivo de skill en esta bóveda",
    "settings.skillNotInstalled":
        "Escribe {path} para que un agente (Claude Code, Cursor) escriba estos bloques por ti.",
    "settings.skillCurrent": "Instalado, versión {version}. Nada que hacer.",
    "settings.skillOutdated": "Instalada la versión {installed}, disponible {available}.",
    "settings.agentsName": "AGENTS.md en la raíz de la bóveda",
    "settings.agentsNotInstalled":
        "Escribe {path} para agentes que no leen skills de Claude — Cursor, Codex y los demás. Solo la sección delimitada es nuestra; el resto del archivo se queda como está.",
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

/**
 * German catalog. Keys come from en.ts; a key missing here falls back to
 * English, so a partial translation stays a valid one.
 *
 * Weekday and month names are absent on purpose: they come from Obsidian's
 * own `moment`. See adapters/datetime.ts.
 */
import type { Catalog } from "./en";

export const de: Catalog = {
    "parse.emptyBlock": "Der Block ist leer.",
    "parse.yamlError": "YAML konnte nicht gelesen werden: {message}",
    "parse.unknownKey": "Unbekannter Schlüssel „{key}“ — ignoriert.",
    "parse.unknownKeyGuess": "Unbekannter Schlüssel „{key}“. Meintest du „{guess}“?",

    "render.line": "Zeile {line}",

    "bands.hasData": "mit Daten",
    "bands.from": "ab {min}",

    "where.noSuchFolder": "Unter `{folder}` liegt nichts — die Zahlen unten zählen nichts. Richte `source` auf einen eigenen Ordner.",
    "where.unreadable":
        "`where: {where}` konnte nicht gelesen werden und wurde ignoriert — die Zahlen unten sind ungefiltert. Erwartet wird etwas wie `year = 2026`, `rating >= 4` oder `tags contains books`.",
    "where.conjunction":
        "`where: {where}` enthält mehr als eine Bedingung, unterstützt wird nur eine — der Filter wurde ignoriert. Grenze mit `source` oder `tag` ein, oder setze den Wert in Anführungszeichen, wenn das Wort dazugehört.",

    "tiles.empty": "Keine Kacheln zu zeichnen. Erwartet wird `items:` oder eine Liste.",

    "stats.empty": "Keine Karten zu zeichnen. Erwartet wird `items:` oder eine Liste.",
    "stats.unlabeledCard": "eine Karte ohne Beschriftung",
    "stats.unknownAgg": "{card}: unbekannte Aggregatfunktion „{agg}“. Verfügbar: {available}.",
    "stats.unknownAggGuess":
        "{card}: unbekannte Aggregatfunktion „{agg}“. Meintest du „{guess}“? Verfügbar: {available}.",
    "stats.fieldRequired":
        "{card}: die Aggregatfunktion „{agg}“ braucht eine Zahl — ergänze `field:` mit einer Frontmatter-Eigenschaft.",
    "stats.badPrecision":
        "{card}: `precision` erwartet eine ganze Zahl von 0 bis {max}, bekommen „{value}“ — es wird wie voreingestellt gerundet.",

    "progress.empty": "Keine Balken zu zeichnen. Erwartet wird `items:` oder eine Liste.",
    "progress.goalRequired": "{card}: `goal:` braucht eine Zahl — es gibt nichts, woran gemessen werden könnte.",
    "progress.goalNotPositive": "{card}: ein Ziel von {goal} lässt nichts zu füllen — es muss über null liegen.",

    "stats.trendNeedsField": "{card}: `trend` braucht ein `field:` zum Zeichnen — gezählte Notizen haben keine Form.",
    "stats.trendInvalid": "{card}: `trend` erwartet eine Anzahl Tage wie 30d, bekommen „{value}“.",

    "countdown.empty": "Keine Termine zu zeichnen. Erwartet wird `items:` oder eine Liste.",
    "countdown.dateRequired": "{card}: `date:` fehlt — es gibt nichts, worauf gezählt werden könnte.",
    "countdown.dateInvalid": "{card}: „{date}“ ist kein Datum. Erwartet wird YYYY-MM-DD.",
    "countdown.today": "Heute",
    "countdown.daysLeft.one": "Tag übrig",
    "countdown.daysLeft.few": "Tage übrig",
    "countdown.daysLeft.many": "Tage übrig",
    "countdown.daysLeft.other": "Tage übrig",
    "countdown.daysAgo.one": "Tag her",
    "countdown.daysAgo.few": "Tage her",
    "countdown.daysAgo.many": "Tage her",
    "countdown.daysAgo.other": "Tage her",

    "today.expectFields": "Erwartet wird eine Menge von Feldern, zum Beispiel `daily: true`.",
    "today.nothingToShow": "Nichts anzuzeigen: aktiviere `daily`, `weekly` oder `monthly`.",
    "today.notBoolean": "`{key}` erwartet true oder false, bekommen „{value}“ — gelesen als {read}.",
    "today.daily": "Heute",
    "today.weekly": "Diese Woche",
    "today.monthly": "Dieser Monat",
    "today.missingNote": "{path} — die Notiz gibt es noch nicht, ein Klick legt sie an",

    "heatmap.expectFields": "Erwartet wird eine Menge von Feldern, zum Beispiel `source:` und `field:`.",
    "heatmap.fieldRequired": "Kein `field` angegeben — es gibt keine Zahl zum Einfärben.",
    "heatmap.noData":
        "Keine Notizen mit einem Datum als Namen und einer Zahl in „{field}“. Prüfe `source`.",
    "heatmap.caption": "{year} — {field}: Durchschnitt {average}, {present} von {total} Tagen",
    "heatmap.titleYear": "{title} — {year}",
    "heatmap.cell": "{date} — {field} {value}",
    "heatmap.cellEmpty": "{date} — keine Daten",

    "insert.name": "Block einfügen",
    "insert.placeholder": "Welcher Block?",
    "block.tiles": "Navigationskacheln mit Ordnerzählern",
    "block.stats": "Zahlenkarten über eine Auswahl von Notizen",
    "block.progress": "Balken auf ein Ziel hin",
    "block.today": "Das heutige Datum und die periodischen Notizen",
    "block.countdown": "Tage bis zu einem Datum",
    "block.heatmap": "Ein Jahr an Tagen, eingefärbt nach einer Zahl",

    "about.heading": "Über",
    "about.bug": "Fehler melden",
    "about.bugDesc": "Öffnet GitHub mit bereits eingetragenen Versionen.",
    "about.feature": "Funktion vorschlagen",
    "about.featureDesc": "Schreib mir, was du bauen wolltest und nicht konntest.",
    "about.docs": "Dokumentation",
    "about.docsDesc": "Jeder Block, jeder Schlüssel, mit Beispielen.",
    "about.funding": "Kauf mir einen Kaffee",
    "about.fundingDesc": "Das Plugin ist kostenlos und bleibt es. Nur, wenn dir danach ist.",
    "about.open": "Öffnen",

    "settings.languageHeading": "Sprache",
    "settings.language": "Sprache des Plugins",
    "settings.languageDesc": "In welcher Sprache die Blöcke sprechen. Voreingestellt ist die von Obsidian.",
    "settings.languageAuto": "Wie Obsidian",

    "settings.periodicHeading": "Periodische Notizen",
    "settings.dailyFolder": "Ordner für Tagesnotizen",
    "settings.dailyFolderDesc": "Leer lassen, um die Einstellungen von Periodic Notes zu verwenden, sofern installiert.",
    "settings.weeklyFolder": "Ordner für Wochennotizen",
    "settings.monthlyFolder": "Ordner für Monatsnotizen",
    "settings.followPeriodic": "Wird vom today-Block verwendet. Leer lassen, um Periodic Notes zu folgen.",
    "settings.skillHeading": "Skill für KI-Agenten",
    "settings.skillName": "Skill-Datei in diesem Vault",
    "settings.skillNotInstalled":
        "Schreibt {path}, damit ein Agent (Claude Code, Cursor) diese Blöcke für dich schreiben kann.",
    "settings.skillCurrent": "Installiert, Version {version}. Nichts zu tun.",
    "settings.skillOutdated": "Installiert ist Version {installed}, verfügbar {available}.",
    "settings.agentsName": "AGENTS.md im Stammverzeichnis des Vaults",
    "settings.agentsNotInstalled":
        "Schreibt {path} für Agenten, die keine Claude-Skills lesen — Cursor, Codex und die übrigen. Nur der eingefasste Abschnitt gehört uns; alles andere in der Datei bleibt unangetastet.",
    "settings.agentsCurrent": "Geschrieben, Version {version}. Nichts zu tun.",
    "settings.agentsOutdated": "Geschrieben mit Version {installed}, verfügbar {available}.",
    "settings.agentsUntouched":
        "{path} enthält einen halb geschriebenen Dashy-Abschnitt und blieb unverändert. Entferne die übrig gebliebene Markierung und versuche es erneut.",

    "settings.install": "Installieren",
    "settings.update": "Aktualisieren",
    "settings.copyMarkdown": "Markdown kopieren",
    "settings.copied": "Skill-Markdown kopiert.",
    "settings.written": "Skill nach {path} geschrieben",
    "settings.writeFailed": "Skill konnte nicht geschrieben werden: {message}",
    "settings.copyFailed": "Kopieren nicht möglich: {message}. Nimm stattdessen Installieren.",
};

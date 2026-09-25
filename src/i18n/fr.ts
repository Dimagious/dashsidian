/**
 * French catalog. Keys come from en.ts; a key missing here falls back to
 * English, so a partial translation stays a valid one.
 *
 * Weekday and month names are absent on purpose: they come from Obsidian's
 * own `moment`. See adapters/datetime.ts.
 */
import type { Catalog } from "./en";

export const fr: Catalog = {
    "parse.emptyBlock": "Le bloc est vide.",
    "parse.yamlError": "Lecture du YAML impossible : {message}",
    "parse.unknownKey": "Clé inconnue « {key} », ignorée.",
    "parse.unknownKeyGuess": "Clé inconnue « {key} ». Vouliez-vous dire « {guess} » ?",

    "render.line": "ligne {line}",

    "bands.hasData": "avec données",
    "bands.from": "à partir de {min}",

    "where.noSuchFolder": "Rien n'est classé sous `{folder}`. Les chiffres ci-dessous ne comptent rien. Pointez `source` vers un dossier à vous.",
    "where.unreadable":
        "`where: {where}` n'a pas pu être lu et a été ignoré. Les chiffres ci-dessous ne sont pas filtrés. Attendu : quelque chose comme `year = 2026`, `rating >= 4` ou `tags contains books`.",
    "where.conjunction":
        "`where: {where}` contient plus d'une condition, et une seule est prise en charge. Le filtre a été ignoré. Restreignez avec `source` ou `tag`, ou mettez la valeur entre guillemets si le mot en fait partie.",

    "tiles.empty": "Aucune tuile à dessiner. Attendu : `items:` ou une liste.",

    "stats.empty": "Aucune carte à dessiner. Attendu : `items:` ou une liste.",
    "stats.unlabeledCard": "une carte sans libellé",
    "stats.unknownAgg": "{card} : agrégat « {agg} » inconnu. Disponibles : {available}.",
    "stats.unknownAggGuess":
        "{card} : agrégat « {agg} » inconnu. Vouliez-vous dire « {guess} » ? Disponibles : {available}.",
    "stats.fieldRequired":
        "{card} : l'agrégat « {agg} » a besoin d'un nombre. Ajoutez `field:` avec une propriété du frontmatter.",
    "stats.badPrecision":
        "{card} : `precision` attend un entier de 0 à {max}, reçu « {value} ». Arrondi par défaut.",

    "progress.empty": "Aucune barre à dessiner. Attendu : `items:` ou une liste.",
    "progress.goalRequired": "{card} : `goal:` a besoin d'un nombre. Il n'y a rien à mesurer.",
    "progress.goalNotPositive": "{card} : un objectif de {goal} ne laisse rien à remplir. Il doit être supérieur à zéro.",

    "stats.trendNeedsField": "{card} : `trend` a besoin d'un `field:` à tracer. Compter des notes n'a pas de forme.",
    "stats.trendInvalid": "{card} : `trend` attend un nombre de jours comme 30d, reçu « {value} ».",

    "period.invalid":
        "{card} : `period` attend week, month, year ou une fenêtre glissante comme 30d, reçu « {value} ». Dessiné sans la fenêtre.",
    "period.noDatedNotes":
        "{card} : aucune des notes sélectionnées n'a un nom commençant par une date du type YYYY-MM-DD. Ajoutez `date_field:` si la date se trouve dans une propriété.",
    "period.noDatedNotesField": "{card} : aucune des notes sélectionnées n'a de date dans « {field} ».",
    "period.dateFieldUnused":
        "{card} : `date_field` n'a aucun effet ici. Il ne pilote que `period`, `streak`, `latest` et `trend`.",

    "compare.notBoolean": "{card} : `compare` attend true ou false, reçu « {value} ». Comparaison ignorée.",
    "compare.needsPeriod": "{card} : `compare` a besoin de `period`. Il n'y a rien avec quoi comparer.",
    "compare.streakUnsupported":
        "{card} : `compare` ne fonctionne pas avec `streak`. Une série n'a pas de valeur propre à la période précédente à comparer.",
    "compare.betterUnused": "{card} : `better` n'a aucun effet sans `compare: true`.",
    "compare.badBetter": "{card} : `better` attend `up` ou `down`, reçu « {value} ». L'écart reste neutre.",
    "compare.vsWeek": "par rapport aux mêmes jours la semaine dernière : {value}",
    "compare.vsMonth": "par rapport aux mêmes jours le mois dernier : {value}",
    "compare.vsYear": "par rapport aux mêmes jours l'année dernière : {value}",
    "compare.vsDays.one": "par rapport au jour précédent : {value}",
    "compare.vsDays.few": "par rapport aux {count} jours précédents : {value}",
    "compare.vsDays.many": "par rapport aux {count} jours précédents : {value}",
    "compare.vsDays.other": "par rapport aux {count} jours précédents : {value}",

    "countdown.empty": "Aucune date à dessiner. Attendu : `items:` ou une liste.",
    "countdown.dateRequired": "{card} : `date:` manque. Il n'y a rien à décompter.",
    "countdown.dateInvalid": "{card} : « {date} » n'est pas une date. Attendu : YYYY-MM-DD.",
    "countdown.today": "Aujourd'hui",
    "countdown.daysLeft.one": "jour restant",
    "countdown.daysLeft.few": "jours restants",
    "countdown.daysLeft.many": "jours restants",
    "countdown.daysLeft.other": "jours restants",
    "countdown.daysAgo.one": "jour écoulé",
    "countdown.daysAgo.few": "jours écoulés",
    "countdown.daysAgo.many": "jours écoulés",
    "countdown.daysAgo.other": "jours écoulés",

    "today.expectFields": "Attendu : un ensemble de champs, par exemple `daily: true`.",
    "today.nothingToShow": "Rien à afficher : activez `daily`, `weekly` ou `monthly`.",
    "today.notBoolean": "`{key}` attend true ou false, reçu « {value} ». Lu comme {read}.",
    "today.daily": "Aujourd'hui",
    "today.weekly": "Cette semaine",
    "today.monthly": "Ce mois-ci",
    "today.missingNote": "{path}: la note n'existe pas encore, un clic la crée",

    "heatmap.expectFields": "Attendu : un ensemble de champs, par exemple `source:` et `field:`.",
    "heatmap.fieldRequired": "Aucun `field` donné. Il n'y a pas de nombre pour colorer.",
    "heatmap.noData":
        "Aucune note avec une date reconnaissable et un nombre ou une case à cocher dans « {field} ». Vérifiez `source`, ou `date_field` si la date se trouve dans une propriété.",
    "heatmap.caption": "{year}, {field} : moyenne {average}, {present} jours sur {total}",
    "heatmap.captionMarks": "{year}, {field} : {present} jours sur {total}",
    "heatmap.titleYear": "{title} ({year})",
    "heatmap.cell": "{date}: {field} {value}",
    "heatmap.cellEmpty": "{date}: aucune donnée",

    "insert.name": "Insérer un bloc",
    "insert.placeholder": "Quel bloc ?",
    "block.tiles": "Tuiles de navigation avec le nombre de notes par dossier",
    "block.stats": "Cartes de chiffres sur une sélection de notes",
    "block.progress": "Barres vers un objectif",
    "block.today": "La date du jour et les notes périodiques",
    "block.countdown": "Jours avant une date",
    "block.heatmap": "Une année de jours, colorée par un nombre",

    "about.heading": "À propos",
    "about.bug": "Signaler un bug",
    "about.bugDesc": "Ouvre GitHub avec les versions déjà renseignées.",
    "about.feature": "Proposer une fonctionnalité",
    "about.featureDesc": "Dites-moi ce que vous avez voulu construire sans y arriver.",
    "about.docs": "Documentation",
    "about.docsDesc": "Chaque bloc, chaque clé, avec des exemples.",
    "about.funding": "Offrez-moi un café",
    "about.fundingDesc": "Le plugin est gratuit et le restera. C'est seulement si l'envie vous prend.",
    "about.open": "Ouvrir",

    "settings.languageHeading": "Langue",
    "settings.language": "Langue du plugin",
    "settings.languageDesc": "La langue dans laquelle parlent les blocs. Celle d'Obsidian par défaut.",
    "settings.languageAuto": "Suivre Obsidian",

    "settings.periodicHeading": "Notes périodiques",
    "settings.dailyFolder": "Dossier des notes quotidiennes",
    "settings.dailyFolderDesc": "Laissez vide pour utiliser les réglages du plugin Periodic Notes lorsqu'il est installé.",
    "settings.weeklyFolder": "Dossier des notes hebdomadaires",
    "settings.monthlyFolder": "Dossier des notes mensuelles",
    "settings.followPeriodic": "Utilisé par le bloc today. Laissez vide pour suivre Periodic Notes.",

    "settings.startDayHeading": "Nouveau jour",
    "settings.startDayHour": "Le nouveau jour commence à",
    "settings.startDayHourDesc":
        "Ce que chaque bloc appelle aujourd'hui : quelle note le bloc today ouvre, et où se terminent les fenêtres period, compare et trend. Minuit garde le comportement actuel et ne change jamais le jour de la note elle-même.",

    "settings.skillHeading": "Skill pour agent IA",
    "settings.skillName": "Fichier skill dans ce coffre",
    "settings.skillNotInstalled":
        "Écrit {path} pour qu'un agent (Claude Code, Cursor) écrive ces blocs à votre place.",
    "settings.skillCurrent": "Installé, version {version}. Rien à faire.",
    "settings.skillOutdated": "Version installée {installed}, disponible {available}.",
    "settings.agentsName": "AGENTS.md à la racine du coffre",
    "settings.agentsNotInstalled":
        "Écrit {path} pour les agents qui ne lisent pas les skills Claude: Cursor, Codex et les autres. Seule la section délimitée nous appartient ; le reste du fichier n'est pas touché.",
    "settings.agentsCurrent": "Écrit, version {version}. Rien à faire.",
    "settings.agentsOutdated": "Écrit en version {installed}, disponible {available}.",
    "settings.agentsUntouched":
        "{path} contient une section Dashy à moitié écrite et a été laissé tel quel. Retirez le marqueur resté en place et réessayez.",

    "settings.install": "Installer",
    "settings.update": "Mettre à jour",
    "settings.copyMarkdown": "Copier le markdown",
    "settings.copied": "Markdown du skill copié.",
    "settings.written": "Skill écrit dans {path}",
    "settings.writeFailed": "Impossible d'écrire le skill : {message}",
    "settings.copyFailed": "Copie impossible : {message}. Utilisez Installer à la place.",
};

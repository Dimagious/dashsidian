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
    "parse.unknownKeyHint": "Clé inconnue « {key} ». Dans ce bloc, elle s'appelle « {hint} ».",

    "render.line": "ligne {line}",

    "bands.hasData": "avec données",
    "bands.from": "à partir de {min}",

    "duration.hours": "{value}\u00A0h",
    "duration.minutes": "{value}\u00A0min",
    "duration.seconds": "{value}\u00A0s",

    "where.noSuchFolder": "Rien n'est classé sous `{folder}`. Les chiffres ci-dessous ne comptent rien. Pointez `source` vers un dossier à vous.",
    "where.unreadable":
        "`where: {where}` n'a pas pu être lu et a été ignoré. Les chiffres ci-dessous ne sont pas filtrés. Attendu : quelque chose comme `year = 2026`, `rating >= 4` ou `tags contains books`.",
    "where.conjunction":
        "`where: {where}` utilise `or`, qui n'est pas pris en charge. Le filtre a été ignoré et les chiffres ci-dessous ne sont pas filtrés. Pour exiger toutes les conditions, reliez-les par `and` ou écrivez-les en liste, par exemple `[year = 2026, rating >= 4]` ; mettez la valeur entre guillemets si le mot en fait partie.",
    "where.badCondition":
        "`{condition}` dans `where` n'a pas pu être lu, donc tout le filtre a été ignoré. Les chiffres ci-dessous ne sont pas filtrés. Une condition ressemble à `year = 2026`, `rating >= 4` ou `tags contains books`.",
    "where.badItem":
        "`where` contient `{value}`, qui n'est pas une condition, donc tout le filtre a été ignoré. Les chiffres ci-dessous ne sont pas filtrés. Chaque élément est une condition comme `year = 2026`.",
    "where.emptyList":
        "`where` est une liste vide, le filtre a donc été ignoré et les chiffres ci-dessous ne sont pas filtrés. Listez des conditions, par exemple `[year = 2026, rating >= 4]`, ou retirez la clé.",
    "where.sourceNumber":
        "`source` doit être un nom de dossier sous forme de texte, reçu `{value}`, la clé a donc été ignorée et tout le coffre est lu. Mettez le nom du dossier entre guillemets, tel qu'il est écrit : `source: \"2024\"`.",
    "where.sourceNotText":
        "`source` doit être un seul nom de dossier sous forme de texte, reçu `{value}`, la clé a donc été ignorée et tout le coffre est lu. Indiquez un dossier, par exemple `source: Journal`.",
    "where.tagNumber":
        "`tag` doit être un nom de tag sous forme de texte, reçu `{value}`, la clé a donc été ignorée et aucun filtre par tag ne s'applique. Mettez le nom du tag entre guillemets, tel qu'il est écrit : `tag: \"2024\"`.",
    "where.tagNotText":
        "`tag` doit être un seul nom de tag sous forme de texte, reçu `{value}`, la clé a donc été ignorée et aucun filtre par tag ne s'applique. Indiquez un tag, par exemple `tag: book`.",

    "inherit.rootPeriodInvalid":
        "`period` à la racine du bloc attend week, month, year, une fenêtre glissante comme 30d, note, une période comme 2026-W40 ou des dates from et to, reçu « {value} ». Tout ce qui en hérite est dessiné sans la fenêtre.",
    "inherit.rootDateFieldUndated":
        "`date_field` à la racine du bloc : aucune des notes sélectionnées pour {cards} n'a de date dans « {field} ».",
    "inherit.blankSourceRoot":
        "`source` à la racine du bloc est vide, donc tout le coffre est lu. Indiquez un dossier, ou retirez la clé si tout le coffre est voulu.",
    "inherit.blankTagRoot":
        "`tag` à la racine du bloc est vide, donc aucun filtre par tag ne s'applique. Indiquez un tag, ou retirez la clé si aucun filtre par tag n'est voulu.",
    "inherit.blankSource":
        "{card} : `source` est vide, donc tout le coffre est lu au lieu du dossier à la racine du bloc. Retirez la clé pour hériter de ce dossier.",
    "inherit.blankTag":
        "{card} : `tag` est vide, donc aucun filtre par tag ne s'applique au lieu du tag à la racine du bloc. Retirez la clé pour hériter de ce tag.",
    "inherit.blankSourceNoRoot":
        "{card} : `source` est vide, donc tout le coffre est lu. Indiquez un dossier, ou retirez la clé si tout le coffre est voulu.",
    "inherit.blankTagNoRoot":
        "{card} : `tag` est vide, donc aucun filtre par tag ne s'applique. Indiquez un tag, ou retirez la clé si aucun filtre par tag n'est voulu.",

    "tiles.empty": "Aucune tuile à dessiner. Attendu : `items:` ou une liste.",
    "tiles.dateFieldUnused": "{card} : `date_field` n'a aucun effet sans `period`.",
    "tiles.selectionUnused": "{card} : `tag`, `where`, `period` et `date_field` ne font que restreindre `badge: count`.",
    "tiles.imageMissing": "{card} : image « {path} » introuvable.",
    "tiles.imageUnsupported":
        "{card} : `image` attend un chemin du coffre, un `[[wikilien]]` ou une URL `https://`, reçu « {value} ».",

    "stats.empty": "Aucune carte à dessiner. Attendu : `items:` ou une liste.",
    "stats.unlabeledCard": "une carte sans libellé",
    "stats.unknownAgg": "{card} : agrégat « {agg} » inconnu. Disponibles : {available}.",
    "stats.unknownAggGuess":
        "{card} : agrégat « {agg} » inconnu. Vouliez-vous dire « {guess} » ? Disponibles : {available}.",
    "stats.fieldRequired":
        "{card} : l'agrégat « {agg} » a besoin d'un nombre. Ajoutez `field:` avec une propriété du frontmatter.",
    "stats.fieldMissing":
        "{card} : aucune note de la sélection n'a « {field} ». Vérifiez le nom et `source`.",
    "stats.fieldNotNumeric":
        "{card} : « {field} » contient du texte ou une autre valeur qui n'est ni un nombre, ni une durée comme `7h 30m`, ni une case à cocher. Utilisez `where: \"{field} contains ...\"` avec `agg: count` pour le compter.",
    "stats.badPrecision":
        "{card} : `precision` attend un entier de 0 à {max}, reçu « {value} ». Arrondi par défaut.",
    "stats.streakKeysIgnored":
        "{card} : `at_least`, `at_most`, `days` et `skip_field` ne s'appliquent qu'à `agg: streak` et `agg: current_streak`, ignoré.",
    "stats.streakThresholdNeedsField":
        "{card} : `at_least` et `at_most` ont besoin d'un `field:` pour faire la somme. Ignoré.",
    "stats.streakThresholdInvalid": "{card} : `{key}` attend un nombre ou une durée comme `7h 30m`, reçu « {value} ». Ignoré.",
    "stats.streakThresholdImpossible":
        "{card} : `at_least` dépasse `at_most`, aucun jour ne peut satisfaire les deux. La série est 0.",
    "stats.streakDaysInvalid": "{card} : `days` attend `all` ou `weekdays`, reçu « {value} ». Utilise `all`.",
    "stats.skipFieldInvalid": "{card} : `skip_field` attend un nom de propriété, reçu « {value} ». Ignoré.",
    "stats.durationMixed": "{card} : « {field} » mélange des durées (« {durationNote} ») et des nombres simples (« {plainNote} »). Tout est compté en minutes et affiché comme un nombre simple.",
    "stats.durationUnitIgnored": "{card} : `unit: {unit}` est ignoré. « {field} » contient des durées, qui portent déjà leurs unités.",
    "stats.durationThresholdOnPlain": "{card} : `{key}: {value}` est une durée, mais « {field} » contient des nombres simples. La valeur est appliquée en minutes.",
    "stats.layoutInvalid": "`layout` attend cards ou inline, reçu « {value} ». Affichage en cartes.",
    "stats.inlineColumnsIgnored": "`columns` est sans effet avec `layout: inline`, qui tient sur une seule ligne.",
    "stats.inlineTrendHidden": "`trend` n'est pas dessiné avec `layout: inline` : {cards}. Utilisez `layout: cards` pour le voir.",
    "stats.inlineSubHidden": "`sub` n'est pas affiché avec `layout: inline` : {cards}. Utilisez `layout: cards` pour le voir.",

    "progress.empty": "Aucune barre à dessiner. Attendu : `items:` ou une liste.",
    "progress.goalRequired": "{card} : `goal:` a besoin d'un nombre ou d'une durée comme `7h 30m`. Il n'y a rien à mesurer.",
    "progress.goalNotPositive": "{card} : un objectif de {goal} ne laisse rien à remplir. Il doit être supérieur à zéro.",
    "progress.goalDurationOnCount": "{card} : `goal: {value}` est une durée, mais `agg: {agg}` compte des jours ou des notes, pas du temps. L'objectif est appliqué en minutes.",

    "stats.trendNeedsField": "{card} : `trend` a besoin d'un `field:` à tracer. Compter des notes n'a pas de forme.",
    "stats.trendInvalid": "{card} : `trend` attend un nombre de jours comme 30d, reçu « {value} ».",

    "dateFormat.invalid": "`date_format` attend un format de date comme DD.MM.YYYY, reçu « {value} ». Ignoré.",
    "dateFormat.notADay":
        "`date_format: {format}` ne contient pas l'année, le mois et le jour, il ne peut donc pas désigner un jour. Ignoré. Écrivez-le comme DD.MM.YYYY.",
    "dateFormat.unmatched":
        "`date_format: {format}` ne correspond à aucune des notes sélectionnées : « {example} », par exemple, n'est pas écrit ainsi.",

    "period.invalid":
        "{card} : `period` attend week, month, year, une fenêtre glissante comme 30d, note, une période comme 2026-W40 ou des dates from et to, reçu « {value} ». Dessiné sans la fenêtre.",
    "period.noDatedNotes":
        "{card} : aucune des notes sélectionnées n'a un nom commençant par une date du type YYYY-MM-DD. Définissez `date_format:` si les noms l'écrivent autrement, comme DD.MM.YYYY, ou ajoutez `date_field:` si la date se trouve dans une propriété.",
    "period.noDatedNotesField": "{card} : aucune des notes sélectionnées n'a de date dans « {field} ».",
    "period.dateFieldUnused":
        "{card} : `date_field` n'a aucun effet ici. Il ne pilote que `period`, `streak`, `current_streak`, `latest` et `trend`.",
    "period.noteNotAPeriod": "`{key}: note` demande une note nommée comme un jour, une semaine, un mois, un trimestre ou une année, et cette note s'appelle « {name} ». Nommez-la dans l'un de ces formats : {formats}.",
    "period.boundsInvalid": "`{key}` sous forme de map prend `from` et `to`, chacun une date comme 2026-09-01, reçu « {value} ».",
    "period.boundsNoFrom": "`{key}` a `to` mais pas `from`. Une fenêtre a besoin d'un début : ajoutez `from:` avec une date comme 2026-09-01.",
    "period.boundsOrder": "`{key}` commence après sa fin : `from: {from}` est postérieur à `to: {to}`. Inversez-les.",
    "period.atCard": "{card} : {message}",
    "period.noteFuture": "Cette fenêtre commence le {date}, il n'y a encore rien à compter.",
    "period.windowSpan": "du {from} au {to}",

    "compare.notBoolean": "{card} : `compare` attend true, false ou usual, reçu « {value} ». Comparaison ignorée.",
    "compare.needsPeriod": "{card} : `compare` a besoin de `period`. Il n'y a rien avec quoi comparer.",
    "compare.streakUnsupported":
        "{card} : `compare` ne fonctionne pas avec `streak` ni `current_streak`. Une série n'a pas de valeur propre à la période précédente à comparer.",
    "compare.betterUnused": "{card} : `better` n'a aucun effet sans `compare: true`.",
    "compare.badBetter": "{card} : `better` attend `up` ou `down`, reçu « {value} ». L'écart reste neutre.",
    "compare.vsWeek": "par rapport aux mêmes jours la semaine dernière : {value}",
    "compare.vsMonth": "par rapport aux mêmes jours le mois dernier : {value}",
    "compare.vsYear": "par rapport aux mêmes jours l'année dernière : {value}",
    "compare.vsQuarter": "par rapport aux mêmes jours le trimestre dernier : {value}",
    "compare.vsPreviousDay": "par rapport au jour précédent : {value}",
    "compare.vsPreviousWeek": "par rapport à la semaine précédente : {value}",
    "compare.vsPreviousMonth": "par rapport au mois précédent : {value}",
    "compare.vsPreviousQuarter": "par rapport au trimestre précédent : {value}",
    "compare.vsPreviousYear": "par rapport à l'année précédente : {value}",
    "compare.vsDays.one": "par rapport au jour précédent : {value}",
    "compare.vsDays.few": "par rapport aux {count} jours précédents : {value}",
    "compare.vsDays.many": "par rapport aux {count} jours précédents : {value}",
    "compare.vsDays.other": "par rapport aux {count} jours précédents : {value}",
    "compare.usualNeedsAvg": "{card} : `compare: usual` ne fonctionne qu'avec `agg: avg`. Le niveau habituel est une moyenne, aucun écart n'est donc affiché.",
    "compare.vsUsual": "par rapport à l'habitude : {value}",
    "compare.noHistory": "aucun historique avant cette période",

    "countdown.empty": "Aucune date à dessiner. Attendu : `items:` ou une liste.",
    "countdown.dateRequired": "{card} : ni `date:` ni `field:` n'est défini. Il n'y a rien à décompter.",
    "countdown.dateInvalid": "{card} : « {date} » n'est pas une date. Attendu : YYYY-MM-DD.",
    "countdown.dateAndField": "{card} : `date:` et `field:` sont tous deux définis. Gardez-en un : une date écrite ici, ou une propriété lue dans une note.",
    "countdown.fieldInvalid": "{card} : `field` attend un nom de propriété, reçu « {value} ».",
    "countdown.fieldMissing": "{card} : aucune note de la sélection n'a « {field} » rempli. Vérifiez le nom, `source`, `tag` et `where`.",
    "countdown.fieldNotDate": "{card} : « {field} » dans « {note} » vaut « {value} », ce n'est pas une date. Attendu : YYYY-MM-DD, ou un autre format nommé par `date_format:` à côté de `items:`.",
    "countdown.repeatInvalid": "{card} : `repeat` attend `yearly`, reçu « {value} ».",
    "countdown.selectionUnused": "{card} : `source`, `tag` et `where` choisissent seulement la note où `field` est lu. Avec `date:`, ils sont ignorés.",
    "countdown.today": "Aujourd'hui",
    "countdown.daysLeft.one": "jour restant",
    "countdown.daysLeft.few": "jours restants",
    "countdown.daysLeft.many": "jours restants",
    "countdown.daysLeft.other": "jours restants",
    "countdown.daysAgo.one": "jour écoulé",
    "countdown.daysAgo.few": "jours écoulés",
    "countdown.daysAgo.many": "jours écoulés",
    "countdown.daysAgo.other": "jours écoulés",
    "countdown.years.one": "an",
    "countdown.years.few": "ans",
    "countdown.years.many": "ans",
    "countdown.years.other": "ans",

    "today.expectFields": "Attendu : un ensemble de champs, par exemple `daily: true`.",
    "today.nothingToShow": "Rien à afficher : activez `daily`, `weekly` ou `monthly`.",
    "today.notBoolean": "`{key}` attend true ou false, reçu « {value} ». Lu comme {read}.",
    "today.badClock": "`clock` attend true, false, minutes ou seconds, reçu « {value} ». L'horloge n'est pas affichée.",
    "today.daily": "Aujourd'hui",
    "today.weekly": "Cette semaine",
    "today.monthly": "Ce mois-ci",
    "today.missingNote": "{path}: la note n'existe pas encore, un clic la crée",

    "heatmap.expectFields": "Attendu : un ensemble de champs, par exemple `source:` et `field:`.",
    "heatmap.fieldRequired": "Aucun `field` donné. Il n'y a pas de nombre pour colorer.",
    "heatmap.noData":
        "Aucune note avec une date reconnaissable et un nombre, une durée comme `7h 30m` ou une case à cocher dans « {field} ». Vérifiez `source`, `date_format` si les noms écrivent les dates autrement, comme DD.MM.YYYY, ou `date_field` si la date se trouve dans une propriété.",
    "heatmap.fieldMissing":
        "Aucune note de la sélection n'a « {field} ». Vérifiez le nom et `source`.",
    "heatmap.fieldNotNumeric":
        "« {field} » contient du texte ou une autre valeur qui n'est ni un nombre, ni une durée comme `7h 30m`, ni une case à cocher. Utilisez `where: \"{field} contains ...\"` avec `agg: count` dans une carte stats pour le compter.",
    "heatmap.fieldInvalid": "`field` attend un nom de propriété ou une liste de ceux-ci, reçu « {value} ».",
    "heatmap.fieldListEmpty": "`field` est une liste vide. Ajoutez au moins un nom de propriété.",
    "heatmap.fieldListInvalid": "Les éléments de la liste `field` doivent être de simples noms de propriétés, reçu « {value} ».",
    "heatmap.perDayInvalid": "`per_day` attend sum, avg ou max, reçu « {value} ». Utilisation de sum.",
    "heatmap.skipFieldInvalid": "`skip_field` attend un nom de propriété, reçu « {value} ». Ignoré.",
    "heatmap.fieldUnused":
        "« {field} » n'a jamais fourni de valeur ici. Vérifiez le nom, ou qu'il contient bien un nombre, une durée comme `7h 30m` ou une case à cocher.",
    "heatmap.layersAndField":
        "`layers` et `field` sont tous les deux définis. Utilisez l'un ou l'autre : `layers` pour plusieurs couleurs, `field` pour une seule.",
    "heatmap.layersColorIgnored": "`color` est ignoré : chaque entrée de `layers` a sa propre couleur.",
    "heatmap.layersInvalid": "`layers` attend une liste de cartes, reçu « {value} ».",
    "heatmap.layersEmpty": "`layers` est une liste vide. Ajoutez au moins une couche.",
    "heatmap.layerNotMap": "La couche {position} doit être une carte avec `field`, reçu « {value} ».",
    "heatmap.layerLabelInvalid": "Couche {position} : `label` attend un nom, reçu « {value} ».",
    "heatmap.layerAt": "Couche {position} : {message}",
    "heatmap.pickInvalid": "`pick` attend first ou max, reçu « {value} ». Utilisation de first.",
    "heatmap.pickWithoutLayers": "`pick` est ignoré : il ne choisit qu'entre des `layers`, et ce bloc a un seul `field`.",
    "heatmap.rangeInvalid":
        "`range` attend week, month, year, une fenêtre glissante comme 30d, note, une période comme 2026-W40 ou des dates from et to, reçu « {value} ». Une grille par année est dessinée à la place.",
    "heatmap.layoutInvalid": "`layout` attend grid ou calendar, reçu « {value} ». grid est utilisé.",
    "heatmap.calendarNeedsRange": "`layout: calendar` demande un mois ou une semaine : `range: month`, `range: week`, ou un seul mois ou une seule semaine comme `range: 2026-10` ou `range: note` dans une note hebdomadaire. La grille est dessinée à la place.",
    "heatmap.calendarBandsIgnored": "`bands` est ignoré avec `layout: calendar` : un jour affiche des points, pas une nuance.",
    "heatmap.calendarSpan": "{from} à {to}",
    "heatmap.caption": "{year}, {field} : moyenne {average}, {present} jours sur {total}",
    "heatmap.captionMarks": "{year}, {field} : {present} jours sur {total}",
    "heatmap.captionRange": "{field} : moyenne {average}, {present} jours sur {total}",
    "heatmap.captionRangeMarks": "{field} : {present} jours sur {total}",
    "heatmap.titleYear": "{title} ({year})",
    "heatmap.cell": "{date}: {field} {value}",
    "heatmap.cellLayers": "{date}: {parts}",
    "heatmap.cellPart": "{label} {value}",
    "heatmap.cellWithNote": "{cell} ({note})",
    "heatmap.notesCount.one": "{count} note",
    "heatmap.notesCount.few": "{count} notes",
    "heatmap.notesCount.many": "{count} notes",
    "heatmap.notesCount.other": "{count} notes",
    "heatmap.cellEmpty": "{date}: aucune donnée",
    "heatmap.cellSkipped": "{cell}, jour de congé",
    "heatmap.cellEmptySkipped": "{date}: jour de congé",
    "heatmap.cellToday": "{cell}, aujourd'hui",
    "heatmap.legendSkipped": "Jour de congé",
    "heatmap.durationMixed": "« {field} » mélange des durées (« {durationNote} ») et des nombres simples (« {plainNote} »). Tout est compté en minutes et affiché en nombres simples.",
    "heatmap.checkboxListNumber": "« {field} » contient un nombre dans « {note} », donc les cases de cette liste ne sont pas comptées par jour : un jour avec seulement des cases cochées est coloré en entier.",
    "heatmap.durationThresholdOnPlain": "Le seuil `bands` « {value} » est une durée, mais « {field} » contient des nombres simples. Il est appliqué en minutes.",

    "chart.expectFields": "Un ensemble de champs était attendu, par exemple `source:` et `field:`.",
    "chart.fieldRequired": "Ni `field` ni `series` n'est indiqué. Il n'y a aucun nombre à tracer. Ajoutez `field:`, ou `agg: count` pour compter les notes.",
    "chart.fieldInvalid": "`field` attend un nom de propriété, reçu « {value} ».",
    "chart.seriesAndField": "`series` et `field` sont tous deux définis. Gardez-en un : `field` pour une ligne, `series` pour plusieurs.",
    "chart.fieldListAtRoot": "`field` prend ici une seule propriété. Utilisez `series:` pour plusieurs lignes, ou `series: [{field: [a, b]}]` pour les réunir en une.",
    "chart.seriesInvalid": "`series` attend une liste de dictionnaires, reçu « {value} ».",
    "chart.seriesEmpty": "`series` est une liste vide. Ajoutez au moins une série.",
    "chart.seriesTooMany": "`series` compte {count} entrées, et un graphique en accepte au plus {max}. Répartissez-les sur deux blocs.",
    "chart.seriesNotMap": "La série {position} doit être un dictionnaire avec `field`, reçu « {value} ».",
    "chart.seriesAt": "Série {position} : {message}",
    "chart.seriesFieldRequired": "Aucun `field` indiqué. Il n'y a aucun nombre à tracer.",
    "chart.labelInvalid": "`label` attend un nom, reçu « {value} ».",
    "chart.labelIgnored": "`label` est ignoré : chaque entrée de `series` porte son propre libellé.",
    "chart.colorIgnored": "`color` est ignoré : chaque entrée de `series` porte sa propre couleur.",
    "chart.typeInvalid": "`type` attend line ou bar, reçu « {value} ». Une ligne est tracée.",
    "chart.bucketInvalid": "`bucket` attend day, week, month ou year, reçu « {value} ». day est utilisé.",
    "chart.aggInvalid": "Agrégat inconnu « {value} ». Disponibles : {available}.",
    "chart.aggInvalidGuess": "Agrégat inconnu « {value} ». Vouliez-vous dire « {guess} » ? Disponibles : {available}.",
    "chart.countIgnoresField": "`agg: count` compte les notes datées et ne lit aucun `field`. Le champ est ignoré.",
    "chart.countLabel": "notes",
    "chart.rangeInvalid": "`range` attend week, month, year, une fenêtre glissante comme 30d, note, une période comme 2026-W40 ou des dates from et to, reçu « {value} ». La valeur par défaut du regroupement est utilisée.",
    "chart.tooManyBuckets": "Plus de {max} regroupements dans la fenêtre. Seuls les {max} plus récents sont tracés. Essayez `bucket: {next}`.",
    "chart.rangeShorterThanBucket": "La fenêtre ne dépasse pas un `bucket`, aucune tendance n'est visible. Élargissez `range` ou choisissez un `bucket` plus petit.",
    "chart.goalInvalid": "`goal` attend un nombre ou une durée comme `7h 30m`, reçu « {value} ». Ignoré.",
    "chart.goalDurationOnPlain": "`goal: {value}` est une durée, mais le graphique contient des nombres simples. Elle est appliquée en minutes.",
    "chart.unitInvalid": "`unit` attend du texte, reçu « {value} ». Ignoré.",
    "chart.badPrecision": "`precision` attend un nombre entier de 0 à {max}, reçu « {value} ». Arrondi par défaut.",
    "chart.durationUnitIgnored": "`unit: {unit}` est ignoré pour « {field} », qui contient des durées portant déjà leurs unités.",
    "chart.durationMixed": "« {field} » mélange des durées (« {durationNote} ») et des nombres simples (« {plainNote} »). Tout est compté en minutes et affiché en nombres simples.",
    "chart.fieldMissing": "Aucune note de la sélection n'a « {field} ». Vérifiez le nom et `source`.",
    "chart.fieldNotNumeric": "« {field} » contient du texte ou une autre valeur qui n'est ni un nombre, ni une durée comme `7h 30m`, ni une case à cocher : il n'y a rien à tracer.",
    "chart.noData": "« {field} » n'a des nombres que dans des notes sans date. Nommez les notes quotidiennes YYYY-MM-DD, définissez `date_format:` si elles sont nommées autrement, comme DD.MM.YYYY, ou ajoutez `date_field:` si la date est dans une propriété.",
    "chart.fieldUnused": "« {field} » n'a jamais fourni de valeur ici. Vérifiez le nom, ou qu'il contient bien un nombre, une durée comme `7h 30m` ou une case à cocher.",
    "chart.noDatedNotes": "Aucune des notes sélectionnées n'a un nom commençant par une date comme YYYY-MM-DD. Définissez `date_format:` si les noms l'écrivent autrement, comme DD.MM.YYYY, ou ajoutez `date_field:` si la date est dans une propriété.",
    "chart.noDatedNotesField": "Aucune des notes sélectionnées n'a de date dans « {field} ».",
    "chart.caption": "{label} : {agg} {per}, {span}",
    "chart.captionMixed": "{label} : {per}, {span}",
    "chart.aggSum": "somme",
    "chart.aggAvg": "moyenne",
    "chart.aggMin": "minimum",
    "chart.aggMax": "maximum",
    "chart.aggCount": "nombre",
    "chart.perDay": "par jour",
    "chart.perWeek": "par semaine",
    "chart.perMonth": "par mois",
    "chart.perYear": "par an",
    "chart.days.one": "dernier {count} jour",
    "chart.days.few": "{count} derniers jours",
    "chart.days.many": "{count} derniers jours",
    "chart.days.other": "{count} derniers jours",
    "chart.weeks.one": "dernière {count} semaine",
    "chart.weeks.few": "{count} dernières semaines",
    "chart.weeks.many": "{count} dernières semaines",
    "chart.weeks.other": "{count} dernières semaines",
    "chart.months.one": "dernier {count} mois",
    "chart.months.few": "{count} derniers mois",
    "chart.months.many": "{count} derniers mois",
    "chart.months.other": "{count} derniers mois",
    "chart.years.one": "dernière {count} année",
    "chart.years.few": "{count} dernières années",
    "chart.years.many": "{count} dernières années",
    "chart.years.other": "{count} dernières années",
    "chart.notesCount.one": "{count} note",
    "chart.notesCount.few": "{count} notes",
    "chart.notesCount.many": "{count} notes",
    "chart.notesCount.other": "{count} notes",
    "chart.point": "{date} : {series} {value}",
    "chart.pointParts": "{date} : {parts}",
    "chart.pointPart": "{label} {value}",
    "chart.pointNoData": "{date} : pas de données",
    "chart.pointWithNote": "{point} ({note})",
    "chart.soFar": "{point}, pour l'instant",
    "chart.weekOf": "Semaine du {date}",
    "chart.goalLabel": "objectif {value}",
    "chart.emptyRange": "Aucune donnée : {span}",
    "chart.emptyWindow": "Aucune donnée : {window}",
    "chart.kindLine": "Graphique en ligne",
    "chart.kindBar": "Graphique en barres",
    "chart.summary": "{kind} : {series}, {span}",
    "chart.valueWithUnit": "{value} {unit}",

    "insert.name": "Insérer un bloc",
    "insert.placeholder": "Quel bloc ?",
    "block.tiles": "Tuiles de navigation avec le nombre de notes par dossier",
    "block.stats": "Cartes de chiffres sur une sélection de notes",
    "block.progress": "Barres vers un objectif",
    "block.today": "La date du jour et les notes périodiques",
    "block.countdown": "Jours avant une date",
    "block.heatmap": "Une année de jours, colorée par un nombre",
    "block.chart": "Lignes ou barres d'un nombre par jours, semaines ou mois",

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

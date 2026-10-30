/**
 * The `Write vault profile` command (B-168), pure part: what an agent needs
 * to write correct blocks without walking the vault itself. The properties
 * and how Dashy reads them, the folders and how their notes are dated, the
 * settings the blocks follow.
 *
 * The file may be read by a language model, so it is bounded and keeps the
 * vault's content out: property names, counts and a short sample of each
 * value, never the text of a note, never a value whose property name looks
 * like a secret. Every kind and every date is read by the blocks' own rules
 * (`numberAt`, `resolveNoteDate`, `readPeriodName`), so what the file says
 * is what a block will do.
 */

import type { NoteRecord } from "./source";
import { isEmptyValue } from "./source";
import { isRecord } from "../shared/parse";
import { isDurationMark, numberAt } from "./aggregate";
import { dateFromName, isRealDate, resolveNoteDate, type DateFormats } from "./note-date";
import { readPeriodName, type PeriodNames, type PeriodUnit } from "./period-name";
import { isInTemplateFolder } from "./template-note";
import { profileVault, type VaultProfile } from "./vault-profile";

export type FieldKind = "number" | "duration" | "checkbox" | "date" | "list" | "text";

export interface FieldSummary {
    /** the property, a nested one as a dotted path (`health.sleep`), the way `field` names it */
    name: string;
    /** notes holding a value */
    notes: number;
    /** notes where the property is there but empty */
    empty: number;
    /** the kind most of its values have */
    kind: FieldKind;
    /** every kind seen, with its count, for a property that mixes them */
    kinds: Partial<Record<FieldKind, number>>;
    /** a short sample of a value of the main kind; null when hidden */
    sample: string | null;
    /** true when the name looks like a secret and no value is shown */
    hidden: boolean;
    /** the folders holding it most, at most `FIELD_FOLDERS` */
    folders: { folder: string; notes: number }[];
}

export interface FolderSummary {
    /** "" for the vault root */
    folder: string;
    notes: number;
    /** in a folder the Templates or Templater plugin keeps templates in */
    template: boolean;
    /** names starting with `YYYY-MM-DD` */
    isoNames: number;
    /** names read in the daily note format of the settings, which is not ISO */
    formatNames: number;
    /** names read as a week, a month, a quarter or a year, what `period: note` reads */
    periodNames: Partial<Record<PeriodUnit, number>>;
    /** date properties of notes in this folder, the `date_field` candidates */
    dateFields: { name: string; notes: number }[];
    /** names that look like a date no setting reads, with the `date_format` each fits */
    candidates: { format: string; notes: number }[];
}

export interface VaultDescription {
    notes: number;
    fields: FieldSummary[];
    /** every property found, before the list was cut */
    fieldCount: number;
    folders: FolderSummary[];
    folderCount: number;
    tags: { tag: string; notes: number }[];
    tagCount: number;
    /** what Insert block fits its examples to */
    example: VaultProfile;
}

export interface DescribeOptions {
    /** the day formats the blocks read note dates in after ISO */
    dayFormats?: DateFormats;
    /** the period name formats `period: note` reads */
    names?: PeriodNames;
    templateFolders?: readonly string[];
    limits?: Partial<Limits>;
}

export interface Limits {
    fields: number;
    folders: number;
    tags: number;
}

export const PROFILE_LIMITS: Limits = { fields: 60, folders: 40, tags: 30 };

/** How long a sample value may be before it is cut. */
export const SAMPLE_LENGTH = 40;

/** How many folders a property lists, and how many date properties and formats a folder lists. */
const FIELD_FOLDERS = 3;
const FOLDER_DETAILS = 5;

/** How deep a nested property is followed: `a.b.c` and no further. */
const MAX_DEPTH = 3;

/**
 * Property names whose value is never shown: a password, a token, an API
 * key. Matched on any part of a dotted path. The property is still listed,
 * with its kind and count, as an agent may need to know it is there.
 */
const SECRET = /pass(?:word|wd|phrase)|token|secret|credential|private|api[_\s-]?key|(?:^|[_\s.-])key$|^key/i;

export function isSecretName(name: string): boolean {
    return SECRET.test(name);
}

/** A value as a short line: lists joined, line breaks gone, cut at `SAMPLE_LENGTH`. */
export function sampleText(value: unknown): string {
    // A map deeper than `MAX_DEPTH` is not followed: say what it is rather than `[object Object]`.
    const one = (v: unknown): string => (isRecord(v) && !(v instanceof Date) ? "(map)" : String(v));
    const text = (Array.isArray(value) ? value.map(one).join(", ") : one(value)).replace(/\s+/g, " ").trim();
    return text.length > SAMPLE_LENGTH ? `${text.slice(0, SAMPLE_LENGTH)}...` : text;
}

/**
 * How a block reads a value: the kind decides what `agg` can do with it. The
 * rules are the blocks' own, so a quoted `"42"` is a number, `7:30` a
 * duration in minutes, `2026-10-05` a date.
 */
function kindOf(note: NoteRecord, path: string, value: unknown, formats?: DateFormats): FieldKind {
    if (typeof value === "boolean") return "checkbox";
    if (Array.isArray(value)) return "list";
    if (typeof value === "number") return "number";
    if (value instanceof Date || resolveNoteDate(note, path, formats) !== null) return "date";
    if (isDurationMark(note, path)) return "duration";
    if (numberAt(note, path) !== null) return "number";
    return "text";
}

/** Every property of a note, a nested map followed down to `MAX_DEPTH` as dotted paths. */
function leaves(frontmatter: Record<string, unknown>, prefix = "", depth = 1): [string, unknown][] {
    const out: [string, unknown][] = [];
    for (const [key, value] of Object.entries(frontmatter)) {
        const path = prefix + key;
        if (isRecord(value) && !Array.isArray(value) && !(value instanceof Date) && depth < MAX_DEPTH && Object.keys(value).length) {
            out.push(...leaves(value, `${path}.`, depth + 1));
        } else {
            out.push([path, value]);
        }
    }
    return out;
}

interface FieldTally {
    notes: number;
    empty: number;
    kinds: Map<FieldKind, number>;
    samples: Map<FieldKind, unknown>;
    folders: Map<string, number>;
}

interface FolderTally {
    notes: number;
    isoNames: number;
    formatNames: number;
    periodNames: Map<PeriodUnit, number>;
    dateFields: Map<string, number>;
    candidates: Map<string, number>;
}

const add = <K>(map: Map<K, number>, key: K, by = 1): void => {
    map.set(key, (map.get(key) ?? 0) + by);
};

/** Entries by count, most first, ties by name, so the same vault always reads the same. */
function ranked<K extends string>(map: Map<K, number>): [K, number][] {
    return [...map].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

export function describeVault(notes: readonly NoteRecord[], options: DescribeOptions = {}): VaultDescription {
    const limits = { ...PROFILE_LIMITS, ...options.limits };
    const templateFolders = options.templateFolders ?? [];
    const fields = new Map<string, FieldTally>();
    const folders = new Map<string, FolderTally>();
    const tags = new Map<string, number>();

    // Path order, so the sample of a property is the same on every run.
    const sorted = [...notes].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    for (const note of sorted) {
        const folder = folderTally(folders, note.folder);
        folder.notes++;
        nameDate(note, folder, options);
        for (const tag of new Set(note.tags)) add(tags, tag);

        for (const [path, value] of leaves(note.frontmatter)) {
            const tally: FieldTally = fields.get(path) ?? {
                notes: 0,
                empty: 0,
                kinds: new Map<FieldKind, number>(),
                samples: new Map<FieldKind, unknown>(),
                folders: new Map<string, number>(),
            };
            fields.set(path, tally);
            if (isEmptyValue(value)) {
                tally.empty++;
                continue;
            }
            const kind = kindOf(note, path, value, options.dayFormats);
            tally.notes++;
            add(tally.kinds, kind);
            if (!tally.samples.has(kind)) tally.samples.set(kind, value);
            add(tally.folders, note.folder);
            if (kind === "date") add(folder.dateFields, path);
        }
    }

    const fieldList = [...fields].sort((a, b) => b[1].notes - a[1].notes || (a[0] < b[0] ? -1 : 1));
    const folderList = [...folders].sort((a, b) => b[1].notes - a[1].notes || (a[0] < b[0] ? -1 : 1));
    const tagList = ranked(tags);

    return {
        notes: notes.length,
        fields: fieldList.slice(0, limits.fields).map(([name, tally]) => fieldSummary(name, tally)),
        fieldCount: fieldList.length,
        folders: folderList.slice(0, limits.folders).map(([folder, tally]) => ({
            folder,
            notes: tally.notes,
            template: isInTemplateFolder(`${folder}/note.md`, templateFolders),
            isoNames: tally.isoNames,
            formatNames: tally.formatNames,
            periodNames: Object.fromEntries(tally.periodNames),
            dateFields: ranked(tally.dateFields).slice(0, FOLDER_DETAILS).map(([name, n]) => ({ name, notes: n })),
            candidates: ranked(tally.candidates).slice(0, FOLDER_DETAILS).map(([format, n]) => ({ format, notes: n })),
        })),
        folderCount: folderList.length,
        tags: tagList.slice(0, limits.tags).map(([tag, n]) => ({ tag, notes: n })),
        tagCount: tagList.length,
        example: profileVault(notes),
    };
}

function folderTally(folders: Map<string, FolderTally>, folder: string): FolderTally {
    let tally = folders.get(folder);
    if (!tally) {
        tally = {
            notes: 0,
            isoNames: 0,
            formatNames: 0,
            periodNames: new Map<PeriodUnit, number>(),
            dateFields: new Map<string, number>(),
            candidates: new Map<string, number>(),
        };
        folders.set(folder, tally);
    }
    return tally;
}

/** How a note's name dates it, in the order the blocks try: ISO, the daily format, a period name; else what format it looks like. */
function nameDate(note: NoteRecord, folder: FolderTally, options: DescribeOptions): void {
    if (dateFromName(note.name) !== null) {
        folder.isoNames++;
        return;
    }
    if (options.dayFormats && resolveNoteDate(note, undefined, options.dayFormats) !== null) {
        folder.formatNames++;
        return;
    }
    const period = options.names ? readPeriodName(note.name, options.names, { tail: true }) : null;
    if (period) {
        if (period.unit === "day") folder.formatNames++;
        else add(folder.periodNames, period.unit);
        return;
    }
    for (const format of dateFormatCandidates(note.name)) add(folder.candidates, format);
}

function fieldSummary(name: string, tally: FieldTally): FieldSummary {
    const kinds = ranked(tally.kinds);
    const kind = kinds[0]?.[0] ?? "text";
    const hidden = isSecretName(name);
    const sample = tally.samples.get(kind);
    return {
        name,
        notes: tally.notes,
        empty: tally.empty,
        kind,
        kinds: Object.fromEntries(kinds),
        sample: hidden || sample === undefined ? null : sampleText(sample),
        hidden,
        folders: ranked(tally.folders).slice(0, FIELD_FOLDERS).map(([folder, n]) => ({ folder, notes: n })),
    };
}

/**
 * The `date_format` values a name could start with a date in, when it is not
 * ISO: `05.03.2026` fits `DD.MM.YYYY` and `MM.DD.YYYY`, `25.03.2026` only
 * the first, `2026.03.05` `YYYY.MM.DD`, `20260305` `YYYYMMDD`. Only real
 * days count, and only at the start of the name, which is where the blocks
 * look. A two-digit year is left alone: too many things look like one.
 */
export function dateFormatCandidates(name: string): string[] {
    const out: string[] = [];
    const dmy = /^(\d{1,2})([./_ -])(\d{1,2})\2(\d{4})(?!\d)/.exec(name);
    if (dmy) {
        const [, a = "", sep = "", b = "", y = ""] = dmy;
        if (isRealDate(Number(y), Number(b), Number(a))) out.push(`${tok("D", a)}${sep}${tok("M", b)}${sep}YYYY`);
        if (isRealDate(Number(y), Number(a), Number(b))) out.push(`${tok("M", a)}${sep}${tok("D", b)}${sep}YYYY`);
        return out;
    }
    const ymd = /^(\d{4})([./_ -])(\d{1,2})\2(\d{1,2})(?!\d)/.exec(name);
    if (ymd) {
        const [, y = "", sep = "", m = "", d = ""] = ymd;
        if (isRealDate(Number(y), Number(m), Number(d))) out.push(`YYYY${sep}${tok("M", m)}${sep}${tok("D", d)}`);
        return out;
    }
    const compact = /^(\d{4})(\d{2})(\d{2})(?!\d)/.exec(name);
    if (compact) {
        const [, y = "", m = "", d = ""] = compact;
        if (isRealDate(Number(y), Number(m), Number(d))) out.push("YYYYMMDD");
    }
    return out;
}

/** `DD` for a two-digit part, `D` for one digit. */
function tok(letter: "D" | "M", part: string): string {
    return part.length === 2 ? letter + letter : letter;
}

/** What the file says about the settings the blocks follow; read by `adapters/`, passed in plain. */
export interface ProfileSettings {
    pluginVersion: string;
    schemaVersion: string;
    /** YYYY-MM-DD, by the "New day starts at" hour */
    today: string;
    startDayHour: number;
    obsidianLanguage: string;
    pluginLanguage: string;
    /** 0 is Sunday, 1 Monday, as moment has it */
    firstDayOfWeek: number;
    /** the periodic notes the `today` block links: the folder and format it uses, and where the folder came from */
    periodic: { period: string; folder: string; format: string; from: "Dashy settings" | "Periodic Notes or Daily notes" | "default" }[];
    /** the name format of each period from the settings; ISO is always read too */
    nameFormats: Partial<Record<PeriodUnit, string>>;
    templateFolders: readonly string[];
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** A table cell: no pipe and no line break may leave it. */
function cell(text: string): string {
    return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

function code(text: string): string {
    return `\`${text.replace(/`/g, "'")}\``;
}

function folderName(folder: string): string {
    return folder === "" ? "(vault root)" : folder;
}

/** The profile file, Markdown an agent reads before writing a block. English only: it is for the agent. */
export function formatVaultProfile(vault: VaultDescription, settings: ProfileSettings): string {
    const out: string[] = [
        "# Dashy vault profile",
        "",
        `Written by the Dashy command "Write vault profile" on ${settings.today}. It is not updated on its own: ask the user to run the command again after the vault changes. Property values are short samples cut at ${SAMPLE_LENGTH} characters; note text is never included.`,
        "",
        "## Plugin and settings",
        "",
        `- Dashy ${settings.pluginVersion}, block schema ${settings.schemaVersion}`,
        `- Today: ${settings.today}; a new day starts at ${String(settings.startDayHour).padStart(2, "0")}:00`,
        `- Obsidian language: ${settings.obsidianLanguage}; Dashy's language: ${settings.pluginLanguage}`,
        `- First day of the week: ${WEEKDAYS[settings.firstDayOfWeek] ?? String(settings.firstDayOfWeek)} (locale weeks, \`gggg\` and \`ww\`, start on it; ISO weeks, \`GGGG\` and \`WW\`, start on Monday)`,
        `- Template folders: ${settings.templateFolders.length ? settings.templateFolders.map(code).join(", ") : "none"} (a \`period: note\` block in a template shows a hint, not an error)`,
        "",
        "## Periodic notes",
        "",
        "The notes the `today` block links.",
        "",
        "| Period | Folder | Name format | Read from |",
        "|---|---|---|---|",
        ...settings.periodic.map((p) => `| ${p.period} | ${cell(p.folder ? p.folder : "(vault root)")} | ${code(p.format)} | ${p.from} |`),
        "",
        `A note's name read by \`period: note\`: ${periodFormats(settings.nameFormats)}.`,
        "",
        "## Folders",
        "",
    ];

    if (!vault.folders.length) {
        out.push("The vault has no notes.", "");
    } else {
        if (vault.folderCount > vault.folders.length) {
            out.push(`Showing the ${vault.folders.length} folders with the most notes, of ${vault.folderCount}.`, "");
        }
        out.push(
            "How each folder's notes are dated. A name starting with `YYYY-MM-DD` dates its note; a date property is a `date_field` candidate; a name in another date format needs `date_format` on the block.",
            "",
            "| Folder | Notes | Dated by name | Date properties | Other date names |",
            "|---|---|---|---|---|",
        );
        for (const f of vault.folders) {
            out.push(`| ${cell(folderName(f.folder))}${f.template ? " (templates)" : ""} | ${f.notes} | ${cell(datedByName(f))} | ${cell(f.dateFields.map((d) => `${d.name} (${d.notes})`).join(", "))} | ${cell(f.candidates.map((c) => `${c.format} (${c.notes})`).join(", "))} |`);
        }
        out.push("");
    }

    out.push("## Properties", "");
    if (!vault.fields.length) {
        out.push("No note has properties.", "");
    } else {
        if (vault.fieldCount > vault.fields.length) {
            out.push(`Showing the ${vault.fields.length} properties found in the most notes, of ${vault.fieldCount}.`, "");
        }
        out.push(
            "The kind is how Dashy reads the value: `number`, `duration` (minutes) and `checkbox` (1 or 0) can be summed, averaged and streaked; a `date` can be a `date_field`; `text` and `list` can be counted and filtered with `where`. A nested property is written as a dotted path.",
            "",
            "| Property | Kind | Notes | Empty | Sample | Mostly in |",
            "|---|---|---|---|---|---|",
        );
        for (const f of vault.fields) {
            const kinds = Object.entries(f.kinds).length > 1
                ? `${f.kind}; also ${Object.entries(f.kinds).filter(([k]) => k !== f.kind).map(([k, n]) => `${k} (${n})`).join(", ")}`
                : f.kind;
            const sample = f.hidden ? "(hidden: the name looks like a secret)" : f.sample === null ? "" : code(f.sample);
            out.push(`| ${cell(f.name)} | ${kinds} | ${f.notes} | ${f.empty} | ${cell(sample)} | ${cell(f.folders.map((d) => `${folderName(d.folder)} (${d.notes})`).join(", "))} |`);
        }
        out.push("");
    }

    out.push("## Tags", "");
    if (!vault.tags.length) {
        out.push("No note has tags.", "");
    } else {
        if (vault.tagCount > vault.tags.length) out.push(`Showing the ${vault.tags.length} most used tags, of ${vault.tagCount}.`, "");
        out.push(vault.tags.map((t) => `${t.tag} (${t.notes})`).join(", "), "");
    }

    out.push(
        "## Insert block",
        "",
        `The Insert block command fills its examples with the folder holding the most notes, ${vault.example.folder === null ? "none here" : code(vault.example.folder)}, and the number property in the most notes, ${vault.example.field === null ? "none here" : code(vault.example.field)}.`,
        "",
    );
    return out.join("\n");
}

function datedByName(f: FolderSummary): string {
    const parts: string[] = [];
    if (f.isoNames) parts.push(`${f.isoNames} YYYY-MM-DD`);
    if (f.formatNames) parts.push(`${f.formatNames} in the daily note format`);
    for (const [unit, n] of Object.entries(f.periodNames)) parts.push(`${n} ${unit} names`);
    return parts.length ? parts.join(", ") : "0";
}

function periodFormats(formats: Partial<Record<PeriodUnit, string>>): string {
    const set = Object.entries(formats).map(([unit, format]) => `${unit} ${code(format)}`);
    const iso = "day `YYYY-MM-DD`, week `GGGG-[W]WW`, month `YYYY-MM`, quarter `YYYY-[Q]Q`, year `YYYY`";
    return set.length ? `${set.join(", ")} from the settings, then ISO: ${iso}` : `ISO only: ${iso}`;
}

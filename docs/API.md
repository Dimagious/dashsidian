# Dashy API for other plugins

A plugin that writes Dashy blocks into notes can ask Dashy which blocks it
draws in this vault and check a note's blocks before or after writing them,
the way the command **Dashy: Check blocks in this note** does.

## Getting it

The API is the `api` property of the plugin instance, the way Dataview
exposes its own. Dashy's plugin id is `dashsidian`:

```ts
type Plugins = { plugins?: { plugins?: Record<string, { api?: DashyApi } | undefined> } };
const dashy = (app as unknown as Plugins).plugins?.plugins?.dashsidian?.api;
```

It is there from the moment Dashy has loaded until it unloads. Read it when
you need it rather than once at startup: Dashy may load after your plugin,
be turned off, or be updated. After Dashy unloads, a reference you kept
returns no fences and its `check` rejects; read the property again.

## Versions

- `apiVersion` is an integer, 1 for now. Adding a member keeps it; removing
  or renaming one, or changing what one means, raises it. Check it with
  `>=`, not `===`.
- `version` is the Dashy plugin version, as in its manifest (`2.2.0`).
- `schemaVersion` is the version of the block schema: which block keys this
  Dashy knows. It moves on its own, not with the plugin version. If you
  write a key that came in a given schema version, check for at least that
  version.

```ts
function dashyApi(app: App): DashyApi | null {
    const api = (app as unknown as Plugins).plugins?.plugins?.dashsidian?.api;
    if (!api || typeof api.apiVersion !== "number" || api.apiVersion < 1) return null;
    return api;
}

/** `1.11.0` or later: semver, compared part by part. */
function schemaAtLeast(api: DashyApi, wanted: string): boolean {
    const have = api.schemaVersion.split(".").map(Number);
    const need = wanted.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        const a = have[i] ?? 0;
        const b = need[i] ?? 0;
        if (a !== b) return a > b;
    }
    return true;
}

const api = dashyApi(this.app);
if (api && schemaAtLeast(api, "1.11.0")) {
    const blocks = await api.check(text, "Garmin/2026-W45.md");
    const errors = blocks.filter((b) => b.status === "unknown" || b.findings.some((f) => f.level === "error"));
}
```

## Shape

Copy these types into your plugin. They are the ones in
[`src/app/api.ts`](https://github.com/Dimagious/dashsidian/blob/master/src/app/api.ts).

```ts
interface DashyApi {
    /** an integer, raised only by a breaking change */
    readonly apiVersion: number;
    /** the Dashy plugin version: `2.2.0` */
    readonly version: string;
    /** the block schema version: `1.11.0` */
    readonly schemaVersion: string;
    /** the code block names Dashy draws in this vault right now */
    fences(): string[];
    /** checks every Dashy block in a note's text */
    check(text: string, sourcePath: string): Promise<DashyCheckedBlock[]>;
}

interface DashyCheckedBlock {
    /** 1-based line of the opening fence in the text */
    line: number;
    /** the fence name: `stats`, `dashy-chart`, ... */
    lang: string;
    /** `checked`: drawn and read back; `elsewhere`: another plugin draws it; `unknown`: a `dashy-` name Dashy does not have */
    status: "checked" | "elsewhere" | "unknown";
    /** for `elsewhere`, the id of the plugin that draws it, when known */
    owner?: string;
    findings: DashyFinding[];
}

interface DashyFinding {
    level: "error" | "warning" | "notice";
    /** the text the user sees in the block, in the language Dashy speaks in this vault; English when the block crashed */
    message: string;
    /** 1-based line inside the block (the line after the opening fence is 1), when the block named one */
    line?: number;
}
```

### `fences()`

The names Dashy draws in this vault. `dashy-chart` is always there. `chart`
is missing when Obsidian Charts is on, because then that plugin draws it:
write `dashy-chart` if you want a Dashy chart everywhere.

### `check(text, sourcePath)`

Finds every fenced code block in `text` whose name is Dashy's, draws each one
off screen against the vault as it is, and returns what the block reported.
Nothing is written to the note or the vault.

- **It waits for Obsidian to finish indexing first.** If you have just
  written the notes a block reads, call `check` after writing them: it
  resolves once Obsidian has read their properties and reads the vault
  afresh, so you do not get "missing field" reports for data that is
  already there.
- `sourcePath` is the path the note lives at, or will live at. It matters
  for `period: note` and `range: note`, which read the window from the note's
  name, and for notes in a template folder.
- Code blocks of other languages are not returned. A `chart` block drawn by
  Obsidian Charts comes back as `elsewhere` with no findings. A `dashy-` name
  Dashy does not have comes back as `unknown` with no findings: nothing will
  draw it, so count it as an error.
- An empty `findings` on a `checked` block means the block is fine.
- In a rare race Obsidian starts indexing again between the wait and the
  draw. The block then reports one `notice` that Obsidian is still indexing
  and nothing else: it was not checked. Call `check` again.
- `message` is the text the user would see, in the language Dashy speaks in
  this vault. The one exception is a block that crashed while drawing: its
  error is an English line starting `The block failed to draw:`. There are
  no stable codes yet: show the message, do not parse it.
- A broken block is a finding, never a rejection. The promise rejects only
  when the check itself could not run (Dashy unloaded, arguments that are
  not strings), with an `Error` that says why.

There is no `render` in this version.

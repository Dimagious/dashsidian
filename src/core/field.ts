/**
 * Reading a frontmatter value by a user-written key, dotted paths included.
 *
 * `field: health.sleep` is meant to reach into
 * ```yaml
 * health:
 *   sleep: 82
 * ```
 * but YAML also allows a literal key with a dot in it, and 1.3.0 users may
 * already have `health.sleep: 82` written flat at the top level. Resolution
 * order settles that: the literal key as written wins first; only when that
 * own property does not exist does the path get split on `.` and walked
 * through nested plain objects.
 *
 * Every step reads an own property only, never `in` or a bare index: `"toString"
 * in {}` and `({}).constructor` both resolve through the prototype chain, so a
 * path ending in `constructor`, `__proto__` or any other inherited name has to
 * come back as absent rather than reaching into `Object.prototype`. Arrays are
 * never indexed — `runs.0` finds nothing, because `field:` documents plain
 * nested objects, not lists — and a path that meets anything else non-object
 * partway (a number, a string, null) resolves to nothing rather than throwing.
 * An empty segment, from a leading, trailing or doubled dot, also resolves to
 * nothing unless the literal key with the dot in it exists.
 *
 * Pure module: no Obsidian, no DOM.
 */

const NOT_FOUND: unique symbol = Symbol("field-not-found");

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolve(frontmatter: Record<string, unknown>, path: string): unknown {
    if (Object.prototype.hasOwnProperty.call(frontmatter, path)) return frontmatter[path];

    const segments = path.split(".");
    // A bare, undotted key that is not a literal own property has nothing
    // left to walk — this is also what keeps a plain `field: constructor`
    // from ever consulting the prototype chain below.
    if (segments.length < 2 || segments.some((segment) => segment.length === 0)) return NOT_FOUND;

    let cursor: unknown = frontmatter;
    for (const segment of segments) {
        if (!isPlainObject(cursor) || !Object.prototype.hasOwnProperty.call(cursor, segment)) return NOT_FOUND;
        cursor = cursor[segment];
    }
    return cursor;
}

/** Whether `path` resolves to anything at all — `false` and `0` count as present. */
export function hasField(frontmatter: Record<string, unknown>, path: string): boolean {
    return resolve(frontmatter, path) !== NOT_FOUND;
}

/** The value `path` resolves to, or `undefined` when it resolves to nothing. */
export function readField(frontmatter: Record<string, unknown>, path: string): unknown {
    const value = resolve(frontmatter, path);
    return value === NOT_FOUND ? undefined : value;
}

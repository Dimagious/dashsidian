import { describe, it, expect } from "vitest";
import { normalizeFolder, notePath, resolveConfig, readToday, DEFAULT_FORMATS } from "./periodic";

describe("normalizeFolder", () => {
    it("strips leading and trailing slashes", () => {
        expect(normalizeFolder("/Diary/")).toBe("Diary");
        expect(normalizeFolder("//a/b//")).toBe("a/b");
    });

    it("the vault root is an empty string", () => {
        for (const v of ["", "   ", "/", "///"]) expect(normalizeFolder(v)).toBe("");
    });

    it("leaves inner slashes alone", () => {
        expect(normalizeFolder("01-Areas/Personal/Diary")).toBe("01-Areas/Personal/Diary");
    });
});

describe("notePath", () => {
    it("joins the folder and the name", () => {
        expect(notePath("Diary", "2026-09-22")).toBe("Diary/2026-09-22.md");
    });

    it("with no folder it lands in the root", () => {
        expect(notePath("", "2026-09-22")).toBe("2026-09-22.md");
    });

    it("a messy folder is normalised instead of doubling the slash", () => {
        expect(notePath("/Diary/", "2026-09-22")).toBe("Diary/2026-09-22.md");
    });

    it("a name carrying subfolders from the format survives", () => {
        // a format like `YYYY/MM/YYYY-MM-DD` is a legal Periodic Notes setting
        expect(notePath("Diary", "2026/09/2026-09-22")).toBe("Diary/2026/09/2026-09-22.md");
    });
});

describe("resolveConfig", () => {
    it("the Dashy setting wins over what a neighbour reports", () => {
        const cfg = resolveConfig("daily", "My diary", { folder: "Periodic/Daily", format: "DD-MM-YYYY" });
        expect(cfg.folder).toBe("My diary");
        // the format still comes from the neighbour: Dashy settings hold no formats
        expect(cfg.format).toBe("DD-MM-YYYY");
    });

    it("an empty setting yields to the neighbour", () => {
        expect(resolveConfig("daily", "", { folder: "Periodic/Daily", format: "DD-MM-YYYY" }))
            .toEqual({ folder: "Periodic/Daily", format: "DD-MM-YYYY" });
    });

    it("spaces in the setting mean an empty setting", () => {
        expect(resolveConfig("daily", "   ", { folder: "Periodic" }).folder).toBe("Periodic");
    });

    it("no neighbour — the default format for the period", () => {
        expect(resolveConfig("daily", "", undefined).format).toBe(DEFAULT_FORMATS.daily);
        expect(resolveConfig("weekly", "", undefined).format).toBe(DEFAULT_FORMATS.weekly);
        expect(resolveConfig("monthly", "", undefined).format).toBe(DEFAULT_FORMATS.monthly);
    });

    it("nothing known — the vault root", () => {
        expect(resolveConfig("daily", "", {}).folder).toBe("");
    });

    it("a blank format from a neighbour does not wipe the default", () => {
        expect(resolveConfig("weekly", "", { folder: "W", format: "  " }).format)
            .toBe(DEFAULT_FORMATS.weekly);
    });
});

describe("readToday", () => {
    it("no keys at all — we show the daily note", () => {
        expect(readToday({}).spec?.periods).toEqual(["daily"]);
        expect(readToday({ title: "Today" }).spec?.periods).toEqual(["daily"]);
    });

    it("a given key cancels the default", () => {
        expect(readToday({ weekly: true }).spec?.periods).toEqual(["weekly"]);
    });

    it("the order is always day, week, month, however it was written", () => {
        const spec = readToday({ monthly: true, daily: true, weekly: true }).spec;
        expect(spec?.periods).toEqual(["daily", "weekly", "monthly"]);
    });

    it("false excludes the period", () => {
        expect(readToday({ daily: true, weekly: false }).spec?.periods).toEqual(["daily"]);
    });

    it("takes a custom heading", () => {
        expect(readToday({ title: "  My day  " }).spec?.title).toBe("My day");
    });

    it("a blank heading does not reach the spec", () => {
        expect(readToday({ title: "   " }).spec?.title).toBeUndefined();
    });

    it("everything off is an error, not an empty row", () => {
        const { spec, diagnostics } = readToday({ daily: false, weekly: false, monthly: false });
        expect(spec).toBeNull();
        expect(diagnostics[0]?.level).toBe("error");
    });

    it("a non-boolean warns, but the block is still drawn", () => {
        const { spec, diagnostics } = readToday({ daily: "yes" });
        expect(spec?.periods).toEqual(["daily"]);
        expect(diagnostics[0]?.level).toBe("warning");
    });

    it("a string negation reads as false", () => {
        for (const v of ["false", "no", "0", "off", "FALSE", "Off"]) {
            expect(readToday({ daily: v, weekly: true }).spec?.periods).toEqual(["weekly"]);
        }
    });

    it("a null value switches the period off", () => {
        const { spec } = readToday({ daily: null, weekly: true });
        expect(spec?.periods).toEqual(["weekly"]);
    });

    it("clock is read into the spec and does not count as a period", () => {
        expect(readToday({ clock: true }).spec).toEqual({ periods: ["daily"], clock: "minutes" });
        expect(readToday({ clock: "seconds", weekly: true }).spec).toEqual({ periods: ["weekly"], clock: "seconds" });
    });

    it("no clock key or clock: false leaves the spec without one", () => {
        expect(readToday({}).spec).toEqual({ periods: ["daily"] });
        expect(readToday({ clock: false }).spec).toEqual({ periods: ["daily"] });
    });

    it("a clock it cannot read warns and the rest of the block stays", () => {
        const { spec, diagnostics } = readToday({ clock: "hours", weekly: true });
        expect(spec).toEqual({ periods: ["weekly"] });
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("warning");
        expect(diagnostics[0]?.message).toContain('"hours"');
    });

    it("a bad clock is still reported when nothing else is enabled", () => {
        const { spec, diagnostics } = readToday({ clock: 5, daily: false });
        expect(spec).toBeNull();
        expect(diagnostics.map((d) => d.level)).toEqual(["warning", "error"]);
    });
});

describe("readToday: `date: note` and `nav` (B-210)", () => {
    it("`date: note`, in any case, is the note's day, with the day before and after on", () => {
        expect(readToday({ date: "note" }).spec).toEqual({ periods: ["daily"], noteDate: true, nav: true });
        expect(readToday({ date: " Note ", weekly: true }).spec).toEqual({ periods: ["weekly"], noteDate: true, nav: true });
        expect(readToday({ date: "note" }).diagnostics).toEqual([]);
    });

    it("`nav: false` turns the day before and after off; a string negation does too, with a warning", () => {
        expect(readToday({ date: "note", nav: false }).spec?.nav).toBe(false);
        const { spec, diagnostics } = readToday({ date: "note", nav: "no" });
        expect(spec?.nav).toBe(false);
        expect(diagnostics.map((d) => d.message)).toEqual(['`nav` expects true or false, got "no". Reading it as false.']);
    });

    it("any other `date` warns and shows today", () => {
        for (const date of ["today", "2026-11-09", 5]) {
            const { spec, diagnostics } = readToday({ date });
            expect(spec, String(date)).toEqual({ periods: ["daily"] });
            expect(diagnostics.map((d) => d.level)).toEqual(["warning"]);
            expect(diagnostics[0]?.message).toBe(
                `\`date\` takes only \`note\`, the day of the note this block sits in, got "${String(date)}". Showing today.`,
            );
        }
    });

    it("a clock with `date: note` warns and is left out; `clock: false` is quiet", () => {
        const { spec, diagnostics } = readToday({ date: "note", clock: "seconds" });
        expect(spec).toEqual({ periods: ["daily"], noteDate: true, nav: true });
        expect(diagnostics.map((d) => d.message)).toEqual([
            "`clock` is not shown with `date: note`: the time now means nothing in a note about one day. Remove `clock`.",
        ]);
        expect(readToday({ date: "note", clock: false }).diagnostics).toEqual([]);
    });

    it("`nav` without `date: note` warns and is ignored", () => {
        const { spec, diagnostics } = readToday({ nav: true });
        expect(spec).toEqual({ periods: ["daily"] });
        expect(diagnostics.map((d) => d.message)).toEqual(["`nav` works only with `date: note`, ignored."]);
    });
});

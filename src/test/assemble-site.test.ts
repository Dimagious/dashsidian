import { describe, it, expect, afterEach } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Same boundary as site-check.test.ts: a plain CommonJS deploy script,
// loaded with `require`, run against a throwaway tree in the OS temp folder.
const require = createRequire(import.meta.url);

interface Manifest {
    version: string;
    minAppVersion: string;
}

interface AssembleModule {
    assemble: (root: string) => string;
    assemblePage: (html: string, shell: string | null, pagePath: string, manifest: Manifest) => string;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { assemble, assemblePage } = require("../../scripts/assemble-site.cjs") as AssembleModule;

const manifest: Manifest = { version: "9.8.7", minAppVersion: "1.13.0" };
const shell = `<nav><a href="{{root}}" class="{{active:guides/x/}}">{{tab}}</a></nav>
<!--shell:content-->
<script src="{{root}}assets/site.js"></script>`;
const guide = `<body><!--shell:top tab="X"--><p>Dashy {{version}}</p><!--shell:bottom--></body>`;

describe("assemble-site — assemblePage", () => {
    it("fills the shell first, then the version placeholders", () => {
        const out = assemblePage(guide, shell, "guides/x/index.html", manifest);
        expect(out).toBe(
            `<body><nav><a href="../../" class="active">X</a></nav>\n<p>Dashy 9.8.7</p>\n<script src="../../assets/site.js"></script></body>`
        );
    });

    it("fills version placeholders on a page without the shell", () => {
        expect(assemblePage("<p>{{version}} / {{minAppVersion}}</p>", null, "index.html", manifest)).toBe("<p>9.8.7 / 1.13.0</p>");
    });

    it("leaves other double-brace text alone, such as a Tracker template", () => {
        expect(assemblePage("<code>{{sum()}}</code>", null, "index.html", manifest)).toBe("<code>{{sum()}}</code>");
    });

    it("throws instead of deploying a page whose shell cannot be filled", () => {
        expect(() => assemblePage(guide, null, "guides/x/index.html", manifest)).toThrow(/_shell\.html does not exist/);
    });
});

describe("assemble-site — assemble", () => {
    let root = "";
    afterEach(() => {
        if (root) fs.rmSync(root, { recursive: true, force: true });
        root = "";
    });

    function write(rel: string, content: string): void {
        const full = path.join(root, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
    }

    it("fills every page, drops the shell source and copies the screenshots", () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "dashy-assemble-"));
        write("manifest.json", JSON.stringify(manifest));
        write("site/index.html", "<p>{{version}}, Obsidian {{minAppVersion}}</p>");
        write("site/_shell.html", shell);
        write("site/guides/x/index.html", guide);
        write("site/assets/site.js", "/* js */");
        write("docs/screens/habits-light.png", "png");
        write("docs/screens/firstrun/1-picker.png", "png");

        const out = assemble(root);
        const read = (rel: string) => fs.readFileSync(path.join(out, rel), "utf8");

        expect(read("index.html")).toBe("<p>9.8.7, Obsidian 1.13.0</p>");
        expect(read("guides/x/index.html")).toContain('<a href="../../" class="active">X</a>');
        expect(read("guides/x/index.html")).toContain("<p>Dashy 9.8.7</p>");
        expect(fs.existsSync(path.join(out, "_shell.html"))).toBe(false);
        expect(read("assets/site.js")).toBe("/* js */");
        expect(fs.existsSync(path.join(out, "img", "habits-light.png"))).toBe(true);
        expect(fs.existsSync(path.join(out, "img", "firstrun-picker.png"))).toBe(true);
    });
});

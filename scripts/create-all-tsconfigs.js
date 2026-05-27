#!/usr/bin/env node
// Regenerates the `compilerOptions.paths` (and a test-file exclude) in every
// TypeScript package's tsconfig.json so that `tsc -b` can resolve the
// cross-package `magda-*/src/*` import convention.
//
// Background: these packages import sibling packages via paths like
// `magda-typescript-common/src/foo.js`, which the `_moduleMappings` field maps
// to the built output `@magda/typescript-common/dist`. At build time tsc needs
// `compilerOptions.paths` pointing at the dependency's built `dist` for those
// imports to resolve. This script derives those paths from `_moduleMappings`.
// Tests are excluded from the build (they are run via tsx/mocha, not shipped).
import fs from "node:fs";
import path from "node:path";
import { getCurrentDirPath } from "@magda/esm-utils";

const repoRoot = path.dirname(getCurrentDirPath());

const packageDirs = [
    ...fs
        .readdirSync(repoRoot)
        .filter((name) => name.startsWith("magda-"))
        .map((name) => path.join(repoRoot, name)),
    ...(fs.existsSync(path.join(repoRoot, "packages"))
        ? fs
              .readdirSync(path.join(repoRoot, "packages"))
              .map((name) => path.join(repoRoot, "packages", name))
        : [])
];

const TEST_EXCLUDES = ["src/test/**/*", "src/**/*.spec.ts", "src/**/*.test.ts"];

let updated = 0;
for (const pkgDir of packageDirs) {
    const pkgJsonPath = path.join(pkgDir, "package.json");
    const tsconfigPath = path.join(pkgDir, "tsconfig.json");
    if (!fs.existsSync(pkgJsonPath) || !fs.existsSync(tsconfigPath)) {
        continue;
    }
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    const moduleMappings = pkgJson._moduleMappings;
    if (!moduleMappings || !Object.keys(moduleMappings).length) {
        continue;
    }

    const paths = {};
    for (const [srcPrefix, distTarget] of Object.entries(moduleMappings)) {
        // distTarget looks like "@magda/typescript-common/dist"
        const parts = distTarget.split("/");
        const scoped = parts.slice(0, 2).join("/"); // "@magda/typescript-common"
        const subPath = parts.slice(2).join("/"); // "dist"
        // Resolve the dependency's real directory via its node_modules symlink.
        const realDepDir = fs.realpathSync(
            path.join(repoRoot, "node_modules", scoped)
        );
        const targetAbs = path.join(realDepDir, subPath);
        let rel = path.relative(pkgDir, targetAbs).split(path.sep).join("/");
        if (!rel.startsWith(".")) {
            rel = "./" + rel;
        }
        paths[`${srcPrefix}/*`] = [`${rel}/*`];
    }

    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));
    tsconfig.compilerOptions = tsconfig.compilerOptions || {};
    tsconfig.compilerOptions.baseUrl = ".";
    tsconfig.compilerOptions.paths = paths;
    // Build only ships runtime code; tests are type-checked/run via tsx + mocha.
    tsconfig.exclude = Array.from(
        new Set([...(tsconfig.exclude || []), ...TEST_EXCLUDES])
    );

    fs.writeFileSync(
        tsconfigPath,
        JSON.stringify(tsconfig, undefined, 4) + "\n"
    );
    console.log(
        `${path.relative(repoRoot, pkgDir)}: paths -> ${JSON.stringify(paths)}`
    );
    updated++;
}

console.log(`\nUpdated ${updated} tsconfig.json files.`);

/**
 * @jest-environment node
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Client components must never pull a server-only module into the browser
// bundle. Next.js enforces this at build time through `server-only`; this test
// catches it earlier and also covers `*.server.ts` files. Imports are followed
// transitively, so a client file cannot reach a server module through a
// shared helper either. `import type` (and imports whose specifiers are all
// `type`) are erased at compile time and therefore allowed.

const ROOT = path.resolve(__dirname, "../..");
const SOURCE_DIRECTORIES = ["app", "components", "hooks", "lib"];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"];

const DIRECTIVE = /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use (client|server)["']/;
const IMPORT_STATEMENT =
  /^\s*(import|export)\s+(type\s+)?([^;"'()=]*?)\s*from\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']/gm;

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) return listSourceFiles(fullPath);
    return SOURCE_EXTENSIONS.includes(path.extname(entry)) ? [fullPath] : [];
  });
}

function directive(source: string) {
  return source.match(DIRECTIVE)?.[1] ?? null;
}

function isTypeOnlyClause(clause: string) {
  const named = clause.match(/^\{([\s\S]*)\}$/);
  if (!named) return false;
  const specifiers = named[1].split(",").map((part) => part.trim()).filter(Boolean);
  return specifiers.length > 0 && specifiers.every((part) => part.startsWith("type "));
}

function runtimeImports(source: string) {
  const specifiers: string[] = [];
  for (const match of source.matchAll(IMPORT_STATEMENT)) {
    const [, , typeKeyword, clause, fromSpecifier, sideEffectSpecifier] = match;
    if (sideEffectSpecifier) {
      specifiers.push(sideEffectSpecifier);
      continue;
    }
    if (typeKeyword || isTypeOnlyClause(clause.trim())) continue;
    specifiers.push(fromSpecifier);
  }
  for (const match of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

function resolveLocal(specifier: string, importer: string) {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(importer), specifier);
  else return null;

  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
  ];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

const sourceCache = new Map<string, string>();
function read(file: string) {
  let source = sourceCache.get(file);
  if (source === undefined) {
    source = readFileSync(file, "utf8");
    sourceCache.set(file, source);
  }
  return source;
}

function isServerOnlyModule(file: string) {
  if (/\.server\.[cm]?[jt]sx?$/.test(file)) return true;
  return runtimeImports(read(file)).includes("server-only");
}

/** Returns the import chain from `entry` to the first server-only module, if any. */
function findServerChain(entry: string): string[] | null {
  const visited = new Set<string>([entry]);
  const queue: string[][] = [[entry]];
  while (queue.length > 0) {
    const chain = queue.shift()!;
    const current = chain[chain.length - 1];
    for (const specifier of runtimeImports(read(current))) {
      const resolved = resolveLocal(specifier, current);
      if (!resolved || visited.has(resolved)) continue;
      visited.add(resolved);
      const nextChain = [...chain, resolved];
      if (isServerOnlyModule(resolved)) return nextChain;
      // Server Actions are called over the network from client code; their
      // own imports never reach the browser bundle.
      if (directive(read(resolved)) === "server") continue;
      queue.push(nextChain);
    }
  }
  return null;
}

const relative = (file: string) => path.relative(ROOT, file);

const clientFiles = SOURCE_DIRECTORIES
  .flatMap((directory) => listSourceFiles(path.join(ROOT, directory)))
  .filter((file) => directive(read(file)) === "client");

describe("server/client module boundary", () => {
  it("finds the client components to check", () => {
    expect(clientFiles.length).toBeGreaterThan(10);
  });

  it.each(clientFiles.map((file) => [relative(file), file]))(
    "%s does not import server-only code",
    (_name, file) => {
      const chain = findServerChain(file);
      expect(chain?.map(relative) ?? null).toBeNull();
    },
  );

  it("detects server modules by suffix and by the server-only import", () => {
    expect(isServerOnlyModule(path.join(ROOT, "lib/contact/social-links.server.ts"))).toBe(true);
    expect(isServerOnlyModule(path.join(ROOT, "lib/contact/mailer.ts"))).toBe(true);
    expect(isServerOnlyModule(path.join(ROOT, "lib/backend/supabaseClient.ts"))).toBe(true);
    expect(isServerOnlyModule(path.join(ROOT, "lib/contact/social-links.ts"))).toBe(false);
  });

  it("ignores type-only imports but not value imports", () => {
    expect(runtimeImports([
      'import type { A } from "@/lib/a.server";',
      'import { type B, type C } from "@/lib/b.server";',
      'import { type D, e } from "@/lib/c.server";',
      'import f from "./f";',
      'import "server-only";',
      'export { g } from "./g";',
      'export type { H } from "./h";',
    ].join("\n"))).toEqual(["@/lib/c.server", "./f", "server-only", "./g"]);
  });
});

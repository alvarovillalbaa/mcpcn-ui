import { createHash } from "node:crypto";
import { lstat, mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blockCatalog, catalog } from "@mcpcn/registry/catalog";
import { defaultConfig, renderProvider } from "@mcpcn/registry/installation";
import { buildSourceRegistry, sourceModulePaths } from "@mcpcn/registry/source-registry";
import type { RegistryFile, RegistryItem } from "@mcpcn/registry";
import { runCLI } from "./installer.js";

const ITEM = "offline-state";
const PREFIX = "components/mcpcn/";
const REGISTRY = "https://registry.example/host-state-items";
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
type FixtureLock = { items: Record<string, { files: string[] }>; files: Record<string, { hash: string; source: string }> };
type Snapshot = { path: string; kind: "file" | "directory"; mode: number; bytes?: number; sha256?: string };

// The real registry builder supplies the current closure and paths. Small authored
// module bodies exercise installation, not component compilation or rendering.
async function authoredRegistry(): Promise<Map<string, RegistryItem>> {
  const built = await buildSourceRegistry({
    catalog, blockCatalog, providerSource: renderProvider(defaultConfig),
    readSource: async path => path === "LICENSE" ? "Authored MIT installation fixture.\n"
      : path.endsWith(".css") ? ".mcpcn-authored-fixture { color: inherit; }\n"
        : "export const authoredInstallationFixture = true;\n",
  });
  return new Map(built.items.map(item => [item.name, item]));
}

async function snapshot(root: string, relative = ""): Promise<Snapshot[]> {
  const rows: Snapshot[] = [];
  for (const name of (await readdir(join(root, relative))).sort()) {
    const path = relative ? relative + "/" + name : name;
    const info = await lstat(join(root, path));
    if (info.isSymbolicLink()) throw new Error("authored_project_symlink_refused");
    if (info.isDirectory()) {
      rows.push({ path, kind: "directory", mode: info.mode });
      rows.push(...await snapshot(root, path));
    } else {
      if (!info.isFile()) throw new Error("authored_project_regular_file_required");
      const bytes = await readFile(join(root, path));
      rows.push({ path, kind: "file", mode: info.mode, bytes: bytes.length, sha256: hash(bytes) });
    }
  }
  return rows;
}

async function withProject(body: (fixture: {
  cwd: string;
  payload: RegistryItem;
  requested: string[];
  invoke: (args: string[], change?: (item: RegistryItem) => RegistryItem) => Promise<{ code: number; errors: string[] }>;
}) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "mcpcn-host-state-install-")));
  const cwd = join(root, "project");
  await mkdir(cwd);
  try {
    await writeFile(join(cwd, "package.json"), json({ private: true, type: "module", dependencies: { react: "^19.2.0" } }));
    await writeFile(join(cwd, "tsconfig.json"), json({ compilerOptions: { jsx: "react-jsx" } }));
    await writeFile(join(cwd, "user-note.txt"), "Authored existing owner file; preserve exactly.\n");
    const items = await authoredRegistry(), payload = items.get(ITEM), requested: string[] = [];
    if (!payload) throw new Error("authored_current_block_required");
    const invoke = async (args: string[], change?: (item: RegistryItem) => RegistryItem) => {
      const errors: string[] = [];
      const fetcher: typeof globalThis.fetch = async input => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (!url.href.startsWith(REGISTRY + "/")) throw new Error("authored_registry_origin_required");
        const name = url.pathname.split("/").at(-1)?.replace(/\.json$/, ""), item = name ? items.get(name) : undefined;
        if (!item) throw new Error("authored_current_item_required");
        requested.push(item.name);
        const copy = structuredClone(item);
        return Response.json(item.name === ITEM && change ? change(copy) : copy);
      };
      const code = await runCLI(args, { cwd, fetch: fetcher, log: () => undefined, error: value => errors.push(value) });
      return { code, errors };
    };
    expect(await invoke(["init", "--mode=copy", `--registry=${REGISTRY}`])).toEqual({ code: 0, errors: [] });
    await body({ cwd, payload, requested, invoke });
  } finally { await rm(root, { recursive: true, force: true }); }
}

describe("reported host-state source installation", () => {
  it("HS-CLI06 installs the exact37-file current block without loosening path ownership", async () => withProject(async ({ cwd, invoke }) => {
    const name = "admin-change-review", payload = (await authoredRegistry()).get(name)!;
    expect(payload.files).toHaveLength(37);
    expect(await invoke(["add", name])).toEqual({ code: 0, errors: [] });
    const lock = JSON.parse(await readFile(join(cwd, "mcpcn.lock.json"), "utf8")) as FixtureLock;
    expect(lock.items[name]?.files).toHaveLength(37);
    expect(lock.items[name]?.files).toContain("components/mcpcn/_mcpcn/host-state-components.tsx");
    expect(await readFile(join(cwd, "user-note.txt"), "utf8")).toBe("Authored existing owner file; preserve exactly.\n");
  }));
  it("HS-CLI01 installs the current36-file component and reads its lock on an identical byte-stable add", async () => withProject(async ({ cwd, payload, invoke }) => {
    expect(sourceModulePaths).toHaveLength(32);
    expect(payload.files).toHaveLength(36);
    expect(await invoke(["add", ITEM])).toEqual({ code: 0, errors: [] });
    const lock = JSON.parse(await readFile(join(cwd, "mcpcn.lock.json"), "utf8")) as FixtureLock;
    const item = lock.items[ITEM]; if (!item) throw new Error("authored_installed_block_required");
    expect(item.files).toHaveLength(36);
    expect(new Set(item.files).size).toBe(36);
    const identities = new Map<string, { dev: number; ino: number }>();
    for (const file of payload.files) {
      const bytes = await readFile(join(cwd, file.path));
      const expected = file.path === PREFIX + "provider.tsx" ? renderProvider(JSON.parse(await readFile(join(cwd, "mcpcn.json"), "utf8"))) : file.content;
      expect(bytes.toString("utf8")).toBe(expected);
      expect(lock.files[file.path]?.hash).toBe(hash(bytes));
    }
    for (const path of Object.keys(lock.files)) {
      const info = await lstat(join(cwd, path)); identities.set(path, { dev: info.dev, ino: info.ino });
    }
    const before = await snapshot(cwd);
    expect(await invoke(["add", ITEM])).toEqual({ code: 0, errors: [] });
    // The existing transaction republishes the same lock bytes; source files
    // retain their identities and every project byte/mode remains unchanged.
    expect(await snapshot(cwd)).toEqual(before);
    for (const [path, identity] of identities) {
      const info = await lstat(join(cwd, path)); expect({ dev: info.dev, ino: info.ino }).toEqual(identity);
    }
  }));

  it("HS-CLI02 refuses a36-file payload before writing any source or manifest", async () => withProject(async ({ cwd, payload, requested, invoke }) => {
    expect(payload.files).toHaveLength(36);
    const extra: RegistryFile = { path: PREFIX + "skeleton.tsx", type: "registry:component", content: "export const AuthoredExtra = true;\n" };
    const before = await snapshot(cwd);
    const result = await invoke(["add", ITEM], item => ({ ...item, files: [...item.files, extra] }));
    expect(requested).toContain(ITEM);
    expect(result).toEqual({ code: 1, errors: ["mcpcn: registry_invalid"] });
    expect(await snapshot(cwd)).toEqual(before);
  }));

  it("HS-CLI03 refuses a36-file lock before transport and preserves all existing files", async () => withProject(async ({ cwd, invoke, requested }) => {
    expect(await invoke(["add", ITEM])).toEqual({ code: 0, errors: [] });
    const manifest = join(cwd, "mcpcn.lock.json"), lock = JSON.parse(await readFile(manifest, "utf8")) as FixtureLock;
    const item = lock.items[ITEM]; if (!item) throw new Error("authored_installed_block_required");
    const path = PREFIX + "skeleton.tsx", content = Buffer.from("export const AuthoredExistingExtra = true;\n");
    await writeFile(join(cwd, path), content, { flag: "wx" });
    lock.files[path] = { hash: hash(content), source: REGISTRY + "/skeleton.json" };
    item.files.push(path);
    expect(item.files).toHaveLength(36); expect(new Set(item.files).size).toBe(36);
    await writeFile(manifest, json(lock));
    const before = await snapshot(cwd); requested.length = 0;
    expect(await invoke(["add", ITEM])).toEqual({ code: 1, errors: ["mcpcn: lock_invalid"] });
    expect(requested).toEqual([]);
    expect(await snapshot(cwd)).toEqual(before);
  }));

  it("HS-CLI04 refuses duplicate members in a36-file payload without writing", async () => withProject(async ({ cwd, payload, requested, invoke }) => {
    expect(payload.files).toHaveLength(36);
    const before = await snapshot(cwd);
    const result = await invoke(["add", ITEM], item => {
      const duplicate = item.files[0]; if (!duplicate) throw new Error("authored_entry_required");
      return { ...item, files: [duplicate, duplicate, ...item.files.slice(2)] };
    });
    expect(requested).toContain(ITEM);
    expect(result).toEqual({ code: 1, errors: ["mcpcn: registry_invalid"] });
    expect(await snapshot(cwd)).toEqual(before);
  }));

  it("HS-CLI05 refuses an unknown member in a36-file payload without writing", async () => withProject(async ({ cwd, payload, requested, invoke }) => {
    expect(payload.files).toHaveLength(36);
    const before = await snapshot(cwd);
    const unknown: RegistryFile = { path: PREFIX + "_mcpcn/unowned.ts", type: "registry:lib", content: "export const AuthoredUnowned = true;\n" };
    const result = await invoke(["add", ITEM], item => ({ ...item, files: [...item.files.slice(0, -1), unknown] }));
    expect(requested).toContain(ITEM);
    expect(result).toEqual({ code: 1, errors: ["mcpcn: path_not_allowed"] });
    expect(await snapshot(cwd)).toEqual(before);
  }));
});

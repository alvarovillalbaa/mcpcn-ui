import { mkdtemp, readFile, writeFile, rm, readdir, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { blockCatalog, catalog } from "@mcpcn/registry/catalog";
import { buildSourceRegistry } from "@mcpcn/registry/source-registry";
import { defaultConfig, renderProvider } from "@mcpcn/registry/installation";
import type { RegistryItem } from "@mcpcn/registry";
import { runCLI } from "./installer.js";
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
async function project(mode: "copy" | "package", body: (p: { cwd: string; invoke(args: string[], mutate?: (item: RegistryItem) => void): Promise<{code:number;errors:string[]}> }) => Promise<void>) {
  const cwd = await mkdtemp(join(tmpdir(), "mcpcn-block-install-"));
  try {
    await writeFile(join(cwd, "package.json"), json({ private: true, type: "commonjs" })); await writeFile(join(cwd, "tsconfig.json"), json({ compilerOptions: { jsx: "react-jsx" } }));
    await writeFile(join(cwd, "owner-note.txt"), "Keep this exact authored owner note.\n");
    const { items } = await buildSourceRegistry({ catalog, blockCatalog, providerSource: renderProvider(defaultConfig),
      readSource: path => readFile(new URL("../../../" + path, import.meta.url), "utf8") });
    const invoke = async (args: string[], mutate?: (item: RegistryItem) => void) => {
      const errors: string[] = []; const fetcher: typeof fetch = async input => {
        const slug = new URL(String(input)).pathname.split("/").at(-1)!.replace(/\.json$/, ""), item = structuredClone(items.find(item => item.name === slug)!);
        mutate?.(item); return Response.json(item);
      };
      return { code: await runCLI(args, { cwd, fetch: fetcher, error: value => errors.push(value), log: () => undefined }), errors };
    };
    expect(await invoke(["init", "--mode=" + mode, "--registry=https://registry.example/blocks"])).toEqual({ code: 0, errors: [] }); await body({ cwd, invoke });
    expect(await readFile(join(cwd, "owner-note.txt"), "utf8")).toBe("Keep this exact authored owner note.\n");
  } finally { await rm(cwd, { recursive: true, force: true }); }
}
describe("BR-CLI: block source ownership", () => {
  it("BR-CLI01 all eleven copied blocks deduplicate into 171 exact editable paths", async () => project("copy", async ({cwd,invoke}) => {
    expect(await invoke(["add", ...blockCatalog.map(block => block.name), ...catalog.map(item => item.slug)])).toEqual({ code: 0, errors: [] });
    const lock = JSON.parse(await readFile(join(cwd, "mcpcn.lock.json"), "utf8")); expect(Object.keys(lock.files)).toHaveLength(171);
    for (const block of blockCatalog) expect(lock.items[block.name].files).toHaveLength(53);
    for (const [path, entry] of Object.entries(lock.files) as Array<[string,{hash:string}]>) expect(createHash("sha256").update(await readFile(join(cwd,path))).digest("hex")).toBe(entry.hash);
    expect(await invoke(["add", "review-before-action"])).toEqual({ code: 0, errors: [] });
  }));
  it("BR-CLI02 package mode writes six explicit entries without fetching or installing", async () => project("package", async ({cwd,invoke}) => {
    expect(await invoke(["add", "collect-missing-data"], () => { throw new Error("must_not_fetch"); })).toEqual({ code: 0, errors: [] });
    const lock = JSON.parse(await readFile(join(cwd,"mcpcn.lock.json"),"utf8")); expect(lock.items["collect-missing-data"].files).toHaveLength(6);
    expect(await readFile(join(cwd,"components/mcpcn/blocks/collect-missing-data.server.mts"),"utf8")).toContain("@mcpcn/server/blocks");
    expect(await readFile(join(cwd,"components/mcpcn/blocks/collect-missing-data.tsx"),"utf8")).toContain("CollectMissingDataApp");
  }));
  it("BR-CLI03 a foreign block server file aborts before any source writes", async () => project("copy", async ({cwd,invoke}) => {
    const result = await invoke(["add", "review-before-action"], item => { if(item.name === "review-before-action") item.files.find(file => file.path.endsWith("/review-before-action.server.mts"))!.path = "components/mcpcn/blocks/admin-change-review.server.mts"; });
    expect(result.errors).toContain("mcpcn: path_not_allowed"); expect((await readdir(cwd)).sort()).toEqual(["mcpcn.json","owner-note.txt","package.json","tsconfig.json"]);
  }));
  it("BR-CLI04 a missing required fixture aborts before any source writes", async () => project("copy", async ({cwd,invoke}) => {
    const result = await invoke(["add", "review-before-action"], item => { if(item.name === "review-before-action") item.files = item.files.filter(file => !file.path.endsWith(".fixture.mts")); });
    expect(result.code).toBe(1); expect(await readdir(cwd)).not.toContain("components");
  }));
  it("BR-CLI05 edited server implementation is preserved and blocks reinstall", async () => project("copy", async ({cwd,invoke}) => {
    expect((await invoke(["add","review-before-action"])).code).toBe(0); const path = join(cwd,"components/mcpcn/_mcpcn/block-store.mts");
    const edited = (await readFile(path,"utf8")) + "\n// Owner-authored local edit.\n"; await writeFile(path,edited);
    expect((await invoke(["add","review-before-action"])).errors).toContain("mcpcn: file_conflict"); expect(await readFile(path,"utf8")).toBe(edited);
  }));
  it("BR-CLI06 a server parent symlink is refused without touching its target", async () => project("copy", async ({cwd,invoke}) => {
    const target = join(cwd,"owner-target"); await mkdir(target); await writeFile(join(target,"keep.txt"),"keep");
    await mkdir(join(cwd,"components/mcpcn"),{recursive:true}); await symlink(target,join(cwd,"components/mcpcn/blocks"));
    expect((await invoke(["add","review-before-action"])).errors).toContain("mcpcn: path_not_allowed"); expect(await readdir(target)).toEqual(["keep.txt"]);
  }));
});

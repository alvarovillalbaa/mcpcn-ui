import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const require = createRequire(new URL("../apps/playground/package.json", import.meta.url));
const { default: react } = await import(pathToFileURL(require.resolve("@vitejs/plugin-react")).href);
export default {
  root: fileURLToPath(new URL("../apps/playground/block-checks", import.meta.url)), base: "/block-assets/", publicDir: false, plugins: [react()],
  build: { outDir: fileURLToPath(new URL("./dist/block-browser", import.meta.url)), emptyOutDir: true, sourcemap: false,
    rolldownOptions: { input: Object.fromEntries(["host", "app"].map(name => [name, fileURLToPath(new URL("../apps/playground/block-checks/" + name + "/index.html", import.meta.url))])) } },
};

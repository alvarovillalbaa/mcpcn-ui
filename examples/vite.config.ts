import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const require = createRequire(new URL("../apps/playground/package.json", import.meta.url));
const { default: react } = await import(pathToFileURL(require.resolve("@vitejs/plugin-react")).href);
const workflows = ["hr-candidate-review", "document-extraction", "ecommerce-checkout-review", "admin-settings-change", "research-workflow"];
export default {
  root: fileURLToPath(new URL("./browser", import.meta.url)),
  base: "/reference-assets/", publicDir: false, plugins: [react()],
  build: { outDir: fileURLToPath(new URL("./dist/browser", import.meta.url)), emptyOutDir: true, sourcemap: false,
    rolldownOptions: { input: Object.fromEntries([...workflows.map(slug => [slug, fileURLToPath(new URL("./browser/" + slug + "/index.html", import.meta.url))]), ["host", fileURLToPath(new URL("./browser/host/index.html", import.meta.url))]]) } },
};

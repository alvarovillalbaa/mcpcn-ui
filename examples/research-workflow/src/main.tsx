import { createRoot } from "react-dom/client";
import { App } from "./app.js";
import "../../shared/src/reference.css";
const root = document.getElementById("root");
if (!root) throw new Error("reference_root_missing");
createRoot(root).render(<App />);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Simulator } from "./Simulator.js";
import "../style.css";

const element = document.getElementById("root");
if (!element) throw new Error("playground_root_missing");
const root = createRoot(element);
root.render(<StrictMode><Simulator /></StrictMode>);
window.addEventListener("pagehide", () => root.unmount(), { once: true });

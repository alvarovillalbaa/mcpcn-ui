#!/usr/bin/env node
import { runCLI } from "./installer.js";

process.exitCode = await runCLI(process.argv.slice(2));

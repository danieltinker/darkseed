#!/usr/bin/env node
// Boot api + dashboard concurrently. Prints prefixed logs from each.

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const procs = [
  { name: "api  ", color: "\x1b[36m", cmd: "pnpm", args: ["--filter", "@darkseed/api", "run", "dev"] },
  { name: "dash ", color: "\x1b[35m", cmd: "pnpm", args: ["--filter", "@darkseed/dashboard", "run", "dev"] },
];

const RESET = "\x1b[0m";
const children = [];

for (const p of procs) {
  const child = spawn(p.cmd, p.args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  const tag = `${p.color}[${p.name}]${RESET} `;
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      const lines = chunk.split(/\r?\n/);
      const last = lines.pop();
      for (const ln of lines) process.stdout.write(tag + ln + "\n");
      if (last) process.stdout.write(tag + last);
    });
  }
  child.on("exit", (code) => {
    console.log(`\n${tag}exited with code ${code}`);
    for (const other of children) if (other !== child) other.kill();
    process.exit(code ?? 0);
  });
}

const shutdown = () => {
  for (const c of children) c.kill();
  setTimeout(() => process.exit(0), 200);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

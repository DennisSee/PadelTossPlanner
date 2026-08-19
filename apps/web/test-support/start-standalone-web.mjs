import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const standaloneNext = path.join(standalone, ".next");
const standalonePublic = path.join(standalone, "public");
const standaloneStatic = path.join(standaloneNext, "static");

await rm(standalonePublic, { recursive: true, force: true });
await rm(standaloneStatic, { recursive: true, force: true });
await mkdir(standaloneNext, { recursive: true });
await cp(path.join(root, "public"), standalonePublic, { recursive: true });
await cp(path.join(root, ".next", "static"), standaloneStatic, { recursive: true });
await import(pathToFileURL(path.join(standalone, "server.js")).href);

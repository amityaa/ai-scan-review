import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const source = path.resolve("src", "public");
const target = path.resolve("dist", "src", "public");

if (existsSync(source)) {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}

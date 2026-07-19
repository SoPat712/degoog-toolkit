import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const repositoryRoots = ["engines", "plugins", "themes"];

async function collectFiles(directory, predicate) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith("._") || entry.name === ".DS_Store") continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(target, predicate)));
    } else if (predicate(target)) {
      files.push(target);
    }
  }
  return files;
}

function runNode(args, label) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

const allFiles = (
  await Promise.all(
    repositoryRoots.map((root) => collectFiles(root, () => true)),
  )
).flat();
const testFiles = allFiles
  .filter((file) => file.endsWith(".test.mjs"))
  .sort();
const sourceFiles = allFiles
  .filter(
    (file) =>
      /\.(?:js|mjs)$/.test(file) && !file.endsWith(".test.mjs"),
  )
  .sort();

if (!testFiles.length) throw new Error("No repository tests were discovered");

const isBun = typeof globalThis.Bun !== "undefined";

if (!isBun) {
  for (const file of sourceFiles) {
    runNode(["--check", file], `Syntax check for ${file}`);
  }
}

runNode(
  isBun ? ["test", ...testFiles] : ["--test", ...testFiles],
  "Repository test suite",
);

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET_FILE = path.join(ROOT_DIR, "project_structure.txt");

/**
 * @param {unknown} value
 * @returns {string}
 */
const toPosixPath = (value) => String(value || "").replace(/\\/g, "/");

/**
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
const comparePaths = (left, right) =>
  left.localeCompare(right, "en", { sensitivity: "base" });

/**
 * @param {string} cwd
 * @param {{ includeUntracked?: boolean }} [options]
 * @returns {string[]}
 */
const collectGitPaths = (cwd, { includeUntracked = false } = {}) => {
  const lsFilesArgs = includeUntracked
    ? ["ls-files", "--cached", "--others", "--exclude-standard"]
    : ["ls-files", "--cached"];
  const output = execFileSync(
    "git",
    lsFilesArgs,
    {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  return output
    .split(/\r?\n/)
    .map((line) => toPosixPath(line.trim()))
    .filter(Boolean)
    .filter((relativePath) => existsSync(path.join(cwd, relativePath)));
};

/**
 * @param {string} [cwd]
 * @param {{ includeUntracked?: boolean }} [options]
 * @returns {string}
 */
export const generateProjectStructureText = (
  cwd = ROOT_DIR,
  { includeUntracked = false } = {}
) => {
  const items = collectGitPaths(cwd, { includeUntracked });
  const uniqueSorted = Array.from(new Set(items)).sort(comparePaths);
  return `${uniqueSorted.join("\n")}\n`;
};

/**
 * @param {string} [targetFile]
 * @returns {string}
 */
export const readProjectStructureText = (targetFile = TARGET_FILE) => {
  if (!existsSync(targetFile)) return "";
  return readFileSync(targetFile, "utf8");
};

/**
 * @param {{ cwd?: string, targetFile?: string, includeUntracked?: boolean }} [options]
 * @returns {string}
 */
export const writeProjectStructureText = ({
  cwd = ROOT_DIR,
  targetFile = TARGET_FILE,
  includeUntracked = false,
} = {}) => {
  const generated = generateProjectStructureText(cwd, { includeUntracked });
  writeFileSync(targetFile, generated, "utf8");
  return generated;
};

/**
 * @param {{ cwd?: string, targetFile?: string, includeUntracked?: boolean }} [options]
 * @returns {{ inSync: boolean, generated: string, current: string }}
 */
export const checkProjectStructureText = ({
  cwd = ROOT_DIR,
  targetFile = TARGET_FILE,
  includeUntracked = false,
} = {}) => {
  const generated = generateProjectStructureText(cwd, { includeUntracked });
  const current = readProjectStructureText(targetFile);
  const inSync = generated === current;
  return { inSync, generated, current };
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Set(process.argv.slice(2));
  const checkOnly = args.has("--check");
  const includeUntracked = args.has("--include-untracked");

  if (checkOnly) {
    const result = checkProjectStructureText({ includeUntracked });
    if (result.inSync) {
      process.stdout.write("project_structure.txt is up to date.\n");
      process.exit(0);
    }
    process.stderr.write(
      "project_structure.txt is out of sync. Run: npm run docs:structure\n"
    );
    process.exit(1);
  }

  writeProjectStructureText({ includeUntracked });
  process.stdout.write("project_structure.txt regenerated.\n");
}

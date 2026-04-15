import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const packageLockPath = path.join(rootDir, "package-lock.json");
const nodeModulesDir = path.join(rootDir, "node_modules");

function installedPackagePath(packageName) {
  return path.join(nodeModulesDir, ...packageName.split("/"), "package.json");
}

async function readRequiredPackages() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  return [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {})
  ];
}

function npmInvocation() {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      prefixArgs: [process.env.npm_execpath]
    };
  }

  const bundledNpmCliPath = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(bundledNpmCliPath)) {
    return {
      command: process.execPath,
      prefixArgs: [bundledNpmCliPath]
    };
  }

  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    prefixArgs: []
  };
}

function runNpmInstall(action) {
  const { command, prefixArgs } = npmInvocation();
  const result = spawnSync(command, [...prefixArgs, action, "--no-audit", "--no-fund"], {
    cwd: rootDir,
    stdio: "inherit"
  });

  return result.status === 0;
}

export async function ensureProjectDependencies() {
  const requiredPackages = await readRequiredPackages();
  const missingPackages = requiredPackages.filter((packageName) => !existsSync(installedPackagePath(packageName)));

  if (missingPackages.length === 0) {
    return false;
  }

  console.log(
    `Dependances locales manquantes (${missingPackages.join(", ")}). Installation automatique en cours...`
  );

  const hasLockfile = existsSync(packageLockPath);
  const preferredAction = hasLockfile ? "ci" : "install";

  if (runNpmInstall(preferredAction)) {
    return true;
  }

  if (preferredAction === "ci") {
    console.warn("`npm ci` a echoue. Nouvelle tentative avec `npm install`...");
    if (runNpmInstall("install")) {
      return true;
    }
  }

  throw new Error("Impossible d'installer automatiquement les dependances du projet.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  await ensureProjectDependencies();
}

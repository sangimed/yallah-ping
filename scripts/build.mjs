import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const staticDir = path.join(rootDir, "static");

const entryPoints = {
  background: path.join(rootDir, "src/background/index.ts"),
  content: path.join(rootDir, "src/content/index.ts"),
  popup: path.join(rootDir, "src/popup/index.ts"),
  options: path.join(rootDir, "src/options/index.ts"),
  alert: path.join(rootDir, "src/alert/index.ts")
};

const sharedBuildOptions = {
  bundle: true,
  entryPoints,
  format: "iife",
  outdir: distDir,
  platform: "browser",
  target: ["chrome109", "firefox115"],
  sourcemap: true,
  logLevel: "info"
};

async function copyStaticFiles() {
  await mkdir(distDir, { recursive: true });
  await cp(staticDir, distDir, { recursive: true });
}

async function cleanDist() {
  await rm(distDir, { recursive: true, force: true });
}

async function runOneShot() {
  await cleanDist();
  await copyStaticFiles();
  await build(sharedBuildOptions);
  console.log("Build termine dans dist/");
}

async function runWatch() {
  await cleanDist();
  await copyStaticFiles();
  const buildContext = await context(sharedBuildOptions);
  await buildContext.watch();
  console.log("Mode watch actif. Ctrl+C pour quitter.");
}

const isWatchMode = process.argv.includes("--watch");

if (isWatchMode) {
  await runWatch();
} else {
  await runOneShot();
}

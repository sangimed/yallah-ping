import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const artifactsDir = path.join(rootDir, "artifacts");
const packageJsonPath = path.join(rootDir, "package.json");

const encoder = new TextEncoder();

async function runBuild() {
  const result = spawnSync(process.execPath, [path.join(rootDir, "scripts/build.mjs")], {
    cwd: rootDir,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function readDirectoryFiles(directory, baseDirectory = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = new Map();

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(baseDirectory, absolutePath).split(path.sep).join("/");

    if (entry.isDirectory()) {
      const nestedFiles = await readDirectoryFiles(absolutePath, baseDirectory);
      for (const [nestedPath, contents] of nestedFiles) {
        files.set(nestedPath, contents);
      }
      continue;
    }

    if (relativePath.endsWith(".map")) {
      continue;
    }

    files.set(relativePath, new Uint8Array(await readFile(absolutePath)));
  }

  return files;
}

function withManifest(files, manifestObject) {
  const nextFiles = new Map(files);
  nextFiles.set("manifest.json", encoder.encode(`${JSON.stringify(manifestObject, null, 2)}\n`));
  return nextFiles;
}

function makeZipBuffer(files, rootFolder) {
  const zipEntries = {};

  for (const [relativePath, contents] of files) {
    const entryPath = rootFolder ? `${rootFolder}/${relativePath}` : relativePath;
    zipEntries[entryPath] = contents;
  }

  return Buffer.from(zipSync(zipEntries, { level: 9 }));
}

function fileHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function writeArtifact(filename, contents) {
  const outputPath = path.join(artifactsDir, filename);
  await writeFile(outputPath, contents);
  return outputPath;
}

function chromiumInstallGuide(browserName) {
  return encoder.encode(
    [
      `Yallah Ping - installation ${browserName}`,
      "",
      "1. Decompressez ce fichier zip dans un dossier local.",
      `2. Ouvrez ${browserName === "Chrome" ? "chrome://extensions" : "edge://extensions"}.`,
      "3. Activez le mode developpeur.",
      "4. Cliquez sur 'Charger l'extension non empaquetee'.",
      "5. Selectionnez le dossier yallah-ping situe dans le dossier decompresse.",
      "",
      "Note : ce mode est pratique en interne, mais pour une installation vraiment simple",
      "chez des collegues non techniques, preferez une publication via le store du navigateur."
    ].join("\n")
  );
}

async function main() {
  await runBuild();
  await rm(artifactsDir, { recursive: true, force: true });
  await mkdir(artifactsDir, { recursive: true });

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const version = packageJson.version;

  const distFiles = await readDirectoryFiles(distDir);
  const manifest = JSON.parse(new TextDecoder().decode(distFiles.get("manifest.json")));

  const chromiumManifest = structuredClone(manifest);
  delete chromiumManifest.browser_specific_settings;

  const firefoxManifest = structuredClone(manifest);

  const chromeStoreFiles = withManifest(distFiles, chromiumManifest);
  const edgeStoreFiles = withManifest(distFiles, chromiumManifest);
  const firefoxUploadFiles = withManifest(distFiles, firefoxManifest);

  const chromeStoreZip = makeZipBuffer(chromeStoreFiles);
  const edgeStoreZip = makeZipBuffer(edgeStoreFiles);
  const firefoxUploadZip = makeZipBuffer(firefoxUploadFiles);

  const chromeUnpackedZip = makeZipBuffer(
    new Map([
      ...Array.from(chromeStoreFiles.entries()),
      ["INSTALL.txt", chromiumInstallGuide("Chrome")]
    ]),
    "yallah-ping"
  );

  const edgeUnpackedZip = makeZipBuffer(
    new Map([
      ...Array.from(edgeStoreFiles.entries()),
      ["INSTALL.txt", chromiumInstallGuide("Edge")]
    ]),
    "yallah-ping"
  );

  const artifacts = [
    {
      filename: `yallah-ping-chrome-webstore-v${version}.zip`,
      buffer: chromeStoreZip,
      purpose: "Upload Chrome Web Store / publication privee Workspace"
    },
    {
      filename: `yallah-ping-edge-addons-v${version}.zip`,
      buffer: edgeStoreZip,
      purpose: "Upload Microsoft Edge Add-ons"
    },
    {
      filename: `yallah-ping-firefox-upload-v${version}.zip`,
      buffer: firefoxUploadZip,
      purpose: "Upload a Mozilla pour signature"
    },
    {
      filename: `yallah-ping-chrome-unpacked-v${version}.zip`,
      buffer: chromeUnpackedZip,
      purpose: "Partage interne Chrome en mode developpeur"
    },
    {
      filename: `yallah-ping-edge-unpacked-v${version}.zip`,
      buffer: edgeUnpackedZip,
      purpose: "Partage interne Edge en mode developpeur"
    }
  ];

  const checksums = [];
  for (const artifact of artifacts) {
    await writeArtifact(artifact.filename, artifact.buffer);
    checksums.push(`${fileHash(artifact.buffer)}  ${artifact.filename}  # ${artifact.purpose}`);
  }

  await writeArtifact("checksums.txt", encoder.encode(`${checksums.join("\n")}\n`));

  console.log("\nArtefacts generes dans artifacts/:");
  for (const artifact of artifacts) {
    console.log(`- ${artifact.filename} (${artifact.purpose})`);
  }
  console.log("- checksums.txt");
}

await main();

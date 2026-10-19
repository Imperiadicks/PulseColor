import path from "node:path";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  formatDeliveryResult,
  notifyClient,
  readLocalModules,
} from "./addon-delivery.mjs";
import { createModuleBuilder } from "./module-build.mjs";
import { buildFamily } from "./build-family.mjs";
import { deliverFamily, readAddonFamily } from "./addon-family.mjs";

const scriptRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const rootDir = process.argv[2] ? path.resolve(process.argv[2]) : scriptRoot;
const buildRoot = path.join(rootDir, ".pulsesync-dev");
const ignored = new Set([
  "node_modules",
  ".git",
  ".pulsesync-dev",
  "dist",
  "target",
]);
const modules = createModuleBuilder(rootDir);
let stopping = false;
let busy = false;
let attempted = "";
let lastDeliveries = [];
let lastClientCheck = 0;
const lastMessages = new Map();
let retryAfter = 0;

async function sourceSignature() {
  const outputs = new Set(
    Object.values((await readLocalModules(rootDir)) ?? {}).map((ref) =>
      path.resolve(rootDir, ref.path),
    ),
  );
  const hash = createHash("sha256");
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) await visit(file);
      } else if (
        entry.isFile() &&
        !outputs.has(file) &&
        !entry.name.endsWith(".tsbuildinfo") &&
        !entry.name.endsWith(".log")
      ) {
        hash.update(path.relative(rootDir, file));
        hash.update(await fs.readFile(file));
      }
    }
  }
  await visit(rootDir);
  return hash.digest("hex");
}

function report(result) {
  const message = formatDeliveryResult(result);
  if (message !== lastMessages.get(result.directoryName)) console.log(message);
  lastMessages.set(result.directoryName, message);
}

async function tick() {
  if (busy || stopping || Date.now() < retryAfter) return;
  busy = true;
  let delivering = false;
  try {
    const signature = await sourceSignature();
    if (signature === attempted) {
      if (lastDeliveries.length && Date.now() - lastClientCheck >= 5000) {
        lastClientCheck = Date.now();
        for (const result of lastDeliveries)
          report({
            ...result,
            client:
              result.type !== "web-addon"
                ? result.client
                : await notifyClient(result.directoryName),
          });
      }
      return;
    }
    attempted = signature;
    const configs = await readAddonFamily(rootDir, signature);
    for (const config of configs) {
      const name = String(config.directoryName ?? "");
      if (!name || name === "." || name === ".." || /[\\/:]/.test(name))
        throw new Error("Invalid addon directoryName");
    }
    if (
      lastDeliveries.length &&
      configs.map((config) => config.directoryName).join("|") !==
        lastDeliveries.map((result) => result.directoryName).join("|")
    )
      throw new Error(
        "directoryName changed. Stop dev before changing addon identities.",
      );
    await modules.update({ force: true, strict: true });
    if (stopping || !modules.ready) return;
    await buildFamily(rootDir, { mode: "development", outputRoot: buildRoot });
    if (stopping || !modules.ready || (await sourceSignature()) !== signature)
      return;
    delivering = true;
    lastDeliveries = await deliverFamily(buildRoot, configs, rootDir);
    lastClientCheck = Date.now();
    for (const result of lastDeliveries) report(result);
  } catch (error) {
    if (delivering) attempted = "";
    retryAfter = Date.now() + 2000;
    if (!stopping)
      console.error(
        `Не удалось обновить аддон: ${error instanceof Error ? error.message : String(error)}`,
      );
  } finally {
    busy = false;
  }
}

console.log(
  "Разработка аддона: успешные сборки автоматически доставляются в клиент. Ctrl+C — выход.",
);
const timer = setInterval(() => void tick(), 500);
function stop() {
  stopping = true;
  clearInterval(timer);
  modules.stop();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await tick();

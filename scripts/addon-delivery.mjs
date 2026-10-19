import path from "node:path";
import { promises as fs } from "node:fs";

import { getPulseSyncAddonsDir } from "./pulsesync-paths.mjs";
import { discoverModules } from "./module-discovery.mjs";
import { migrateFullscreenSettings } from '../src/fullscreen-setting.js';

const SETTINGS_FILENAME = "pulsesync.settings.json";
const CLIENT_RELOAD_URL =
  process.env.PULSESYNC_CLIENT_URL || "http://127.0.0.1:2007";
const CLIENT_RELOAD_HEADER = "X-PulseSync-Addon-Dev";
const LOCAL_MODULES_FILENAME = "modules.local.json";

export async function readLocalModules(rootDir) {
  const modules = await discoverModules(rootDir);
  return modules.length
    ? Object.fromEntries(
        modules.map(({ alias, path, kind, apiMajor }) => [
          alias,
          { path, kind, apiMajor },
        ]),
      )
    : undefined;
}

export async function localModuleSignature(rootDir) {
  const modules = await readLocalModules(rootDir);
  if (!modules) return "";
  const files = await Promise.all(
    Object.values(modules).map(async (ref) => {
      const stat = await fs.stat(resolveBuildFile(rootDir, ref.path));
      return `${ref.path}:${stat.mtimeMs}:${stat.size}`;
    }),
  );
  return JSON.stringify([modules, files]);
}

async function copyLocalModules(rootDir, stagingDir) {
  const modules = await readLocalModules(rootDir);
  if (!modules) return;
  const config = Object.create(null);
  for (const [alias, ref] of Object.entries(modules)) {
    const relativePath = `.pulsesync-local-modules/${alias}.${ref.kind === "wasm" ? "wasm" : "js"}`;
    const target = path.join(stagingDir, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(resolveBuildFile(rootDir, ref.path), target);
    config[alias] = { ...ref, path: relativePath };
  }
  await fs.writeFile(
    path.join(stagingDir, LOCAL_MODULES_FILENAME),
    JSON.stringify(config, null, 2),
  );
}

function normalizeDirectoryName(value) {
  const directoryName = String(value || "").trim();
  if (
    !directoryName ||
    directoryName === "." ||
    directoryName === ".." ||
    path.basename(directoryName) !== directoryName
  ) {
    throw new Error(
      `Invalid addon directoryName: ${directoryName || "<empty>"}`,
    );
  }
  return directoryName;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function resolveBuildFile(sourceDir, fileName) {
  const resolvedPath = path.resolve(sourceDir, fileName);
  const relativePath = path.relative(sourceDir, resolvedPath);
  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(
      `Built addon file points outside the build directory: ${fileName}`,
    );
  }
  return resolvedPath;
}

export async function validateAddonSource(sourceDir, addonConfig) {
  const metadataPath = path.join(sourceDir, "metadata.json");
  const metadata = await readJson(metadataPath);

  const expectedType = addonConfig.type || "web-addon";
  if (
    !["theme", "web-addon", "script"].includes(metadata.type) ||
    metadata.type !== expectedType
  )
    throw new Error(
      `Built addon type mismatch: expected ${expectedType}, received ${String(metadata.type)}`,
    );
  if (
    String(metadata.id || "").trim() !== String(addonConfig.id || "").trim()
  ) {
    throw new Error(
      `Built addon id does not match addon.config.mjs: ${String(metadata.id || "<empty>")}`,
    );
  }

  if (
    metadata.type !== "theme" &&
    (typeof metadata.script !== "string" || !metadata.script.trim())
  )
    throw new Error("Built addon metadata does not declare a script file");
  if (
    metadata.type === "theme" &&
    (typeof metadata.css !== "string" ||
      !metadata.css.trim())
  )
    throw new Error(
      "Built theme must declare CSS",
    );

  for (const fileName of [metadata.script, metadata.css].filter(Boolean)) {
    if (!(await pathExists(resolveBuildFile(sourceDir, fileName))))
      throw new Error(`Built addon file is missing: ${fileName}`);
  }

  return metadata;
}

async function preserveClientSettings(targetDir, stagingDir, migrationDir, migrateOnce = false) {
  const marker = '.pulsecolor-theme-settings-v1';
  let settingsPath = path.join(targetDir, SETTINGS_FILENAME);
  if (migrateOnce && !(await pathExists(path.join(targetDir, marker))) && migrationDir &&
      await pathExists(path.join(migrationDir, SETTINGS_FILENAME)))
    settingsPath = path.join(migrationDir, SETTINGS_FILENAME);
  if (migrateOnce) await fs.writeFile(path.join(stagingDir, marker), 'PulseColor owns settings\n');
  if (!(await pathExists(settingsPath)) && migrationDir)
    settingsPath = path.join(migrationDir, SETTINGS_FILENAME);
  if (!(await pathExists(settingsPath))) return false;

  await fs.copyFile(settingsPath, path.join(stagingDir, SETTINGS_FILENAME));
  if (migrateOnce) {
    const saved = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
    const next = migrateFullscreenSettings(saved);
    if (JSON.stringify(next) !== JSON.stringify(saved))
      await fs.writeFile(path.join(stagingDir, SETTINGS_FILENAME), JSON.stringify(next, null, 2) + '\n');
  }
  return true;
}

async function assertTargetCanBeReplaced(targetDir) {
  const metadataPath = path.join(targetDir, "metadata.json");
  if (!(await pathExists(metadataPath))) return;

  const metadata = await readJson(metadataPath);
  if (
    metadata.installSource === "store" &&
    process.env.PULSESYNC_ALLOW_STORE_ADDON_OVERWRITE !== "1"
  ) {
    throw new Error(
      "Refusing to overwrite a store-managed addon. Change directoryName or set PULSESYNC_ALLOW_STORE_ADDON_OVERWRITE=1 explicitly.",
    );
  }
}

export async function notifyClient(directoryName) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);

  try {
    const url = new URL("/dev/addons/reload", process.env.PULSESYNC_CLIENT_URL || CLIENT_RELOAD_URL);
    url.searchParams.set("directory", directoryName);
    const response = await fetch(url, {
      method: "POST",
      headers: { [CLIENT_RELOAD_HEADER]: "1" },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload?.ok !== true) {
      return {
        status: response.status === 404 ? "unsupported" : "rejected",
        reason: String(payload?.error || `HTTP ${response.status}`),
      };
    }

    return {
      status: "acknowledged",
      enabled: payload.enabled === true,
      recipients: Number(payload.recipients) || 0,
    };
  } catch (error) {
    return {
      status: "unavailable",
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function formatDeliveryResult(result) {
  if (result.client.status === "script")
    return `${result.name}: скрипт установлен. Обновите список дополнений и перевключите Runtime в PulseSync.`;
  if (result.client.status === "theme")
    return `${result.name}: тема установлена. Выберите её в PulseSync; после изменений CSS перевыберите тему.`;
  if (result.client.status === "acknowledged") {
    const recipients = result.client.recipients;
    return recipients > 0
      ? `${result.name}: синхронизирован, перезагрузка отправлена в Яндекс Музыку.`
      : `${result.name}: установлен. Запустите Яндекс Музыку с модом.`;
  }
  if (result.client.status === "unsupported")
    return `${result.name}: установлен. Обновите PulseSync — клиент не поддерживает перезагрузку для разработки.`;
  if (result.client.status === "rejected")
    return `${result.name}: PulseSync отклонил перезагрузку: ${result.client.reason}`;
  return `${result.name}: установлен. PulseSync пока недоступен.`;
}

export async function deliverAddon(
  sourceDir,
  addonConfig,
  rootDir,
  { migrateSettingsFrom, migrateSettingsOnce = false } = {},
) {
  const directoryName = normalizeDirectoryName(addonConfig.directoryName);
  const targetRoot = path.resolve(getPulseSyncAddonsDir());
  const targetDir = path.join(targetRoot, directoryName);
  const transactionRoot = path.join(targetRoot, ".pulsesync-dev-staging");
  const transactionId = `${directoryName}-${process.pid}-${Date.now()}`;
  const stagingDir = path.join(transactionRoot, `${transactionId}-next`);
  const backupDir = path.join(transactionRoot, `${transactionId}-previous`);
  const resolvedSourceDir = path.resolve(sourceDir);

  const metadata = await validateAddonSource(resolvedSourceDir, addonConfig);
  await fs.mkdir(transactionRoot, { recursive: true });
  await assertTargetCanBeReplaced(targetDir);
  await fs.cp(resolvedSourceDir, stagingDir, { recursive: true, force: true });
  if (metadata.type === "web-addon")
    await copyLocalModules(rootDir, stagingDir);
  await fs.rm(path.join(stagingDir, SETTINGS_FILENAME), { force: true });
  const migrationDir = migrateSettingsFrom
    ? path.join(targetRoot, normalizeDirectoryName(migrateSettingsFrom))
    : undefined;
  const settingsPreserved = await preserveClientSettings(
    targetDir,
    stagingDir,
    migrationDir,
    migrateSettingsOnce,
  );

  let targetMoved = false;
  try {
    if (await pathExists(targetDir)) {
      await fs.rename(targetDir, backupDir);
      targetMoved = true;
    }
    await fs.rename(stagingDir, targetDir);
  } catch (error) {
    if (
      targetMoved &&
      !(await pathExists(targetDir)) &&
      (await pathExists(backupDir))
    )
      await fs.rename(backupDir, targetDir);
    throw error;
  }

  if (targetMoved) await fs.rm(backupDir, { recursive: true, force: true });
  await fs.rmdir(transactionRoot).catch(() => undefined);

  const client = ["theme", "script"].includes(metadata.type)
    ? { status: metadata.type }
    : await notifyClient(directoryName);
  return {
    client,
    type: metadata.type,
    directoryName,
    name: String(metadata.name || directoryName),
    settingsPreserved,
    targetDir,
  };
}

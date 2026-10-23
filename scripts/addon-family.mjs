import path from "node:path";
import { pathToFileURL } from "node:url";
import { deliverAddon, validateAddonSource } from "./addon-delivery.mjs";

export async function readAddonFamily(rootDir, revision = "") {
  const read = async (file) => {
    const url = pathToFileURL(path.join(rootDir, file));
    if (revision) url.searchParams.set("revision", revision);
    return (await import(url.href)).default;
  };
  return [await read("addon.config.mjs")];
}

export async function deliverFamily(buildRoot, configs, rootDir) {
  await Promise.all(
    configs.map((config) =>
      validateAddonSource(path.join(buildRoot, config.directoryName), config),
    ),
  );
  const theme = configs.find((config) => config.type === "theme");
  const results = [];
  for (const config of configs) {
    results.push(
      await deliverAddon(
        path.join(buildRoot, config.directoryName),
        config,
        rootDir,
        {
          // Only seed a new Runtime install; never overwrite its own saved settings.
          migrateSettingsFrom: undefined,
        },
      ),
    );
  }
  return results;
}

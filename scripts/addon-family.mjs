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
          migrateSettingsFrom:
            config.id === '419c58cb-75c5-48bf-b053-933f3b81190f'
              ? 'a8a17b79-c9d3-4af7-a984-7a2037a205df'
              : config.type === "script" && theme ? theme.directoryName : undefined,
          migrateSettingsOnce: config.id === '419c58cb-75c5-48bf-b053-933f3b81190f',
        },
      ),
    );
  }
  return results;
}

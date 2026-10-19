import {
  defineAddonSettings,
  SettingType,
  type Setting,
} from "@pulsesync/addon-sdk";

import catalog from "./settings.catalog.json" with { type: "json" };

type CatalogItem = {
  id: string;
  name: string;
  description: string;
  type: string;
  defaultParameter: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Record<string, { event: string; name: string }>;
};

function toSetting(item: CatalogItem): Setting {
  const common = { name: item.name, description: item.description };
  switch (item.type) {
    case "button":
      return {
        ...common,
        type: SettingType.BOOLEAN,
        default: Boolean(item.defaultParameter),
      };
    case "slider":
      return {
        ...common,
        type: SettingType.NUMBER,
        default: Number(item.defaultParameter),
        min: item.min!,
        max: item.max!,
        step: item.step,
      };
    case "selector": {
      const options = Object.values(item.options!).map((option) => ({
        label: option.name,
        value: option.event,
      }));
      const selected = item.options![String(item.defaultParameter)];
      if (!selected) throw new Error(`Invalid PulseColor default: ${item.id}`);
      return {
        ...common,
        type: SettingType.SELECT,
        default: selected.event,
        options,
      };
    }
    case "input":
      return {
        ...common,
        type: SettingType.STRING,
        default: String(item.defaultParameter),
      };
    default:
      throw new Error(
        `Unsupported PulseColor setting: ${item.id} (${item.type})`,
      );
  }
}

const schema: Record<string, Setting> = Object.fromEntries(
  catalog.sections.flatMap((section) =>
    section.items.map((item) => [item.id, toSetting(item as CatalogItem)]),
  ),
);

// Keep this exact object for defineAddon: the SDK associates its lifecycle by identity.
export const settings = defineAddonSettings(schema);

// The SDK's default exporter has one section. Only the build-time view groups
// controls; the actual runtime definition and all setting IDs stay unchanged.
export const settingsMetadata: typeof settings = Object.create(settings, {
  toConfig: {
    value: () => {
      const items = new Map(
        settings
          .toConfig()
          .sections.flatMap((section) =>
            section.items.map((item) => [String(item.id), item] as const),
          ),
      );
      return {
        sections: catalog.sections.map((section) => ({
          title: section.title,
          items: section.items.map((item) => items.get(item.id)!),
        })),
      };
    },
  },
});

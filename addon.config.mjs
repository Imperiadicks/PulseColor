import { themeId, runtimeId } from "./addon.ids.mjs";

const addonConfig = {
  id: themeId,
  directoryName: themeId,
  name: "PulseColor",
  description: "Для тех кто хочет живую музыку и красивый интерфейс.",
  type: "theme",
  version: "2.0.0",
  author: ["imperiadicks", "dieugh"],
  image: "Assets/image.png",
  banner: "Assets/Banner.png",
  libraryLogo: "",
  tags: ["PulseSync", "Colored"],
  dependencies: [runtimeId],
  conflictsWith: [
    "aba24212-1fe9-4837-9211-25832a7758ba",
    "58d0eae9-587d-4b46-a77d-9fe009516a6f",
    "22281ad0-f9ca-4dbf-991b-739a8503f5b3",
    "8c4b0e14-e365-4160-ab4c-8c26cf3fa84e",
  ],
  allowedUrls: [],
  supportedVersions: [],
};

export default addonConfig;

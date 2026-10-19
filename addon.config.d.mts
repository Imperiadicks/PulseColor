declare const addonConfig: {
  id: string;
  directoryName: string;
  name: string;
  description: string;
  version: string;
  author: string | string[];
  type: "theme";
  image: string;
  banner: string;
  libraryLogo: string;
  tags: string[];
  dependencies: string[];
  conflictsWith: string[];
  allowedUrls: string[];
  supportedVersions: string[];
};

export default addonConfig;

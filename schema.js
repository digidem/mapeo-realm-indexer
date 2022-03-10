export const BacklinkSchema = {
  name: "Backlink",
  properties: {
    version: "string",
  },
  primaryKey: "version",
};

export const DocSchema = {
  name: "Doc",
  properties: {
    id: "string",
    version: "string",
    links: "string[]",
    forks: {
      type: "set",
      objectType: "string",
    }
  },
  primaryKey: "id",
};

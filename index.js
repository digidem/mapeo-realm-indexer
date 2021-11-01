import Realm from "realm";

/** @type {Realm.ObjectSchema} */
const LinkSchema = {
  name: "Link",
  properties: {
    version: "string",
  },
  primaryKey: "version",
};

/** @type {Realm.ObjectSchema} */
const DocSchema = {
  name: "Doc",
  properties: {
    id: "string",
    version: "string",
    value: "string",
    links: "string[]",
    forks: {
      type: "set",
      objectType: "string",
      default: [],
    },
  },
  primaryKey: "id",
};

const realm = await Realm.open({
  inMemory: true,
  schema: [LinkSchema, DocSchema],
});

const docs = [
  { id: "A", version: "1", value: "foo", links: [] },
  { id: "A", version: "2", value: "bar", links: ["1"] },
  { id: "A", version: "3", value: "world", links: ["1"] },
  { id: "A", version: "4", value: "hello bar", links: ["2", "3"] },
  { id: "A", version: "5", value: "now Ive decided", links: ["4"] },
  { id: "A", version: "6", value: "another", links: ["4"] },
].reverse()

indexer(docs);

/** @param {string} version */
function isLinked(version) {
  return !!realm.objectForPrimaryKey("Link", version);
}

function getWinner(docA, docB) {
  if (docA.timestamp > docB.timestamp) return docA;
  if (docB.timestamp > docA.timestamp) return docB;
  // They are equal, so sort by version to ensure winner is deterministic
  return docA.version > docB.version ? docA : docB;
}

function indexer(docs) {
  realm.write(() => {
    for (const doc of docs) {
      for (const link of doc.links) {
        realm.create("Link", { version: link }, "modified");
      }
      // If the doc is linked to by another doc, then it's not a head, so we can ignore it
      if (isLinked(doc.version)) continue;

      const existing = realm.objectForPrimaryKey("Doc", doc.id);
      if (!existing) {
        realm.create("Doc", doc);
      } else if (isLinked(existing.version)) {
        // The existing doc for this ID is now linked, so we can replace it
        realm.delete(existing);
        realm.create("Doc", doc);
      } else {
        // Document is forked, so we need to select a "winner"
        const winner = getWinner(existing, doc);
        // TODO: Can the forks Set get out of date over time? E.g. could some of
        // the forks end up being linked by a doc that is indexed later on?
        if (winner === existing) {
          existing.forks.add(doc.version);
        } else {
          // Need to clone the forks set, before it is deleted
          doc.forks = [...existing.forks.add(existing.version)];
          realm.delete(existing);
          realm.create("Doc", doc);
        }
      }
    }
  });
}

console.log(JSON.stringify(realm.objects("Doc")));

realm.close();

import Realm from "realm";
import test from "tape";
import RealmIndexer from "./index.js";

const BacklinkSchema = {
  name: "Backlink",
  properties: {
    version: "string",
  },
  primaryKey: "version",
};

const DocSchema = {
  name: "Doc",
  properties: {
    id: "string",
    version: "string",
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
  schema: [BacklinkSchema, DocSchema],
});

const docs = [
  { id: "A", version: "1", links: [] },
  { id: "A", version: "2", links: ["1"] },
  { id: "A", version: "3", links: ["1"] },
  { id: "A", version: "4", links: ["2", "3"] },
  { id: "A", version: "5", links: ["4"] },
  { id: "A", version: "6", links: ["4"] },
  { id: "A", version: "7", links: ["4"] },
  { id: "A", version: "8", links: ["5", "6"] },
];

test("Expected head for all permutations of order", async (t) => {
  const indexer = new RealmIndexer(realm, {
    docType: "Doc",
    backlinkType: "Backlink",
  });

  const expected = { id: "A", version: "8", links: ["5", "6"], forks: ["7"] };

  for (const permutation of permute(docs)) {
    indexer.batch(permutation);
    const head = realm.objectForPrimaryKey("Doc", "A");
    t.deepEqual(head.toJSON(), expected, JSON.stringify(permutation.map(doc => doc.version)));
    realm.write(() => {
      realm.deleteAll();
    })
  }
});

test("cleanup", t => {
  realm.close();
  t.end();
});

/**
 * Returns an iterator of all permutations of the given array.
 *
 * @param {Array<any>} arr
 */
function* permute(arr) {
  var length = arr.length,
    c = Array(length).fill(0),
    i = 1,
    k,
    p;

  yield arr.slice();
  while (i < length) {
    if (c[i] < i) {
      k = i % 2 && c[i];
      p = arr[i];
      arr[i] = arr[k];
      arr[k] = p;
      ++c[i];
      i = 1;
      yield arr.slice();
    } else {
      c[i] = 0;
      ++i;
    }
  }
}

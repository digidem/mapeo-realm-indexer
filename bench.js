import Realm from "realm";
import { BacklinkSchema, DocSchema } from "./schema.js";
import RealmIndexer from "./index.js";
import { randomBytes } from "crypto";

const realm = await Realm.open({
  inMemory: true,
  schema: [BacklinkSchema, DocSchema],
});

const indexer = new RealmIndexer(realm, {
  docType: "Doc",
  backlinkType: "Backlink",
});

var batchSize = Number(process.argv[2]);
var times = Number(process.argv[3]);

var keys = [];
for (var i = 0; i < 5000; i++) {
  keys.push(randomBytes(4).toString("hex"));
}

var start = Date.now();
var uid = 0;

(function next(n) {
  if (n === times) return finish();
  var docs = [];
  for (var i = 0; i < batchSize; i++) {
    docs.push({
      version: String(uid),
      id: keys[Math.floor(Math.random() * keys.length)],
      links: uid > 0 ? [String(uid - 1)] : [],
    });
    uid++;
  }
  indexer.batch(docs)
  next(n + 1)
})(0);

function finish() {
  var elapsed = Date.now() - start;
  console.log(`${elapsed}ms`);
  realm.close()
}

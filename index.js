import assert from "assert";

export default class RealmIndexer {
  /**
   * @param {import('realm')} realm
   * @param {object} options
   * @param {string} options.docType
   * @param {string} options.backlinkType
   */
  constructor(realm, { docType, backlinkType }) {
    this.realm = realm;
    this.docType = docType;
    this.backlinkType = backlinkType;
    validateDocSchema(realm.schema, docType);
    validateBacklinkSchema(realm.schema, backlinkType);
  }

  batch(docs) {
    const { realm, docType, backlinkType } = this;
    realm.write(() => {
      for (const doc of docs) {
        const existing = realm.objectForPrimaryKey(this.docType, doc.id);
        for (const link of doc.links) {
          realm.create(
            this.backlinkType,
            { version: link },
            Realm.UpdateMode.Modified
          );
          if (existing && existing.forks.has(link)) {
            existing.forks.delete(link);
          }
        }

        // If the doc is linked to by another doc, then it's not a head, so we can ignore it
        if (this.isLinked(doc.version)) continue;

        if (!existing) {
          realm.create(this.docType, doc);
        } else if (this.isLinked(existing.version)) {
          // The existing doc for this ID is now linked, so we can replace it
          realm.delete(existing);
          realm.create(this.docType, doc);
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
            realm.create(this.docType, doc);
          }
        }
      }
    });
  }

  /** @param {string} version */
  isLinked(version) {
    return !!this.realm.objectForPrimaryKey(this.backlinkType, version);
  }
}

function getWinner(docA, docB) {
  if (docA.timestamp > docB.timestamp) return docA;
  if (docB.timestamp > docA.timestamp) return docB;
  // They are equal, so sort by version to ensure winner is deterministic
  return docA.version > docB.version ? docA : docB;
}

/**
 * @param {import('realm').ObjectSchema[]} schema
 * @param {string} docType
 */
function validateDocSchema(schema, docType) {
  const docSchema = schema.find((s) => s.name === docType);
  assert(docSchema, `type ${docType} not found in schema`);
  assert(docSchema.properties.id, `type ${docType} must have an id property`);
  assert(
    docSchema.primaryKey === "id",
    `type ${docType} id property must be a primary key`
  );
  // TODO: validate other properties that we rely on in the code
}

/**
 * @param {import('realm').ObjectSchema[]} schema
 * @param {string} backlinkType
 */
function validateBacklinkSchema(schema, backlinkType) {
  const docSchema = schema.find((s) => s.name === backlinkType);
  assert(docSchema, `type ${backlinkType} not found in schema`);
  assert(
    docSchema.properties.version,
    `type ${backlinkType} must have an version property`
  );
  assert(
    docSchema.primaryKey === "version",
    `type ${backlinkType} version property must be a primary key`
  );
}

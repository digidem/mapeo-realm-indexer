import Realm from 'realm'
import { assertRealmSchemaIncludes } from './lib/realm-utils.js'
import { DocSchema, BacklinkSchema } from './schema.js'

/**
 * @typedef {object} IndexableDocument
 * @property {string} id
 * @property {string} version
 * @property {string[]} links
 * @property {string | number} [timestamp]
 */

/** @typedef {IndexableDocument & { forks: Realm.Set<string> } & Realm.Object} IndexedDocument */
/** @typedef {{ version: string } & Realm.Object} Backlink */

export default class RealmIndexer {
  /**
   * @param {import('realm')} realm
   * @param {object} options
   * @param {string} options.docType - Name of the Realm object type that will store the indexed document
   * @param {string} options.backlinkType - Name of the Realm object type that will store the backlinks
   * @param {typeof defaultGetWinner} [options.getWinner] - Function that will be used to determine the "winning" fork of a document
   */
  constructor(realm, { docType, backlinkType, getWinner = defaultGetWinner }) {
    this.realm = realm
    this.docType = docType
    this.backlinkType = backlinkType
    this.getWinner = getWinner
    assertRealmSchemaIncludes(realm, DocSchema)
    assertRealmSchemaIncludes(realm, BacklinkSchema)
  }

  /** @param {IndexableDocument[]} docs */
  batch(docs) {
    const { realm, docType, backlinkType } = this
    realm.write(() => {
      for (const doc of docs) {
        /** @type {IndexedDocument | undefined} */
        const existing = realm.objectForPrimaryKey(docType, doc.id)
        for (const link of doc.links) {
          realm.create(
            backlinkType,
            { version: link },
            Realm.UpdateMode.Modified
          )
          if (existing && existing.forks.has(link)) {
            existing.forks.delete(link)
          }
        }

        // If the doc is linked to by another doc, then it's not a head, so we can ignore it
        if (this.isLinked(doc.version)) continue

        if (!existing) {
          // @ts-ignore - strangeness with Realm create types
          realm.create(docType, doc)
        } else if (this.isLinked(existing.version)) {
          // The existing doc for this ID is now linked, so we can replace it
          realm.delete(existing)
          // @ts-ignore - strangeness with Realm create types
          realm.create(docType, doc)
        } else {
          // Document is forked, so we need to select a "winner"
          const winner = this.getWinner(existing, doc)
          // TODO: Can the forks Set get out of date over time? E.g. could some of
          // the forks end up being linked by a doc that is indexed later on?
          if (winner === existing) {
            existing.forks.add(doc.version)
          } else {
            // Need to clone the forks set, before it is deleted
            const forks = [...existing.forks.add(existing.version)]
            realm.delete(existing)
            // @ts-ignore - strangeness with Realm create types
            realm.create(docType, { ...doc, forks })
          }
        }
      }
    })
  }

  /** @param {string} version */
  isLinked(version) {
    return !!this.realm.objectForPrimaryKey(this.backlinkType, version)
  }
}

/**
 *
 * @param {IndexableDocument} docA
 * @param {IndexableDocument} docB
 * @returns IndexedDocument
 */
function defaultGetWinner(docA, docB) {
  if (
    // Checking neither null nor undefined
    docA.timestamp != null &&
    docB.timestamp != null
  ) {
    if (docA.timestamp > docB.timestamp) return docA
    if (docB.timestamp > docA.timestamp) return docB
  }
  // They are equal or no timestamp property, so sort by version to ensure winner is deterministic
  return docA.version > docB.version ? docA : docB
}

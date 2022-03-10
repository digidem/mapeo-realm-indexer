import assert from 'assert'
import { parsePropertyType } from './lib/realm-utils.js'
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
   * @param {string} options.docType
   * @param {string} options.backlinkType
   */
  constructor(realm, { docType, backlinkType }) {
    this.realm = realm
    this.docType = docType
    this.backlinkType = backlinkType
    validateDocSchema(realm.schema, docType)
    validateBacklinkSchema(realm.schema, backlinkType)
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
          const winner = getWinner(existing, doc)
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
 * @param {IndexedDocument | IndexableDocument} docA
 * @param {IndexedDocument | IndexableDocument} docB
 * @returns IndexedDocument
 */
function getWinner(docA, docB) {
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

/**
 * @param {import('realm').ObjectSchema[]} schema
 * @param {string} docType
 */
function validateDocSchema(schema, docType) {
  const docSchema = schema.find((s) => s.name === docType)
  assert(docSchema, `type ${docType} not found in schema`)
  assert(docSchema.properties.id, `type ${docType} must have an id property`)
  assert(
    docSchema.primaryKey === 'id',
    `type ${docType} id property must be a primary key`
  )
  const props = docSchema.properties
  assert(
    validateProperty(props.id, { type: 'string' }),
    `id property must be a string`
  )
  assert(
    validateProperty(props.version, { type: 'string', optional: false }),
    `version property must be a string`
  )
  assert(
    validateProperty(props.links, { type: 'list', optional: false }),
    `links property must be a list`
  )
  assert(
    typeof props.timestamp === 'undefined' ||
      validateProperty(props.timestamp, { type: 'string' }) ||
      validateProperty(props.timestamp, { type: 'number' }),
    `timestamp property must be a string`
  )
}

/**
 * @param {import('realm').ObjectSchema[]} schema
 * @param {string} backlinkType
 */
function validateBacklinkSchema(schema, backlinkType) {
  const docSchema = schema.find((s) => s.name === backlinkType)
  assert(docSchema, `type ${backlinkType} not found in schema`)
  assert(
    docSchema.primaryKey === 'version',
    `type ${backlinkType} version property must be a primary key`
  )
  assert(
    validateProperty(docSchema.properties.version, { type: 'string' }),
    `version property must be a string`
  )
}

/**
 *
 * @param {Realm.PropertyType | Realm.ObjectSchema | Realm.ObjectSchemaProperty} prop
 * @param {Partial<Realm.ObjectSchemaProperty>} propertySchema
 * @return {boolean}
 */
function validateProperty(prop, propertySchema) {
  if (typeof prop !== 'string' && 'properties' in prop) return false
  const normalizedProp = parsePropertyType(prop)
  for (const [key, value] of Object.entries(propertySchema)) {
    if (
      normalizedProp[/** @type {keyof Realm.ObjectSchemaProperty} */ (key)] !==
      value
    )
      return false
  }
  return true
}

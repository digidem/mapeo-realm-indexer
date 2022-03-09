// @ts-check
import { deepEqual } from 'fast-equals';

const validPropertyTypes = new Set([
  'string',
  'bool',
  'int',
  'float',
  'double',
  'date',
  'data',
  'list',
  'set',
  'linkingObjects',
  'dictionary',
  'decimal128',
  'objectId'
])

/**
 *
 * @param {import('realm').ObjectSchema[]} schema
 * @param {import('realm').ObjectSchema[]} normalizedSchema
 */
export function validateSchema(schema, normalizedSchema) {
  for (const objectSchema of schema) {
    const normalizedObjectSchema = normalizedSchema.find(normalizedObjectSchema => normalizedObjectSchema.name === objectSchema.name)
    if (!normalizedObjectSchema) {
      throw new Error(`object '${objectSchema.name}' is not in the schema in the database`)
    }
    if (!deepEqual(normalizeSchema(objectSchema), normalizedObjectSchema)) {
      throw new Error(`the schema for '${objectSchema.name}' does not match the schema in the database`)
    }
  }
}

/**
 * Normalize a Realm Schema object by expanding any shorthand types. Can be used
 * to compare with the normalized schema returned by realm.schema
 *
 * @param {import('realm').ObjectSchema} schema
 */
export function normalizeSchema(schema) {
  /** @type {import('realm').PropertiesTypes} */
  const normalizedProperties = {}

  for (const [key, value] of Object.entries(schema.properties)) {
    const defaults = {
      optional: false,
      indexed: schema.primaryKey === key,
      mapTo: key,
      name: key,
    }
    if (typeof value === 'string') {
      normalizedProperties[key] = { ...defaults, ...parsePropertyType(value) }
    } else {
      normalizedProperties[key] = { ...defaults, ...value }
    }
  }

  return {
    embedded: false,
    ...schema,
    properties: normalizedProperties,
  }
}

/**
 * Parse a shorthand Realm property type
 *
 * @param {string} pType
 * @returns {import('realm').ObjectSchemaProperty}
 */
function parsePropertyType(pType) {
  if (pType.endsWith('[]')) {
    const subType = parsePropertyType(pType.slice(0, -2))
    return {
      type: 'list',
      objectType: subType.type === 'object' ? subType.objectType : subType.type,
      optional: pType.slice(-3, -2) === '?',
    }
  } else if (pType.endsWith('<>')) {
    const subType = parsePropertyType(pType.slice(0, -2))
    return {
      type: 'set',
      objectType: subType.type,
      optional: subType.optional,
    }
  }
  let optional = false
  if (pType.endsWith('?')) {
    optional = true
    pType = pType.slice(0, -1)
  }
  if (validPropertyTypes.has(pType)) {
    return {
      type: pType,
      optional,
    }
  }
  return {
    type: 'object',
    objectType: pType,
    // According to docs object types are always optional
    optional: true
  }
}

// @ts-check
import Realm from 'realm'
import test from 'tape'
import tmp from 'tmp'
import path from 'path'
import RealmIndexer, { BacklinkSchema, DocSchema } from '../index.js'

const { name: tmpDir, removeCallback } = tmp.dirSync({ unsafeCleanup: true })

const realm = await Realm.open({
  inMemory: true,
  schema: [BacklinkSchema, DocSchema],
  path: path.join(tmpDir, 'test.realm'),
})

const docs = [
  { id: 'A', version: '1', links: [] },
  { id: 'A', version: '2', links: ['1'] },
  { id: 'A', version: '3', links: ['1'] },
  { id: 'A', version: '4', links: ['2', '3'] },
  { id: 'A', version: '5', links: ['4'] },
  { id: 'A', version: '6', links: ['4'] },
  { id: 'A', version: '7', links: ['4'] },
  { id: 'A', version: '8', links: ['5', '6'] },
]

const scenarios = [
  {
    docs: docs.slice(0, 2),
    expected: { id: 'A', version: '2', links: ['1'], forks: [] },
  },
  {
    docs: docs.slice(0, 3),
    expected: { id: 'A', version: '3', links: ['1'], forks: ['2'] },
  },
  {
    docs: docs.slice(0, 4),
    expected: { id: 'A', version: '4', links: ['2', '3'], forks: [] },
  },
  {
    docs: docs.slice(0, 5),
    expected: { id: 'A', version: '5', links: ['4'], forks: [] },
  },
  {
    docs: docs.slice(0, 6),
    expected: { id: 'A', version: '6', links: ['4'], forks: ['5'] },
  },
  {
    docs: docs.slice(0, 7),
    expected: { id: 'A', version: '7', links: ['4'], forks: ['5', '6'] },
  },
  {
    docs: docs.slice(0, 8),
    expected: { id: 'A', version: '8', links: ['5', '6'], forks: ['7'] },
  },
]

test('Expected head for all permutations of order', async (t) => {
  const indexer = new RealmIndexer(realm, {
    docType: 'Doc',
    backlinkType: 'Backlink',
  })

  for (const scenario of scenarios) {
    const { docs, expected } = scenario

    for (const permutation of permute(docs)) {
      indexer.batch(permutation)
      const head = realm.objectForPrimaryKey('Doc', 'A')
      t.deepEqual(
        head.toJSON(),
        expected,
        JSON.stringify(permutation.map((doc) => doc.version))
      )
      realm.write(() => {
        realm.deleteAll()
      })
    }
  }
})

test('cleanup', (t) => {
  realm.close()
  removeCallback()
  t.end()
})

/**
 * Returns an iterator of all permutations of the given array.
 * From https://stackoverflow.com/a/37580979/3071863
 * @template T
 * @param {Array<T>} arr
 * @returns {IterableIterator<Array<T>>}
 */
function* permute(arr) {
  var length = arr.length,
    c = Array(length).fill(0),
    i = 1,
    k,
    p

  yield arr.slice()
  while (i < length) {
    if (c[i] < i) {
      k = i % 2 && c[i]
      p = arr[i]
      arr[i] = arr[k]
      arr[k] = p
      ++c[i]
      i = 1
      yield arr.slice()
    } else {
      c[i] = 0
      ++i
    }
  }
}

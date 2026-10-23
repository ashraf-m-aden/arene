/**
 * Migration : un seul dossier par candidat et par édition, garanti en base.
 *
 * La règle existait déjà dans `registrations.service.createDraft`, mais sous
 * forme de lecture puis écriture : deux requêtes simultanées passent toutes
 * les deux le `findOne` et créent chacune leur dossier. L'index unique
 * `{ editionId, candidateId }` ferme la fenêtre — encore faut-il le créer, ce
 * que la production ne fait pas toute seule (`autoIndex: !isProd`).
 *
 * Un index unique refuse de se construire si des doublons existent déjà. Ce
 * script les cherche d'abord, et ne retire tout seul que les brouillons
 * surnuméraires : un `draft` n'engage personne. Dès qu'un doublon est allé
 * plus loin (envoyé, examiné, convoqué, inscrit), il y a deux candidatures
 * réelles pour une personne — c'est au staff de trancher, pas à un script.
 *
 *   node apps/api/src/migrations/2026-10-dossier-unique-par-edition.js          (aperçu)
 *   node apps/api/src/migrations/2026-10-dossier-unique-par-edition.js --write  (applique)
 */
import mongoose from 'mongoose'
import config from '../core/config.js'

const WRITE = process.argv.includes('--write')
const INDEX_NAME = 'editionId_1_candidateId_1'

/** Un brouillon n'engage rien : il peut partir sans décision humaine. */
const isDisposable = (doc) => doc.status === 'draft'

/** À dossiers également engageants, on garde le plus récemment modifié. */
const mostAdvanced = (docs) =>
  [...docs].sort((a, b) => {
    const engaged = Number(!isDisposable(b)) - Number(!isDisposable(a))
    if (engaged) return engaged
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
  })[0]

async function main() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.db
  const collection = db.collection('registrations')
  console.log(`base : ${db.databaseName}${WRITE ? '' : '  (aperçu, aucune écriture)'}\n`)

  const groups = await collection
    .aggregate([
      { $group: { _id: { editionId: '$editionId', candidateId: '$candidateId' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } }
    ])
    .toArray()

  console.log(`candidats avec plusieurs dossiers sur une même édition : ${groups.length}`)

  let removable = 0
  const conflicts = []

  for (const group of groups) {
    const docs = await collection.find({ _id: { $in: group.ids } }).toArray()
    const keep = mostAdvanced(docs)
    const others = docs.filter((d) => String(d._id) !== String(keep._id))
    const engaged = others.filter((d) => !isDisposable(d))

    console.log(`\n  candidat ${group._id.candidateId} / édition ${group._id.editionId}`)
    console.log(`    gardé    : ${keep._id} (${keep.status})`)
    for (const doc of others) {
      const verdict = isDisposable(doc) ? 'brouillon, retiré' : 'ENGAGÉ — décision du staff requise'
      console.log(`    doublon  : ${doc._id} (${doc.status}) → ${verdict}`)
    }

    if (engaged.length) {
      conflicts.push({ group: group._id, keep: keep._id, engaged: engaged.map((d) => d._id) })
      continue
    }

    removable += others.length
    if (WRITE) await collection.deleteMany({ _id: { $in: others.map((d) => d._id) } })
  }

  if (conflicts.length) {
    console.log(
      `\n⚠ ${conflicts.length} cas portent plusieurs dossiers engageants. L'index unique ne peut`
    )
    console.log('  pas être créé tant qu\'ils subsistent : faites trancher le staff, puis relancez.')
    await mongoose.disconnect()
    process.exit(1)
  }

  console.log(`\nbrouillons surnuméraires ${WRITE ? 'retirés' : 'à retirer'} : ${removable}`)

  const existing = await collection.indexes()
  if (existing.some((i) => i.name === INDEX_NAME)) {
    console.log(`index ${INDEX_NAME} : déjà en place`)
  } else if (WRITE) {
    await collection.createIndex({ editionId: 1, candidateId: 1 }, { unique: true, name: INDEX_NAME })
    console.log(`index ${INDEX_NAME} : créé`)
  } else {
    console.log(`index ${INDEX_NAME} : à créer`)
  }

  console.log(WRITE ? '\nmigration appliquée.' : '\naperçu terminé — relancez avec --write pour appliquer.')
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error('échec de la migration :', error.message)
  process.exit(1)
})

/**
 * Migration : fermer la catégorie Lycée, ne garder que l'université (17–25 ans).
 *
 * L'édition ne recrute plus qu'à l'université. Une seule catégorie reste
 * ouverte (`AGE_CATEGORIES`), ses bornes d'âge passent de 18–23 à 17–25, et les
 * plafonds ne se déclinent plus que sur `capacity.universite`.
 *
 * Ce que fait ce script :
 *
 *   1. `ageCategories: ['universite']` sur toutes les éditions, et suppression
 *      de `capacity.lycee` — l'API ne l'accepte plus en écriture, le laisser en
 *      base n'afficherait qu'un quota que personne ne peut plus modifier.
 *   2. Suppression de `rankings.schoolsByCategory`, le cache de l'ancien
 *      classement des écoles scindé par niveau. Le nouveau s'appelle
 *      `rankings.schoolsRanking` : l'ancien n'est plus lu, il sera recalculé à
 *      la première visite.
 *
 * Ce qu'il ne fait pas, volontairement :
 *
 *   - Toucher aux dossiers et aux rencontres de catégorie `lycee`. Ils sont
 *     l'histoire des éditions passées : les classements les lisent par
 *     `editionId` et `phase`, et réécrire leur catégorie falsifierait un podium
 *     déjà joué. Le script les compte et dit où ils sont.
 *   - Toucher au référentiel des écoles. Il décrit les établissements du pays,
 *     lycées compris, et les classements des éditions passées les citent. Un
 *     lycée n'ouvre simplement plus de catégorie : `registrations.service`
 *     refuse le rattachement d'un dossier à un établissement de ce niveau.
 *
 * Un dossier `lycee` encore vivant dans une édition qui recrute demande une
 * décision humaine — le candidat ne peut plus concourir, et c'est au staff de le
 * lui dire. Le script le signale et ne décide rien.
 *
 *   node apps/api/src/migrations/2026-11-edition-universitaire.js          (aperçu)
 *   node apps/api/src/migrations/2026-11-edition-universitaire.js --write  (applique)
 */
import mongoose from 'mongoose'
import config from '../core/config.js'

const WRITE = process.argv.includes('--write')

/** Statuts d'édition où des dossiers sont encore en jeu, avant le premier duel. */
const RECRUITING = ['draft', 'announced', 'registration_open', 'registration_closed']

/** Statuts de dossier qui ne sont pas une fin de parcours. */
const LIVE_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'changes_requested',
  'scheduled'
]

async function main() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.db
  console.log(`base : ${db.databaseName}${WRITE ? '' : '  (aperçu, aucune écriture)'}\n`)

  const editions = db.collection('editions')
  const registrations = db.collection('registrations')

  const withLycee = await editions.countDocuments({
    $or: [{ ageCategories: 'lycee' }, { 'capacity.lycee': { $exists: true } }]
  })
  console.log(`éditions portant la catégorie Lycée : ${withLycee}`)
  if (withLycee && WRITE) {
    const result = await editions.updateMany(
      { $or: [{ ageCategories: 'lycee' }, { 'capacity.lycee': { $exists: true } }] },
      { $set: { ageCategories: ['universite'] }, $unset: { 'capacity.lycee': '' } }
    )
    console.log(`  → ramenées à la seule catégorie Université : ${result.modifiedCount}`)
  } else if (withLycee) {
    console.log('  → seraient ramenées à la seule catégorie Université')
  }

  const staleCache = await editions.countDocuments({
    'rankings.schoolsByCategory': { $exists: true }
  })
  console.log(`\ncaches de classement à l'ancienne forme : ${staleCache}`)
  if (staleCache && WRITE) {
    const result = await editions.updateMany(
      { 'rankings.schoolsByCategory': { $exists: true } },
      { $unset: { 'rankings.schoolsByCategory': '' } }
    )
    console.log(`  → vidés, ils seront recalculés : ${result.modifiedCount}`)
  } else if (staleCache) {
    console.log('  → seraient vidés, pour être recalculés à la première visite')
  }

  /*
   * Etat des lieux des dossiers lycee. Ceux des editions terminees restent en
   * place : ils ont joue, leur categorie est un fait. Ceux d'une edition qui
   * recrute encore sont le vrai sujet — le candidat n'est plus eligible, et
   * personne d'autre que le staff ne peut le lui annoncer.
   */
  const lyceeFiles = await registrations.countDocuments({ ageCategory: 'lycee' })
  console.log(`\ndossiers de catégorie Lycée (toutes éditions) : ${lyceeFiles}`)

  const pending = await registrations
    .aggregate([
      { $match: { ageCategory: 'lycee', status: { $in: LIVE_STATUSES } } },
      { $group: { _id: '$editionId', count: { $sum: 1 } } }
    ])
    .toArray()

  if (!pending.length) {
    console.log('aucun dossier Lycée en cours : rien à arbitrer.')
  } else {
    console.log('\n⚠ dossiers Lycée encore en cours, à traiter à la main :')
    for (const row of pending) {
      const edition = await editions.findOne(
        { _id: row._id },
        { projection: { slug: 1, status: 1 } }
      )
      const recruiting = RECRUITING.includes(edition?.status) ? ' (édition en recrutement)' : ''
      console.log(`  ${edition?.slug || row._id} — ${row.count} dossier(s)${recruiting}`)
    }
    console.log(
      '\n  Ces candidats ne sont plus éligibles. Prévenez-les et refusez leur dossier\n' +
        '  depuis /staff/dossiers : aucun script ne prononce un refus à votre place.'
    )
  }

  const lyceeSchools = await db.collection('schools').countDocuments({ type: 'lycee' })
  console.log(
    `\nlycées au référentiel : ${lyceeSchools} — conservés (ils restent des établissements du pays)`
  )

  console.log(WRITE ? '\nmigration appliquée.' : '\naperçu terminé — relancez avec --write pour appliquer.')
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error('échec de la migration :', error.message)
  process.exit(1)
})

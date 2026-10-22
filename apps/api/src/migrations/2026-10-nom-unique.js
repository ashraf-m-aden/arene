/**
 * Migration : prénom + nom → un seul champ `name`.
 *
 * Le nom est désormais saisi une seule fois, à la création du compte, et n'est
 * plus jamais modifié. Les documents créés avant ce changement portent encore
 * `firstName` / `lastName` ; sans cette migration, `User.name` est absent alors
 * que le modèle l'exige, et toute sauvegarde d'un ancien compte échoue.
 *
 * Idempotente : relancer ne touche que ce qui n'a pas déjà été converti.
 *
 *   node apps/api/src/migrations/2026-10-nom-unique.js          (aperçu)
 *   node apps/api/src/migrations/2026-10-nom-unique.js --write  (applique)
 */
import mongoose from 'mongoose'
import config from '../core/config.js'

const WRITE = process.argv.includes('--write')

const joinName = (doc) => [doc.firstName, doc.lastName].filter(Boolean).join(' ').trim()

async function main() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.db
  console.log(`base : ${db.databaseName}${WRITE ? '' : '  (aperçu, aucune écriture)'}\n`)

  // ── Comptes ────────────────────────────────────────────────────────────────
  const users = await db
    .collection('users')
    .find({ $or: [{ name: { $exists: false } }, { name: '' }, { name: null }] })
    .project({ firstName: 1, lastName: 1, email: 1, role: 1 })
    .toArray()

  console.log(`comptes à convertir : ${users.length}`)
  for (const user of users) {
    const name = joinName(user)
    if (!name) {
      console.log(`  ⚠ ${user.email || user._id} : ni prénom ni nom, laissé en l'état`)
      continue
    }
    console.log(`  ${user.email || user._id} → « ${name} »`)
    if (WRITE) {
      await db
        .collection('users')
        .updateOne(
          { _id: user._id },
          { $set: { name }, $unset: { firstName: '', lastName: '' } }
        )
    }
  }

  // ── Dossiers ───────────────────────────────────────────────────────────────
  const registrations = await db
    .collection('registrations')
    .find({
      'player.firstName': { $exists: true },
      $or: [{ 'player.name': { $exists: false } }, { 'player.name': '' }]
    })
    .project({ 'player.firstName': 1, 'player.lastName': 1 })
    .toArray()

  console.log(`\ndossiers à convertir : ${registrations.length}`)
  for (const registration of registrations) {
    const name = joinName(registration.player || {})
    console.log(`  ${registration._id} → « ${name} »`)
    if (WRITE) {
      await db
        .collection('registrations')
        .updateOne(
          { _id: registration._id },
          { $set: { 'player.name': name }, $unset: { 'player.firstName': '', 'player.lastName': '' } }
        )
    }
  }

  // Les dossiers déjà convertis peuvent garder des champs résiduels.
  if (WRITE) {
    const cleaned = await db
      .collection('registrations')
      .updateMany(
        { $or: [{ 'player.firstName': { $exists: true } }, { 'player.lastName': { $exists: true } }] },
        { $unset: { 'player.firstName': '', 'player.lastName': '' } }
      )
    if (cleaned.modifiedCount) console.log(`\nchamps résiduels retirés : ${cleaned.modifiedCount}`)
  }

  console.log(WRITE ? '\nmigration appliquée.' : '\naperçu terminé — relancez avec --write pour appliquer.')
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error('échec de la migration :', error.message)
  process.exit(1)
})

/**
 * Migration : séparer le rendez-vous administratif de la session de jeu.
 *
 * Jusqu'ici un `Slot` était les deux à la fois — on y contrôlait l'identité, on
 * y faisait signer le contrat, on y encaissait, et on y jouait. Les validations
 * se tenant désormais une semaine avant le tournoi, les deux moments sont
 * distincts : `Slot.kind` les sépare, et `Registration.sessionId` porte la
 * session de jeu là où `slotId` garde le rendez-vous administratif.
 *
 * Ce que fait ce script :
 *
 *   1. `kind: 'checkin'` sur tous les créneaux qui n'en ont pas. C'est bien leur
 *      nature : c'est là qu'on a scanné les badges, signé et encaissé.
 *   2. Les index `{ editionId, kind, startsAt }` sur les créneaux et
 *      `{ editionId, sessionId }` / `{ sessionId, role, status }` sur les
 *      dossiers — la production ne les crée pas toute seule (`autoIndex: !isProd`).
 *
 * Ce qu'il ne fait pas, volontairement : recopier `slotId` dans `sessionId`. Les
 * groupes du pointage n'ont aucune raison d'être les groupes de jeu — ils ont
 * été constitués par ordre d'arrivée des dossiers, une semaine plus tôt, et
 * mélangent les rôles sans contrainte d'équilibre. Pour faire jouer une édition
 * reprise ici, créez les sessions (`kind: 'competition'`) et répartissez-y les
 * inscrits : `POST /editions/:id/slots/distribute` avec `kind=competition`.
 *
 * Les rencontres déjà enregistrées ne sont pas touchées : leur `slotId` pointe
 * le créneau où elles ont réellement été jouées, et les classements continuent
 * de les lire par `editionId` et `phase`.
 *
 *   node apps/api/src/migrations/2026-10-creneaux-checkin-et-competition.js          (aperçu)
 *   node apps/api/src/migrations/2026-10-creneaux-checkin-et-competition.js --write  (applique)
 */
import mongoose from 'mongoose'
import config from '../core/config.js'

const WRITE = process.argv.includes('--write')

const INDEXES = [
  { collection: 'slots', keys: { editionId: 1, kind: 1, startsAt: 1 }, name: 'editionId_1_kind_1_startsAt_1' },
  { collection: 'registrations', keys: { editionId: 1, sessionId: 1 }, name: 'editionId_1_sessionId_1' },
  { collection: 'registrations', keys: { sessionId: 1, role: 1, status: 1 }, name: 'sessionId_1_role_1_status_1' }
]

async function main() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.db
  console.log(`base : ${db.databaseName}${WRITE ? '' : '  (aperçu, aucune écriture)'}\n`)

  const slots = db.collection('slots')
  const untagged = await slots.countDocuments({ kind: { $exists: false } })
  console.log(`créneaux sans nature : ${untagged}`)
  if (untagged && WRITE) {
    const result = await slots.updateMany(
      { kind: { $exists: false } },
      { $set: { kind: 'checkin' } }
    )
    console.log(`  → étiquetés « checkin » : ${result.modifiedCount}`)
  } else if (untagged) {
    console.log('  → seraient étiquetés « checkin »')
  }

  /*
   * Etat des lieux de la competition. Une edition qui a deja des resultats mais
   * aucune session de jeu doit etre recomposee a la main : on le dit ici
   * plutot que de laisser l'ecran de saisie afficher une liste vide.
   */
  const competition = await slots.countDocuments({ kind: 'competition' })
  const played = await db.collection('matches').countDocuments({ strikerScore: { $ne: null } })
  console.log(`\nsessions de jeu existantes : ${competition}`)
  console.log(`rencontres avec résultat    : ${played}`)
  if (played > 0 && competition === 0) {
    console.log(
      '\n⚠ des rencontres ont été jouées sans session de jeu déclarée. Les classements'
    )
    console.log('  restent justes (ils lisent l\'édition et la phase), mais pour générer de')
    console.log('  nouvelles rencontres il faudra créer des créneaux kind=competition et y')
    console.log('  répartir les inscrits.')
  }

  console.log('')
  for (const { collection, keys, name } of INDEXES) {
    const existing = await db.collection(collection).indexes()
    if (existing.some((i) => i.name === name)) {
      console.log(`index ${collection}.${name} : déjà en place`)
    } else if (WRITE) {
      await db.collection(collection).createIndex(keys, { name })
      console.log(`index ${collection}.${name} : créé`)
    } else {
      console.log(`index ${collection}.${name} : à créer`)
    }
  }

  console.log(WRITE ? '\nmigration appliquée.' : '\naperçu terminé — relancez avec --write pour appliquer.')
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error('échec de la migration :', error.message)
  process.exit(1)
})

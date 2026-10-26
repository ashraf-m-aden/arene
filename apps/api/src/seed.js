import config from './core/config.js'
import logger from './core/logger.js'
import { connectDb, disconnectDb } from './core/db.js'
import { registerEvents } from './app.js'
import { User } from './modules/auth/auth.model.js'
import { hashPassword } from './modules/auth/auth.service.js'
import { Edition } from './modules/editions/editions.model.js'
import { School } from './modules/schools/schools.model.js'
import { Slot } from './modules/slots/slots.model.js'
import { Gallery } from './modules/galleries/galleries.model.js'
import { NotificationTemplate } from './modules/notifications/notifications.model.js'
import { DEFAULT_TEMPLATES } from './modules/notifications/notifications.templates.js'

/**
 * Jeu de démonstration : un administrateur, un staff, un candidat,
 * une édition ouverte avec ses créneaux, et un référentiel d'écoles.
 * Idempotent : relancer le script ne duplique rien.
 */
const SCHOOLS = [
  { fr: 'Lycée d’État de Djibouti', ar: 'ثانوية جيبوتي الحكومية', type: 'lycee' },
  { fr: 'Lycée Industriel et Commercial', ar: 'الثانوية الصناعية والتجارية', type: 'lycee' },
  { fr: 'Lycée de Balbala', ar: 'ثانوية بلبلا', type: 'lycee' },
  { fr: 'Lycée Français de Djibouti', ar: 'الثانوية الفرنسية بجيبوتي', type: 'lycee' },
  { fr: 'Université de Djibouti', ar: 'جامعة جيبوتي', type: 'universite' },
  { fr: 'Institut Supérieur des Sciences de la Santé', ar: 'المعهد العالي لعلوم الصحة', type: 'universite' }
]

async function upsertUser({ email, phone, role, name, locale = 'fr' }) {
  const existing = await User.findOne({ email })
  if (existing) return existing
  return User.create({
    name,
    email,
    phone,
    role,
    locale,
    passwordHash: await hashPassword(config.seedPassword)
  })
}

async function main() {
  await connectDb()
  registerEvents()

  const admin = await upsertUser({
    email: 'admin@dj-arene.com',
    phone: '+25377000001',
    role: 'admin',
    name: 'Amina Directrice'
  })
  await upsertUser({
    email: 'staff@dj-arene.com',
    phone: '+25377000002',
    role: 'staff',
    name: 'Omar Accueil'
  })
  await upsertUser({
    email: 'candidate@example.dj',
    phone: '+25377000003',
    role: 'candidate',
    name: 'Fatouma Candidate'
  })

  for (const school of SCHOOLS) {
    const slug = school.fr
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    await School.findOneAndUpdate(
      { slug },
      {
        slug,
        name: { fr: school.fr, ar: school.ar },
        type: school.type,
        city: 'Djibouti',
        isVerified: true,
        source: 'import'
      },
      { upsert: true, new: true }
    )
  }

  const now = new Date()
  const edition = await Edition.findOneAndUpdate(
    { slug: 'edition-2026' },
    {
      slug: 'edition-2026',
      title: { fr: 'Seul contre tous', ar: 'واحد ضد الجميع' },
      description: {
        fr: 'Le tournoi de duels 1v1 réservé aux élèves et étudiants de Djibouti qui tiennent leurs résultats scolaires.',
        ar: 'بطولة المبارزات الفردية المخصصة لتلاميذ وطلبة جيبوتي المتفوقين دراسيًا.'
      },
      season: '1',
      status: 'registration_open',
      registrationOpensAt: new Date(now.getTime() - 3 * 86400000),
      registrationClosesAt: new Date(now.getTime() + 30 * 86400000),
      /*
       * Dates du tournoi. Elles comptent desormais : c'est `startsAt` qui separe
       * les rendez-vous administratifs (avant) des sessions de jeu (apres), et
       * qui ferme les encaissements. Qualifications sur deux jours, finale le
       * troisieme.
       */
      startsAt: new Date(now.getTime() + 37 * 86400000),
      endsAt: new Date(now.getTime() + 39 * 86400000),
      capacity: {
        lycee: { striker: 200, defender: 200 },
        universite: { striker: 150, defender: 150 }
      },
      fee: 1000,
      ageCategories: ['lycee', 'universite'],
      rules: { gradeThreshold: 12, requiresOriginalBulletin: true },
      venue: {
        name: 'Stade du Ville Djibouti',
        address: 'Avenue Nasser',
        city: 'Djibouti',
        mapUrl: 'https://maps.google.com/?q=Stade+du+Ville+Djibouti'
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  /*
   * Deux grilles distinctes, une semaine d'ecart.
   *
   * Les rendez-vous administratifs (identite, contrat, encaissement) se tiennent
   * aux jours 29-30, soit au plus tard sept jours avant le coup d'envoi du jour
   * 37. Les sessions de jeu occupent les jours 37 et 38 — le jour 39 est garde
   * pour la finale, qui n'a pas de session : ses rencontres se composent a
   * l'echelle de l'edition depuis le classement.
   *
   * Une session porte un plafond par role : les rencontres opposent un buteur a
   * un defenseur, une session qui n'aurait qu'un camp n'en produirait aucune.
   */
  const slotPlan = [
    { kind: 'checkin', label: 'Validation — Lycée, matin', ageCategory: 'lycee', day: 29, hour: 8 },
    { kind: 'checkin', label: 'Validation — Lycée, après-midi', ageCategory: 'lycee', day: 29, hour: 15 },
    { kind: 'checkin', label: 'Validation — Université, matin', ageCategory: 'universite', day: 30, hour: 8 },
    { kind: 'checkin', label: 'Validation — Université, après-midi', ageCategory: 'universite', day: 30, hour: 15 },
    { kind: 'competition', label: 'Qualifications — Lycée, matin', ageCategory: 'lycee', day: 37, hour: 8 },
    { kind: 'competition', label: 'Qualifications — Lycée, après-midi', ageCategory: 'lycee', day: 37, hour: 16 },
    { kind: 'competition', label: 'Qualifications — Université, matin', ageCategory: 'universite', day: 38, hour: 8 },
    { kind: 'competition', label: 'Qualifications — Université, après-midi', ageCategory: 'universite', day: 38, hour: 16 }
  ]

  for (const plan of slotPlan) {
    const competition = plan.kind === 'competition'
    const startsAt = new Date(now.getTime() + plan.day * 86400000)
    startsAt.setHours(plan.hour, 0, 0, 0)
    const endsAt = new Date(startsAt.getTime() + 4 * 3600000)
    await Slot.findOneAndUpdate(
      { editionId: edition._id, label: plan.label },
      {
        editionId: edition._id,
        kind: plan.kind,
        label: plan.label,
        ageCategory: plan.ageCategory,
        startsAt,
        endsAt,
        capacity: competition
          ? { total: 40, striker: 20, defender: 20 }
          : { total: 50, striker: 0, defender: 0 },
        pitches: competition ? 2 : 1,
        venue: edition.venue.name,
        status: 'planned'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  }

  await Gallery.findOneAndUpdate(
    { editionId: edition._id, slug: 'ouverture-2026' },
    {
      editionId: edition._id,
      slug: 'ouverture-2026',
      title: { fr: 'Journée d’ouverture', ar: 'يوم الافتتاح' },
      description: {
        fr: 'Les premières images du tournoi.',
        ar: 'أولى صور البطولة.'
      },
      isPublished: true,
      publishedAt: new Date()
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  for (const [key, template] of Object.entries(DEFAULT_TEMPLATES)) {
    await NotificationTemplate.findOneAndUpdate(
      { key },
      { key, ...template },
      { upsert: true, setDefaultsOnInsert: true }
    )
  }

  logger.info(
    {
      admin: admin.email,
      motDePasse: config.seedPassword,
      edition: edition.slug,
      creneaux: slotPlan.length,
      ecoles: SCHOOLS.length
    },
    'jeu de démonstration en place'
  )

  await disconnectDb()
  process.exit(0)
}

main().catch(async (error) => {
  logger.error({ err: error }, 'seed impossible')
  await disconnectDb().catch(() => null)
  process.exit(1)
})

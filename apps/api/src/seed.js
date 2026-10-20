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
 * Jeu de démonstration : un administrateur, un staff, un parent,
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

async function upsertUser({ email, phone, role, firstName, lastName, locale = 'fr' }) {
  const existing = await User.findOne({ email })
  if (existing) return existing
  return User.create({
    firstName,
    lastName,
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
    firstName: 'Amina',
    lastName: 'Directrice'
  })
  await upsertUser({
    email: 'staff@dj-arene.com',
    phone: '+25377000002',
    role: 'staff',
    firstName: 'Omar',
    lastName: 'Accueil'
  })
  await upsertUser({
    email: 'parent@example.dj',
    phone: '+25377000003',
    role: 'parent',
    firstName: 'Fatouma',
    lastName: 'Parent'
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
      title: { fr: "L'Arène 2026", ar: 'الحلبة 2026' },
      description: {
        fr: 'Le tournoi de duels 1v1 réservé aux élèves et étudiants de Djibouti qui tiennent leurs résultats scolaires.',
        ar: 'بطولة المبارزات الفردية المخصصة لتلاميذ وطلبة جيبوتي المتفوقين دراسيًا.'
      },
      season: '2026',
      status: 'registration_open',
      registrationOpensAt: new Date(now.getTime() - 3 * 86400000),
      registrationClosesAt: new Date(now.getTime() + 30 * 86400000),
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

  const slotPlan = [
    { label: 'Samedi matin — Lycée', ageCategory: 'lycee', day: 7, hour: 8 },
    { label: 'Samedi après-midi — Lycée', ageCategory: 'lycee', day: 7, hour: 15 },
    { label: 'Dimanche matin — Université', ageCategory: 'universite', day: 8, hour: 8 },
    { label: 'Dimanche après-midi — Université', ageCategory: 'universite', day: 8, hour: 15 }
  ]

  for (const plan of slotPlan) {
    const startsAt = new Date(now.getTime() + plan.day * 86400000)
    startsAt.setHours(plan.hour, 0, 0, 0)
    const endsAt = new Date(startsAt.getTime() + 4 * 3600000)
    await Slot.findOneAndUpdate(
      { editionId: edition._id, label: plan.label },
      {
        editionId: edition._id,
        label: plan.label,
        ageCategory: plan.ageCategory,
        startsAt,
        endsAt,
        capacity: { striker: 50, defender: 50 },
        pitches: 2,
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

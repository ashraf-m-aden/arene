/**
 * Constantes partagées API ↔ front.
 * Toute valeur énumérée du modèle de données vit ici et nulle part ailleurs.
 */

export const LOCALES = /** @type {const} */ (['fr', 'ar'])
export const DEFAULT_LOCALE = 'fr'
export const LOCALE_DIR = { fr: 'ltr', ar: 'rtl' }

export const USER_ROLES = /** @type {const} */ (['admin', 'staff', 'candidate'])

export const AGE_CATEGORIES = /** @type {const} */ (['lycee', 'universite'])

/** Bornes d'âge par catégorie, inclusives. Le cas des 18 ans est tranché par l'établissement. */
export const AGE_RANGES = {
  lycee: { min: 15, max: 18 },
  universite: { min: 18, max: 23 }
}

export const PLAYER_ROLES = /** @type {const} */ (['striker', 'defender'])

export const SCHOOL_TYPES = /** @type {const} */ (['lycee', 'universite'])

export const EDITION_STATUSES = /** @type {const} */ ([
  'draft',
  'announced',
  'registration_open',
  'registration_closed',
  'qualifiers',
  'finals',
  'completed',
  'archived'
])

/** Transitions autorisées d'un statut d'édition vers un autre (changement manuel admin). */
export const EDITION_TRANSITIONS = {
  draft: ['announced'],
  announced: ['registration_open', 'draft'],
  registration_open: ['registration_closed'],
  registration_closed: ['qualifiers', 'registration_open'],
  qualifiers: ['finals'],
  finals: ['completed'],
  completed: ['archived'],
  archived: []
}

export const REGISTRATION_STATUSES = /** @type {const} */ ([
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'changes_requested',
  'scheduled',
  'checked_in',
  'no_show',
  'eliminated',
  'qualified',
  'finalist',
  'disqualified'
])

export const REGISTRATION_TRANSITIONS = {
  draft: ['submitted'],
  submitted: ['under_review', 'approved', 'rejected', 'changes_requested'],
  under_review: ['approved', 'rejected', 'changes_requested'],
  changes_requested: ['submitted'],
  approved: ['scheduled', 'disqualified'],
  scheduled: ['checked_in', 'no_show', 'disqualified'],
  checked_in: ['eliminated', 'qualified', 'disqualified'],
  qualified: ['finalist', 'eliminated', 'disqualified'],
  finalist: ['eliminated', 'disqualified'],
  eliminated: [],
  rejected: [],
  no_show: [],
  disqualified: []
}

/**
 * Seuil de remplissage a partir duquel les places restantes deviennent publiques.
 *
 * En dessous, les candidats et les visiteurs ne voient aucun chiffre : afficher
 * « 180 places libres » au lancement ne dit rien a personne et laisse croire que
 * l'inscription peut attendre. Le compte a rebours n'apparait qu'au moment ou la
 * rarete est reelle, categorie par categorie.
 */
export const SEATS_REVEAL_RATIO = 0.9

/** Statuts qui occupent une place dans le plafond d'une édition. */
export const SEAT_HOLDING_STATUSES = [
  'approved',
  'scheduled',
  'checked_in',
  'eliminated',
  'qualified',
  'finalist'
]

export const SLOT_STATUSES = /** @type {const} */ (['planned', 'open', 'closed', 'cancelled'])

export const MATCH_PHASES = /** @type {const} */ (['qualification', 'finale'])

export const ATTEMPT_OUTCOMES = /** @type {const} */ (['goal', 'stop'])

/** Nombre de tentatives par rencontre et nombre d'adversaires en qualification. */
export const ATTEMPTS_PER_MATCH = 5
export const OPPONENTS_PER_STRIKER = 3
export const FINALISTS_PER_ROLE = 2

export const FILE_KINDS = /** @type {const} */ (['bulletin', 'photo', 'media'])
export const FILE_VISIBILITIES = /** @type {const} */ (['private', 'public'])

export const NOTIFICATION_CHANNELS = /** @type {const} */ (['email', 'whatsapp'])
export const NOTIFICATION_STATUSES = /** @type {const} */ ([
  'queued',
  'sending',
  'sent',
  'delivered',
  'read',
  'failed'
])

/**
 * Raisons pour lesquelles une adresse ou un numéro ne doit plus être contacté.
 * `bounce` et `complaint` viennent des évènements SES ; `manual` est posé par l'admin.
 */
export const SUPPRESSION_REASONS = /** @type {const} */ (['bounce', 'complaint', 'manual'])

/** Modèles de messages prévus en v1 (clé → canaux par défaut). */
export const NOTIFICATION_TEMPLATES = {
  registration_received: ['email', 'whatsapp'],
  registration_changes_requested: ['email', 'whatsapp'],
  registration_approved: ['email', 'whatsapp'],
  registration_rejected: ['email'],
  slot_assigned: ['email', 'whatsapp'],
  slot_reminder: ['whatsapp'],
  registration_qualified: ['email', 'whatsapp'],
  broadcast: ['email']
}

/** Barème du classement des écoles (validé dans la documentation technique). */
export const SCHOOL_POINTS = {
  checkedIn: 1,
  qualificationWin: 2,
  finalist: 5,
  podium: [15, 10, 6],
  champion: 25
}

export const DEFAULT_GRADE_THRESHOLD = 12
export const MAX_BULLETIN_SIZE = 10 * 1024 * 1024
export const CURRENCY = 'DJF'

export const EVENTS = /** @type {const} */ ([
  'registration.submitted',
  'registration.approved',
  'registration.rejected',
  'registration.changes_requested',
  'registration.checked_in',
  'registration.qualified',
  'slot.assigned',
  'result.recorded',
  'gallery.published'
])

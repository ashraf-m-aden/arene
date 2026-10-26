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
  /*
   * `no_show` au depart de `checked_in` : l'inscription est scellee une semaine
   * avant le tournoi, donc un inscrit peut parfaitement ne pas se presenter le
   * jour du jeu — il a signe et paye, mais sa session se tient sept jours plus
   * tard. Tant que les deux moments etaient confondus, le cas n'existait pas.
   */
  checked_in: ['eliminated', 'qualified', 'disqualified', 'no_show'],
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

/**
 * Nature d'un rendez-vous. Les deux ne se tiennent ni le meme jour ni au meme
 * endroit, et ne portent pas les memes gens.
 *
 * - `checkin` : rendez-vous administratif — controle d'identite, signature du
 *   contrat papier, encaissement, dossard. Il se tient *avant* le tournoi
 *   (voir `CHECKIN_LEAD_TIME_DAYS`) et consomme des dossiers `scheduled`.
 * - `competition` : session de jeu — les rencontres y sont generees. Les joueurs
 *   y arrivent deja inscrits (`checked_in`) : on ne verifie plus rien, on joue.
 *
 * Confondre les deux obligeait a encaisser le matin du tournoi, devant 200
 * personnes et un terrain qui attend.
 */
export const SLOT_KINDS = /** @type {const} */ (['checkin', 'competition'])

/**
 * Delai entre la fin des rendez-vous administratifs et le debut du tournoi.
 *
 * Les validations, signatures et encaissements se terminent une semaine avant
 * le premier duel : le jour J, il ne reste qu'a jouer. Sert de defaut a la
 * repartition automatique et de reference a `checkinDeadline`.
 */
export const CHECKIN_LEAD_TIME_DAYS = 7

export const MATCH_PHASES = /** @type {const} */ (['qualification', 'barrage', 'finale'])

export const ATTEMPT_OUTCOMES = /** @type {const} */ (['goal', 'stop'])

/** Nombre de tentatives par rencontre et nombre d'adversaires en qualification. */
export const ATTEMPTS_PER_MATCH = 5
export const OPPONENTS_PER_STRIKER = 3

/**
 * Barrage : tour intermediaire entre la qualification et la finale.
 *
 * En qualification chaque buteur n'affronte que 3 defenseurs sur l'effectif
 * complet : a 50 joueurs par role, les lots d'adversaires sont tres inegaux et
 * le maximum (15 points) est atteint par plusieurs joueurs. Classer directement
 * les deux premiers reviendrait a trancher au tirage au sort. Le barrage reprend
 * les meilleurs de chaque role dans un tableau ferme, ou tous rencontrent la
 * meme opposition, et c'est lui qui designe les finalistes.
 */
export const BARRAGE_PER_ROLE = 8
export const BARRAGE_OPPONENTS = 4

export const FINALISTS_PER_ROLE = 2

export const FILE_KINDS = /** @type {const} */ (['bulletin', 'photo', 'media'])
export const FILE_VISIBILITIES = /** @type {const} */ (['private', 'public'])

export const NOTIFICATION_CHANNELS = /** @type {const} */ (['email'])
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
  registration_received: ['email'],
  registration_changes_requested: ['email'],
  registration_approved: ['email'],
  registration_rejected: ['email'],
  slot_assigned: ['email'],
  slot_reminder: ['email'],
  /*
   * Convocation a la session de jeu. Distincte de `slot_assigned` : celle-la
   * annonce le rendez-vous administratif et reclame les frais en especes, ce
   * qui n'a plus de sens une semaine plus tard, quand tout est deja paye.
   */
  session_assigned: ['email'],
  session_reminder: ['email'],
  registration_qualified: ['email'],
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

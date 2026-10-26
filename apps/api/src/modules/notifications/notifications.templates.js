/**
 * Modèles livrés avec la v1. Ils servent de valeurs par défaut :
 * l'admin peut les surcharger en base.
 *
 * Les messages s'adressent au candidat lui-meme : il est titulaire de son dossier,
 * il n'y a pas de parent destinataire. Le telephone du parent, quand il existe,
 * n'est qu'un contact de secours pour l'organisation.
 *
 * Variables disponibles : {{prenom}}, {{edition}}, {{motif}}, {{date}}, {{lieu}},
 * {{frais}}, {{lien}}. ({{creneau}} reste fourni mais n'est plus employe :
 * le candidat ne connait que la date et l'heure de son rendez-vous, pas la grille.)
 */
export const DEFAULT_TEMPLATES = {
  registration_received: {
    channels: ['email'],
    subject: {
      fr: 'Dossier bien reçu — {{edition}}',
      ar: 'تم استلام الملف — {{edition}}'
    },
    body: {
      fr: 'Bonjour {{prenom}}, votre dossier pour {{edition}} nous est bien parvenu. Nous revenons vers vous après vérification. Suivi : {{lien}}',
      ar: 'مرحبًا {{prenom}}، لقد استلمنا ملفكم الخاص بـ {{edition}}. سنتواصل معكم بعد التحقق. المتابعة: {{lien}}'
    }
  },
  registration_changes_requested: {
    channels: ['email'],
    subject: { fr: 'Correction demandée — {{edition}}', ar: 'طلب تصحيح — {{edition}}' },
    body: {
      fr: '{{prenom}}, votre dossier demande une correction : {{motif}}. Reprenez le formulaire ici : {{lien}}',
      ar: '{{prenom}}، ملفكم يحتاج إلى تصحيح: {{motif}}. يمكنكم استئناف الاستمارة هنا: {{lien}}'
    }
  },
  registration_approved: {
    channels: ['email'],
    subject: { fr: 'Dossier accepté — {{edition}}', ar: 'تم قبول الملف — {{edition}}' },
    body: {
      fr: 'Bonne nouvelle {{prenom}} : votre dossier est accepté. Votre convocation arrive avec la date de votre rendez-vous et votre badge. {{lien}}',
      ar: 'خبر سار {{prenom}}: تم قبول ملفكم. ستصلكم الدعوة مع موعدكم وبطاقتكم. {{lien}}'
    }
  },
  registration_rejected: {
    channels: ['email'],
    subject: { fr: 'Dossier refusé — {{edition}}', ar: 'تم رفض الملف — {{edition}}' },
    body: {
      fr: '{{prenom}}, votre dossier n’a pas été retenu. Motif : {{motif}}. Vous pouvez nous écrire pour toute question.',
      ar: '{{prenom}}، لم يتم قبول ملفكم. السبب: {{motif}}. يمكنكم مراسلتنا لأي استفسار.'
    }
  },
  slot_assigned: {
    channels: ['email'],
    subject: { fr: 'Convocation — {{edition}}', ar: 'دعوة — {{edition}}' },
    body: {
      fr: '{{prenom}}, votre rendez-vous est fixé au {{date}}, à {{lieu}}. Frais à régler en espèces à l’accueil : {{frais}} DJF. Badge et documents : {{lien}}',
      ar: '{{prenom}}، موعدكم يوم {{date}} في {{lieu}}. الرسوم تُدفع نقدًا عند الاستقبال: {{frais}} فرنك. البطاقة والوثائق: {{lien}}'
    }
  },
  slot_reminder: {
    channels: ['email'],
    subject: { fr: 'Rappel de convocation', ar: 'تذكير بالدعوة' },
    body: {
      fr: 'Rappel {{prenom}} : nous vous attendons demain à {{lieu}}. Pensez à votre badge, votre pièce d’identité, votre bulletin original et aux {{frais}} DJF.',
      ar: 'تذكير {{prenom}}: ننتظركم غدًا في {{lieu}}. لا تنسوا بطاقتكم وهويتكم وكشف درجاتكم الأصلي و{{frais}} فرنك.'
    }
  },
  /*
   * Session de jeu. Ni frais ni piece d'identite a rappeler : tout cela a ete
   * fait au rendez-vous administratif, une semaine plus tot. Le joueur n'a plus
   * besoin que de son dossard et de son horaire.
   */
  session_assigned: {
    channels: ['email'],
    subject: { fr: 'Votre session de jeu — {{edition}}', ar: 'موعد مباراتكم — {{edition}}' },
    body: {
      fr: '{{prenom}}, vous jouez le {{date}}, à {{lieu}}. Votre inscription est déjà validée : venez avec votre dossard. Détails : {{lien}}',
      ar: '{{prenom}}، تلعبون يوم {{date}} في {{lieu}}. تسجيلكم مُثبَّت بالفعل: أحضروا رقمكم. التفاصيل: {{lien}}'
    }
  },
  session_reminder: {
    channels: ['email'],
    subject: { fr: 'Rappel — vous jouez demain', ar: 'تذكير — تلعبون غدًا' },
    body: {
      fr: 'Rappel {{prenom}} : vous jouez demain à {{lieu}}. Pensez à votre dossard et à une tenue de sport.',
      ar: 'تذكير {{prenom}}: تلعبون غدًا في {{lieu}}. لا تنسوا رقمكم ولباسًا رياضيًا.'
    }
  },
  registration_qualified: {
    channels: ['email'],
    subject: { fr: 'Qualification pour la finale — {{edition}}', ar: 'التأهل للنهائي — {{edition}}' },
    body: {
      fr: 'Bravo {{prenom}} : vous êtes qualifié pour la finale de {{edition}}. Détails de la finale : {{lien}}',
      ar: 'تهانينا {{prenom}}: تأهلتم إلى نهائي {{edition}}. تفاصيل النهائي: {{lien}}'
    }
  },
  password_reset: {
    channels: ['email'],
    subject: { fr: 'Réinitialiser votre mot de passe', ar: 'إعادة تعيين كلمة المرور' },
    body: {
      fr: 'Bonjour {{prenom}}, voici le lien pour choisir un nouveau mot de passe : {{lien}} (valable 1 heure).',
      ar: 'مرحبًا {{prenom}}، هذا رابط اختيار كلمة مرور جديدة: {{lien}} (صالح لمدة ساعة).'
    }
  },
  broadcast: {
    channels: ['email'],
    subject: { fr: '{{sujet}}', ar: '{{sujet}}' },
    body: { fr: '{{message}}', ar: '{{message}}' }
  }
}

/** Remplace les variables {{clé}} par leur valeur. */
export function renderTemplate(text = '', variables = {}) {
  return String(text).replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) =>
    variables[key] === undefined || variables[key] === null ? '' : String(variables[key])
  )
}

/**
 * Modèles livrés avec la v1. Ils servent de valeurs par défaut :
 * l'admin peut les surcharger en base, et les variantes WhatsApp doivent
 * correspondre à un modèle pré-approuvé par Meta (`metaTemplateName`).
 *
 * Variables disponibles : {{prenom}}, {{edition}}, {{motif}}, {{creneau}},
 * {{date}}, {{lieu}}, {{frais}}, {{lien}}, {{code}}.
 */
export const DEFAULT_TEMPLATES = {
  registration_received: {
    channels: ['email', 'whatsapp'],
    metaTemplateName: 'gm_dossier_recu',
    subject: {
      fr: 'Dossier bien reçu — {{edition}}',
      ar: 'تم استلام الملف — {{edition}}'
    },
    body: {
      fr: 'Bonjour, le dossier de {{prenom}} pour {{edition}} nous est bien parvenu. Nous revenons vers vous après vérification. Suivi : {{lien}}',
      ar: 'مرحبًا، لقد استلمنا ملف {{prenom}} الخاص بـ {{edition}}. سنتواصل معكم بعد التحقق. المتابعة: {{lien}}'
    }
  },
  registration_changes_requested: {
    channels: ['email', 'whatsapp'],
    metaTemplateName: 'gm_correction_demandee',
    subject: { fr: 'Correction demandée — {{edition}}', ar: 'طلب تصحيح — {{edition}}' },
    body: {
      fr: 'Le dossier de {{prenom}} demande une correction : {{motif}}. Reprenez le formulaire ici : {{lien}}',
      ar: 'ملف {{prenom}} يحتاج إلى تصحيح: {{motif}}. يمكنكم استئناف الاستمارة هنا: {{lien}}'
    }
  },
  registration_approved: {
    channels: ['email', 'whatsapp'],
    metaTemplateName: 'gm_dossier_accepte',
    subject: { fr: 'Dossier accepté — {{edition}}', ar: 'تم قبول الملف — {{edition}}' },
    body: {
      fr: 'Bonne nouvelle : le dossier de {{prenom}} est accepté. Votre convocation arrive avec le créneau et le badge. {{lien}}',
      ar: 'خبر سار: تم قبول ملف {{prenom}}. ستصلكم الدعوة مع الموعد والبطاقة. {{lien}}'
    }
  },
  registration_rejected: {
    channels: ['email'],
    subject: { fr: 'Dossier refusé — {{edition}}', ar: 'تم رفض الملف — {{edition}}' },
    body: {
      fr: 'Le dossier de {{prenom}} n’a pas été retenu. Motif : {{motif}}. Vous pouvez nous écrire pour toute question.',
      ar: 'لم يتم قبول ملف {{prenom}}. السبب: {{motif}}. يمكنكم مراسلتنا لأي استفسار.'
    }
  },
  slot_assigned: {
    channels: ['email', 'whatsapp'],
    metaTemplateName: 'gm_convocation',
    subject: { fr: 'Convocation — {{edition}}', ar: 'دعوة — {{edition}}' },
    body: {
      fr: 'Convocation de {{prenom}} : {{creneau}}, le {{date}} à {{lieu}}. Frais à régler en espèces à l’accueil : {{frais}} DJF. Badge et documents : {{lien}}',
      ar: 'دعوة {{prenom}}: {{creneau}}، يوم {{date}} في {{lieu}}. الرسوم تُدفع نقدًا عند الاستقبال: {{frais}} فرنك. البطاقة والوثائق: {{lien}}'
    }
  },
  slot_reminder: {
    channels: ['whatsapp'],
    metaTemplateName: 'gm_rappel_convocation',
    subject: { fr: 'Rappel de convocation', ar: 'تذكير بالدعوة' },
    body: {
      fr: 'Rappel : {{prenom}} est attendu demain, {{creneau}}, à {{lieu}}. Pensez au badge, à la pièce d’identité, au bulletin original et aux {{frais}} DJF.',
      ar: 'تذكير: {{prenom}} منتظر غدًا، {{creneau}}، في {{lieu}}. لا تنسوا البطاقة والهوية وكشف الدرجات الأصلي و{{frais}} فرنك.'
    }
  },
  registration_qualified: {
    channels: ['email', 'whatsapp'],
    metaTemplateName: 'gm_qualification_finale',
    subject: { fr: 'Qualification pour la finale — {{edition}}', ar: 'التأهل للنهائي — {{edition}}' },
    body: {
      fr: 'Bravo : {{prenom}} est qualifié pour la finale de {{edition}}. Détails de la finale : {{lien}}',
      ar: 'تهانينا: تأهل {{prenom}} إلى نهائي {{edition}}. تفاصيل النهائي: {{lien}}'
    }
  },
  otp_code: {
    channels: ['whatsapp'],
    metaTemplateName: 'gm_code_connexion',
    subject: { fr: 'Code de connexion', ar: 'رمز الدخول' },
    body: {
      fr: "Votre code de connexion à l'Arène : {{code}}. Il expire dans 10 minutes.",
      ar: 'رمز الدخول الخاص بكم: {{code}}. تنتهي صلاحيته خلال 10 دقائق.'
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

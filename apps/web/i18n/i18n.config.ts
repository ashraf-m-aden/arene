import baseFr from '../layers/base/locales/fr.json'
import baseAr from '../layers/base/locales/ar.json'
import legalFr from '../layers/base/locales/legal.fr.json'
import legalAr from '../layers/base/locales/legal.ar.json'
import editionsFr from '../layers/editions/locales/fr.json'
import editionsAr from '../layers/editions/locales/ar.json'
import registrationsFr from '../layers/registrations/locales/fr.json'
import registrationsAr from '../layers/registrations/locales/ar.json'
import schoolsFr from '../layers/schools/locales/fr.json'
import schoolsAr from '../layers/schools/locales/ar.json'
import slotsFr from '../layers/slots/locales/fr.json'
import slotsAr from '../layers/slots/locales/ar.json'
import resultsFr from '../layers/results/locales/fr.json'
import resultsAr from '../layers/results/locales/ar.json'
import galleriesFr from '../layers/galleries/locales/fr.json'
import galleriesAr from '../layers/galleries/locales/ar.json'
import adminFr from '../layers/admin/locales/fr.json'
import adminAr from '../layers/admin/locales/ar.json'

/**
 * Chaque layer porte ses traductions ; elles sont fusionnées ici au build.
 * Le calendrier reste grégorien, les chiffres restent occidentaux.
 */
export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: 'fr',
  messages: {
    fr: {
      ...baseFr,
      ...legalFr,
      ...editionsFr,
      ...registrationsFr,
      ...schoolsFr,
      ...slotsFr,
      ...resultsFr,
      ...galleriesFr,
      ...adminFr
    },
    ar: {
      ...baseAr,
      ...legalAr,
      ...editionsAr,
      ...registrationsAr,
      ...schoolsAr,
      ...slotsAr,
      ...resultsAr,
      ...galleriesAr,
      ...adminAr
    }
  },
  numberFormats: {
    fr: { currency: { style: 'currency', currency: 'DJF', maximumFractionDigits: 0 } },
    ar: {
      currency: {
        style: 'currency',
        currency: 'DJF',
        maximumFractionDigits: 0,
        numberingSystem: 'latn'
      }
    }
  },
  datetimeFormats: {
    fr: {
      short: { dateStyle: 'medium' },
      long: { dateStyle: 'full', timeStyle: 'short' }
    },
    ar: {
      short: { dateStyle: 'medium', calendar: 'gregory', numberingSystem: 'latn' },
      long: { dateStyle: 'full', timeStyle: 'short', calendar: 'gregory', numberingSystem: 'latn' }
    }
  }
}))

import { z } from 'zod'

/**
 * Corps d'une suppression définitive — dossier ou compte.
 *
 * Trois garde-fous, et chacun a sa raison :
 *
 * - `reason` est obligatoire et un peu longue. Le document disparaît : le
 *   journal d'audit est la seule trace qui restera, et « test » n'y apprendra
 *   rien à celui qui l'ouvrira dans six mois.
 * - `confirm` doit reprendre mot pour mot la référence que l'API annonce dans
 *   l'aperçu d'impact (numéro de dossier, email du compte). Une confirmation
 *   gardée côté écran seulement n'est qu'un décor : `curl` la contourne. C'est
 *   le serveur qui compare, et c'est ce qui rend l'appel difficile à lancer par
 *   accident sur le mauvais identifiant.
 * - `force` ne lève que les blocages qui relèvent d'un arbitrage — un dossier
 *   qui a joué, des frais encaissés. Les blocages structurels (se supprimer
 *   soi-même, le dernier administrateur, un compte qui porte l'histoire des
 *   dossiers d'autrui) ne se forcent pas.
 */
export const deletionSchema = z.object({
  reason: z.string().trim().min(10, { message: 'un motif d’au moins 10 caractères' }).max(500),
  confirm: z.string().trim().min(1).max(200),
  force: z.coerce.boolean().default(false)
})

/** Recherche de comptes pour l'écran d'administration. */
export const userQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(['admin', 'staff', 'candidate']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25)
})


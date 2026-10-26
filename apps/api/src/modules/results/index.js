import router, {
  barrageRouter,
  editionMatchesRouter,
  finalsRouter,
  rankingsRouter,
  slotRouter
} from './results.routes.js'
import * as service from './results.service.js'

export {
  router,
  service,
  barrageRouter,
  editionMatchesRouter,
  finalsRouter,
  rankingsRouter,
  slotRouter
}
export default { router, service }

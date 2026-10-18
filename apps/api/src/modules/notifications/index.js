import router, { templatesRouter } from './notifications.routes.js'
import * as service from './notifications.service.js'
import registerNotificationEvents from './notifications.events.js'

export { router, service, templatesRouter, registerNotificationEvents }
export default { router, service }

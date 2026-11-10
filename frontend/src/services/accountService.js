import { persistentService } from './persistentService.js'
import { apiService } from './apiService.js'
// Profile/preferences/insight operations retain Phase 3 RLS-scoped access.
// Financial and notification operations always use the backend, never demo.
export const accountService={...persistentService,subscriptions:apiService.subscriptions,transactions:apiService.transactions,notifications:apiService.notifications}

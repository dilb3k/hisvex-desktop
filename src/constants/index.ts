export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://hisvex-api-production.up.railway.app/api'

// Backup (Render) — same backend codebase deployed a second time against the
// same MongoDB Atlas cluster as primary. See api/client.ts for the
// auto-failover logic that switches to this when primary is unreachable.
export const API_BACKUP_URL = import.meta.env.VITE_API_BACKUP_URL || 'https://hisvex-api.onrender.com/api'

export const BUSINESS_DAY_START_HOUR = Number(import.meta.env.VITE_BUSINESS_DAY_START_HOUR) || 6

export const STORAGE_KEYS = {
  TOKEN: 'token',
  USER: 'user',
  THEME: 'theme',
  LANGUAGE: 'language',
  LAST_SYNC: 'last_sync',
  WINDOW_BOUNDS: 'windowBounds',
} as const

import { useAuth } from '../../hooks/useAuth'

const ROLE_ORDER = { guest: 0, user: 1, city_official: 2, admin: 3 }

/**
 * Renders children only if the current user's role meets `minRole`.
 * Renders `fallback` (or nothing) otherwise.
 */
export function RoleGuard({ minRole = 'user', fallback = null, children }) {
  const { role } = useAuth()
  const hasAccess = (ROLE_ORDER[role] ?? 0) >= (ROLE_ORDER[minRole] ?? 0)
  return hasAccess ? children : fallback
}

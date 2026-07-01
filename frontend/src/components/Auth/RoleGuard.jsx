import { useAuth } from '../../hooks/useAuth'
import { hasRole } from '../../lib/permissions'

/**
 * Renders children if the user meets `permission` or `minRole` requirement.
 * When `permission` is set it takes precedence over `minRole`.
 */
export function RoleGuard({ minRole = 'user', permission = null, fallback = null, children }) {
  const { role, hasPermission } = useAuth()
  const hasAccess = permission
    ? hasPermission(permission)
    : hasRole(role, minRole)
  return hasAccess ? children : fallback
}

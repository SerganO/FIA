/** Mirrors supabase/migrations/027_rbac_permissions.sql seeds */

export const ROLE_ORDER = { guest: 0, user: 1, city_official: 2, admin: 3 }

export const ROLE_PERMISSIONS = {
  guest: ['map.read'],
  user: [
    'map.read', 'proposals.create', 'proposals.submit', 'proposals.delete.own',
    'hazards.report', 'votes.cast', 'comments.write',
  ],
  city_official: [
    'map.read', 'proposals.create', 'proposals.submit', 'proposals.review',
    'proposals.delete.own', 'hazards.report', 'hazards.review', 'votes.cast', 'comments.write',
  ],
  admin: [
    'map.read', 'proposals.create', 'proposals.submit', 'proposals.review',
    'proposals.delete.own', 'proposals.delete.any', 'hazards.report', 'hazards.review',
    'votes.cast', 'comments.write', 'admin.ml', 'admin.import', 'admin.users',
  ],
}

export function hasRole(role, minRole) {
  return (ROLE_ORDER[role] ?? 0) >= (ROLE_ORDER[minRole] ?? 0)
}

export function hasPermission(role, permission) {
  return (ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.guest).includes(permission)
}

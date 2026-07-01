import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-hot-toast'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { RoleGuard } from '../Auth/RoleGuard'

const ROLES = ['guest', 'user', 'city_official', 'admin']

export function UserManagement() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [draftRoles, setDraftRoles] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)

  async function loadProfiles() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, role, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      setProfiles(data ?? [])
      const drafts = {}
      for (const p of data ?? []) drafts[p.id] = p.role
      setDraftRoles(drafts)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadProfiles() }, [])

  async function saveRole(profileId) {
    const newRole = draftRoles[profileId]
    if (profileId === user?.id && newRole !== 'admin') {
      toast.error(t('admin.users.cannotDemoteSelf'))
      return
    }
    setSavingId(profileId)
    try {
      const { error } = await supabase.rpc('set_user_role', {
        target_id: profileId,
        new_role: newRole,
      })
      if (error) throw error
      toast.success(t('admin.users.roleUpdated'))
      loadProfiles()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <RoleGuard permission="admin.users">
      <div className="admin-section">
        <h3 className="admin-section-title">{t('admin.users.title')}</h3>
        <p className="admin-section-hint">{t('admin.users.hint')}</p>

        {loading ? (
          <p style={{ color: 'var(--color-muted)', padding: 12 }}>{t('app.loading')}</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('admin.users.username')}</th>
                  <th>{t('admin.users.role')}</th>
                  <th>{t('admin.users.joined')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {profiles.map(p => (
                  <tr key={p.id}>
                    <td>{p.username}</td>
                    <td>
                      <select
                        value={draftRoles[p.id] ?? p.role}
                        disabled={p.id === user?.id}
                        onChange={e => setDraftRoles(prev => ({ ...prev, [p.id]: e.target.value }))}
                        style={{ fontSize: '.8rem' }}
                      >
                        {ROLES.filter(r => r !== 'guest').map(r => (
                          <option key={r} value={r}>{t(`role.${r}`)}</option>
                        ))}
                      </select>
                    </td>
                    <td>{new Date(p.created_at).toLocaleDateString()}</td>
                    <td>
                      {draftRoles[p.id] !== p.role && (
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: '.75rem', padding: '3px 8px' }}
                          disabled={savingId === p.id}
                          onClick={() => saveRole(p.id)}
                        >
                          {savingId === p.id ? t('auth.wait') : t('admin.users.save')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RoleGuard>
  )
}

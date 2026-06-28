import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { RoleGuard } from '../components/Auth/RoleGuard'
import { getModelVersions, triggerRetrain, activateModel } from '../lib/apiClient'
import toast from 'react-hot-toast'

const BASE_URL = import.meta.env.VITE_FASTAPI_URL || 'http://localhost:8000'

export function AdminPage() {
  const { t } = useTranslation()
  const [versions,   setVersions]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [retraining, setRetraining] = useState(false)
  const pollRef = useRef(null)

  async function loadVersions() {
    try {
      const v = await getModelVersions()
      setVersions(v)
    } catch {
      toast.error(t('admin.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadVersions() }, [])
  useEffect(() => () => clearInterval(pollRef.current), [])

  async function handleRetrain() {
    setRetraining(true)
    try {
      await triggerRetrain()
      toast.success(t('admin.retrainStarted'))
      const prevActive = versions.find(v => v.is_active)?.version
      let elapsed = 0
      pollRef.current = setInterval(async () => {
        elapsed += 5
        const v = await getModelVersions()
        setVersions(v)
        const nowActive = v.find(x => x.is_active)?.version
        if (nowActive && nowActive !== prevActive) {
          clearInterval(pollRef.current)
          setRetraining(false)
          toast.success(`${t('admin.retrainComplete')}: ${nowActive}`)
        } else if (elapsed >= 120) {
          clearInterval(pollRef.current)
          setRetraining(false)
        }
      }, 5000)
    } catch (err) {
      toast.error(err.message)
      setRetraining(false)
    }
  }

  async function handleActivate(version) {
    try {
      await activateModel(version)
      toast.success(`${t('admin.activated')}: ${version}`)
      loadVersions()
    } catch (err) {
      toast.error(err.message)
    }
  }

  function handleExport() {
    window.open(`${BASE_URL}/api/export_dataset`, '_blank')
  }

  return (
    <RoleGuard minRole="admin" fallback={
      <div className="admin-denied">{t('admin.denied')}</div>
    }>
      <div className="admin-page">
        <div className="admin-page-header">
          <h2>{t('admin.title')}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={handleExport}>
              ⬇ {t('admin.export')}
            </button>
            <button className="btn btn-primary" onClick={handleRetrain} disabled={retraining}>
              {retraining ? `⏳ ${t('admin.retraining')}` : `🔄 ${t('admin.retrain')}`}
            </button>
          </div>
        </div>

        {loading ? (
          <p style={{ color: 'var(--color-muted)', padding: 24 }}>{t('app.loading')}</p>
        ) : versions.length === 0 ? (
          <p style={{ color: 'var(--color-muted)', padding: 24 }}>{t('admin.noModels')}</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('admin.version')}</th>
                  <th>{t('admin.active')}</th>
                  <th>{t('admin.accuracy')}</th>
                  <th>{t('admin.f1')}</th>
                  <th>{t('admin.samples')}</th>
                  <th>{t('admin.date')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {versions.map(v => (
                  <tr key={v.version} className={v.is_active ? 'admin-row-active' : ''}>
                    <td><code>{v.version}</code></td>
                    <td>{v.is_active ? '✅' : '—'}</td>
                    <td>{v.accuracy    != null ? (v.accuracy * 100).toFixed(1) + '%' : '—'}</td>
                    <td>{v.f1_score    != null ? v.f1_score.toFixed(3)          : '—'}</td>
                    <td>{v.train_samples ?? '—'}</td>
                    <td>{v.created_at ? new Date(v.created_at).toLocaleDateString() : '—'}</td>
                    <td>
                      {!v.is_active && (
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: '.75rem', padding: '3px 8px' }}
                          onClick={() => handleActivate(v.version)}
                        >
                          {t('admin.activate')}
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

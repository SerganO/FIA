import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { RoleGuard } from '../components/Auth/RoleGuard'
import { getModelVersions, triggerRetrain, activateModel, importAccidents, importBikeLanes, importCrossings, api } from '../lib/apiClient'
import toast from 'react-hot-toast'
import { UserManagement } from '../components/Admin/UserManagement'

function ImportRow({ label, accept, onImport, onRefresh }) {
  const { t } = useTranslation()
  const [busy,   setBusy]   = useState(false)
  const [result, setResult] = useState(null)
  const inputRef = useRef(null)

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setBusy(true)
    setResult(null)
    try {
      const res = await onImport(file)
      setResult(res)
      toast.success(`${t('admin.import.done')}: +${res.inserted}`)
      onRefresh?.()
    } catch (err) {
      toast.error(err?.response?.data?.detail || err.message)
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  return (
    <div className="import-row">
      <span className="import-label">{label}</span>
      <button
        className="btn btn-ghost"
        style={{ fontSize: '.8rem' }}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? `⏳ ${t('admin.import.uploading')}` : `⬆ ${t('admin.import.upload')}`}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      {result && (
        <span className="import-result">
          {result.bike_lanes != null ? (
            <>
              ✅ {t('layer.bikeLanes')}: {result.bike_lanes.inserted}&nbsp;
              · {t('admin.import.bikeParking')}: {result.bike_parking.inserted}&nbsp;
              · {t('admin.import.bikeRental')}: {result.bike_rental.inserted}
              {result.skipped > 0 && ` (${result.skipped} ${t('admin.import.skipped')})`}
            </>
          ) : (
            <>
              ✅ {result.inserted} {t('admin.import.inserted')}
              {result.skipped > 0 && `, ${result.skipped} ${t('admin.import.skipped')}`}
            </>
          )}
        </span>
      )}
    </div>
  )
}

export function AdminPage({ onImportAccidents, onImportBikeLanes }) {
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

  async function handleExport() {
    try {
      const { data } = await api.get('/api/export_dataset', { responseType: 'blob' })
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'training_data_export.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err?.response?.data?.detail || err.message)
    }
  }

  return (
    <RoleGuard permission="admin.ml" fallback={
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

        <div className="admin-section">
          <h3 className="admin-section-title">{t('admin.import.title')}</h3>
          <p className="admin-section-hint">{t('admin.import.hint')}</p>
          <ImportRow
            label={t('admin.import.accidents')}
            accept=".csv"
            onImport={importAccidents}
            onRefresh={onImportAccidents}
          />
          <ImportRow
            label={t('admin.import.bikeLanes')}
            accept=".geojson,.json"
            onImport={importBikeLanes}
            onRefresh={onImportBikeLanes}
          />
          <ImportRow
            label={t('admin.import.crossings')}
            accept=".geojson,.json"
            onImport={importCrossings}
          />
        </div>

        <UserManagement />
      </div>
    </RoleGuard>
  )
}

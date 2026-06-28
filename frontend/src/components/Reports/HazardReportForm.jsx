import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import toast from 'react-hot-toast'

const REPORT_TYPES = [
  'pothole', 'missing_signage', 'blocked_lane',
  'near_miss', 'poor_lighting', 'other',
]

export function HazardReportForm({ latlng, onClose, onSubmit }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [reportType,   setReportType]   = useState('pothole')
  const [description,  setDescription]  = useState('')
  const [saving,       setSaving]       = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!supabase || !user) return
    setSaving(true)
    try {
      const { error } = await supabase.from('hazard_reports').insert({
        location:    `SRID=4326;POINT(${latlng.lng} ${latlng.lat})`,
        report_type: reportType,
        description: description.trim() || null,
        reported_by: user.id,
      })
      if (error) throw error
      toast.success(t('hazard.submitted'))
      onSubmit?.()
      onClose()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ position: 'relative', width: 360 }}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>{t('hazard.title')}</h2>

        <p style={{ fontSize: '.8rem', color: 'var(--color-muted)', marginBottom: 14 }}>
          📍 {latlng.lat.toFixed(5)}, {latlng.lng.toFixed(5)}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>{t('hazard.type')}</label>
            <select value={reportType} onChange={e => setReportType(e.target.value)}>
              {REPORT_TYPES.map(type => (
                <option key={type} value={type}>{t(`hazard.types.${type}`)}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>{t('hazard.description')}</label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('hazard.descPlaceholder')}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
              {t('proposal.cancel')}
            </button>
            <button type="submit" className="btn btn-danger" style={{ flex: 1 }} disabled={saving}>
              {saving ? t('auth.wait') : t('hazard.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

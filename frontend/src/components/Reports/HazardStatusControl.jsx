import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-hot-toast'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'

const STATUSES = ['open', 'acknowledged', 'resolved']

export function HazardStatusControl({ hazardId, currentStatus, onUpdated }) {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const [busy, setBusy] = useState(false)

  if (!hasPermission('hazards.review')) return null

  async function handleChange(e) {
    const newStatus = e.target.value
    if (newStatus === currentStatus) return
    setBusy(true)
    try {
      const { error } = await supabase
        .from('hazard_reports')
        .update({ status: newStatus })
        .eq('id', hazardId)
      if (error) throw error
      toast.success(t('hazard.statusUpdated'))
      onUpdated?.()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hazard-status-control">
      <label className="hazard-status-label">{t('hazard.statusLabel')}</label>
      <select
        className="hazard-status-select"
        value={currentStatus}
        disabled={busy}
        onChange={handleChange}
      >
        {STATUSES.map(s => (
          <option key={s} value={s}>{t(`hazard.statuses.${s}`)}</option>
        ))}
      </select>
    </div>
  )
}

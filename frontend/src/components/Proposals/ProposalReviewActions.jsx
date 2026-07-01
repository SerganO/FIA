import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-hot-toast'
import { supabase } from '../../lib/supabaseClient'
import { RoleGuard } from '../Auth/RoleGuard'
import { useAuth } from '../../hooks/useAuth'
import { OFFICIAL_REVIEW_STATUSES } from '../../lib/proposalStatuses'

export function ProposalReviewActions({ proposalId, status, onUpdated }) {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const [busy, setBusy] = useState(false)

  if (!hasPermission('proposals.review') || status === 'draft') return null

  async function handleChange(e) {
    const newStatus = e.target.value
    if (newStatus === status) return
    setBusy(true)
    try {
      const { error } = await supabase
        .from('proposals')
        .update({ status: newStatus })
        .eq('id', proposalId)
      if (error) throw error
      toast.success(t('review.statusUpdated'))
      onUpdated?.()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="proposal-review-actions hazard-status-control">
      <label className="hazard-status-label">{t('proposals.statusLabel')}</label>
      <select
        className="hazard-status-select"
        value={status}
        disabled={busy}
        onChange={handleChange}
      >
        {OFFICIAL_REVIEW_STATUSES.map(s => (
          <option key={s} value={s}>{t(`proposals.statuses.${s}`)}</option>
        ))}
      </select>
    </div>
  )
}

export function ProposalSubmitAction({ proposalId, status, userId, proposedBy, onUpdated }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  if (status !== 'draft' || proposedBy !== userId) return null

  async function handleSubmit() {
    setBusy(true)
    try {
      const { error } = await supabase
        .from('proposals')
        .update({ status: 'new' })
        .eq('id', proposalId)
      if (error) throw error
      toast.success(t('review.submitted'))
      onUpdated?.()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <RoleGuard permission="proposals.submit">
      <button
        className="btn btn-primary"
        style={{ fontSize: '.75rem', padding: '4px 10px' }}
        disabled={busy}
        onClick={handleSubmit}
      >
        {t('review.submitForReview')}
      </button>
    </RoleGuard>
  )
}

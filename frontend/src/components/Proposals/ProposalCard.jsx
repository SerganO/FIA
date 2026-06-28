import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-hot-toast'
import { supabase } from '../../lib/supabaseClient'
import { VoteButtons } from './VoteButtons'
import { CommentThread } from './CommentThread'

const statusStyle = {
  draft:        { background: '#f1f5f9', color: '#475569' },
  under_review: { background: '#fef9c3', color: '#a16207' },
  approved:     { background: '#dcfce7', color: '#15803d' },
  rejected:     { background: '#fee2e2', color: '#b91c1c' },
}

function priorityClass(score) {
  if (score == null) return 'priority-medium'
  if (score >= 70)   return 'priority-high'
  if (score >= 45)   return 'priority-medium'
  return 'priority-low'
}

export function ProposalCard({ proposal, onViewOnMap, userId, userRole, onDelete }) {
  const { t } = useTranslation()
  const [showComments,  setShowComments]  = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const p = proposal.properties ?? proposal

  const canDelete = p.id && (p.proposed_by === userId || userRole === 'admin')

  async function handleDelete() {
    setDeleting(true)
    try {
      const { error } = await supabase.from('proposals').delete().eq('id', p.id)
      if (error) throw error
      toast.success(t('proposals.deleted'))
      onDelete?.()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="proposal-card">
      <div className="proposal-card-top">
        <div className="proposal-card-title-row">
          <h3 className="proposal-card-title">{p.title}</h3>
          {p.safety_score != null && (
            <span className={`safety-badge ${priorityClass(p.safety_score)}`} style={{ fontSize: '.72rem' }}>
              {p.safety_score}/100
            </span>
          )}
        </div>

        <div className="proposal-card-meta">
          <span className="proposal-status-badge" style={statusStyle[p.status] ?? statusStyle.draft}>
            {p.status}
          </span>
          {p.length_m != null && (
            <span className="proposal-meta-chip">{Math.round(p.length_m)}m</span>
          )}
          {p.created_at && (
            <span className="proposal-meta-chip">
              {new Date(p.created_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {p.description && <p className="proposal-card-desc">{p.description}</p>}

      <div className="proposal-card-footer">
        <VoteButtons proposalId={p.id} upvotes={p.upvotes ?? 0} downvotes={p.downvotes ?? 0} />

        <div className="proposal-card-actions">
          <button
            className="btn btn-ghost"
            style={{ fontSize: '.75rem', padding: '4px 8px' }}
            onClick={() => setShowComments(v => !v)}
          >
            💬 {p.comment_count ?? 0}
          </button>

          {onViewOnMap && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: '.75rem', padding: '4px 8px' }}
              onClick={() => onViewOnMap(proposal)}
            >
              🗺 {t('proposals.viewOnMap')}
            </button>
          )}

          {canDelete && !confirmDelete && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: '.75rem', padding: '4px 8px', color: '#ef4444' }}
              onClick={() => setConfirmDelete(true)}
            >
              🗑 {t('proposals.delete')}
            </button>
          )}

          {canDelete && confirmDelete && (
            <>
              <span style={{ fontSize: '.75rem', color: 'var(--color-muted)' }}>
                {t('proposals.deleteConfirm')}
              </span>
              <button
                className="btn btn-ghost"
                style={{ fontSize: '.75rem', padding: '4px 8px', color: '#ef4444', fontWeight: 700 }}
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? '…' : t('proposals.deleteYes')}
              </button>
              <button
                className="btn btn-ghost"
                style={{ fontSize: '.75rem', padding: '4px 8px' }}
                onClick={() => setConfirmDelete(false)}
              >
                {t('proposals.deleteNo')}
              </button>
            </>
          )}
        </div>
      </div>

      {showComments && <CommentThread proposalId={p.id} />}
    </div>
  )
}

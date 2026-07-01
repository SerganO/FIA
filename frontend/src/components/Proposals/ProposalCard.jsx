import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-hot-toast'
import { supabase } from '../../lib/supabaseClient'
import { VoteButtons } from './VoteButtons'
import { CommentThread } from './CommentThread'
import { ProposalReviewActions, ProposalSubmitAction } from './ProposalReviewActions'
import { useAuth } from '../../hooks/useAuth'
import { DELETABLE_STATUSES } from '../../lib/proposalStatuses'

const statusStyle = {
  draft:        { background: '#f1f5f9', color: '#475569' },
  new:          { background: '#e0e7ff', color: '#3730a3' },
  under_review: { background: '#fef9c3', color: '#a16207' },
  approved:     { background: '#dcfce7', color: '#15803d' },
  rejected:     { background: '#fee2e2', color: '#b91c1c' },
}

const sourceStyle = {
  community: { background: '#dbeafe', color: '#1e40af' },
  official:  { background: '#ede9fe', color: '#5b21b6' },
}

function priorityClass(score) {
  if (score == null) return 'priority-medium'
  if (score >= 70)   return 'priority-high'
  if (score >= 45)   return 'priority-medium'
  return 'priority-low'
}

export function ProposalCard({ proposal, onViewOnMap, userId, userRole, onDelete, onUpdated }) {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const [showComments,  setShowComments]  = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [editing,       setEditing]       = useState(false)
  const [editTitle,     setEditTitle]     = useState('')
  const [editDesc,      setEditDesc]      = useState('')
  const [saving,        setSaving]        = useState(false)
  const p = proposal.properties ?? proposal

  const canEditDraft = p.status === 'draft' && p.proposed_by === userId

  const canDelete = p.id && (
    (p.proposed_by === userId && hasPermission('proposals.delete.own') && DELETABLE_STATUSES.includes(p.status))
    || hasPermission('proposals.delete.any')
  )

  function startEditing() {
    setEditTitle(p.title ?? '')
    setEditDesc(p.description ?? '')
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setEditTitle('')
    setEditDesc('')
  }

  async function handleSaveEdit() {
    if (!editTitle.trim()) {
      toast.error(t('proposal.err.noTitle'))
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('proposals')
        .update({
          title: editTitle.trim(),
          description: editDesc.trim() || null,
        })
        .eq('id', p.id)
      if (error) throw error
      toast.success(t('proposals.updated'))
      setEditing(false)
      onUpdated?.()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

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
          {editing ? (
            <input
              className="proposal-card-edit-title"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              placeholder={t('proposal.titlePlaceholder')}
            />
          ) : (
            <h3 className="proposal-card-title">{p.title}</h3>
          )}
          {!editing && p.safety_score != null && (
            <span className={`safety-badge ${priorityClass(p.safety_score)}`} style={{ fontSize: '.72rem' }}>
              {p.safety_score}/100
            </span>
          )}
        </div>

        <div className="proposal-card-meta">
          <span
            className="proposal-status-badge"
            style={sourceStyle[p.source ?? 'community'] ?? sourceStyle.community}
          >
            {t(`proposals.sources.${p.source ?? 'community'}`) ?? p.source}
          </span>
          <span className="proposal-status-badge" style={statusStyle[p.status] ?? statusStyle.draft}>
            {t(`proposals.statuses.${p.status}`) ?? p.status}
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

      <div className="proposal-card-desc-block">
        <span className="proposal-card-desc-label">{t('proposal.descLabel')}</span>
        {editing ? (
          <textarea
            className="proposal-card-edit-desc"
            rows={3}
            value={editDesc}
            onChange={e => setEditDesc(e.target.value)}
            placeholder={t('proposal.descPlaceholder')}
          />
        ) : (
          <p className="proposal-card-desc">
            {p.description?.trim() ? p.description : t('proposals.noDescription')}
          </p>
        )}
      </div>

      {canEditDraft && (
        <div className="proposal-edit-actions">
          {editing ? (
            <>
              <button
                className="btn btn-primary"
                style={{ fontSize: '.75rem', padding: '4px 10px' }}
                disabled={saving}
                onClick={handleSaveEdit}
              >
                {saving ? t('proposal.saving') : t('proposals.saveEdit')}
              </button>
              <button
                className="btn btn-ghost"
                style={{ fontSize: '.75rem', padding: '4px 10px' }}
                disabled={saving}
                onClick={cancelEditing}
              >
                {t('proposals.cancelEdit')}
              </button>
            </>
          ) : (
            <button
              className="btn btn-ghost"
              style={{ fontSize: '.75rem', padding: '4px 10px' }}
              onClick={startEditing}
            >
              ✏ {t('proposals.edit')}
            </button>
          )}
        </div>
      )}

      <div className="proposal-review-row">
        <ProposalSubmitAction
          proposalId={p.id}
          status={p.status}
          userId={userId}
          proposedBy={p.proposed_by}
          onUpdated={onUpdated}
        />
        <ProposalReviewActions
          proposalId={p.id}
          status={p.status}
          onUpdated={onUpdated}
        />
      </div>

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

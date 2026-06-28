import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { VoteButtons } from './VoteButtons'
import { CommentThread } from './CommentThread'

const statusStyle = {
  draft:        { background: '#f1f5f9', color: '#475569' },
  under_review: { background: '#fef9c3', color: '#a16207' },
  approved:     { background: '#dcfce7', color: '#15803d' },
  rejected:     { background: '#fee2e2', color: '#b91c1c' },
}

function safetyClass(score) {
  if (score == null) return 'safety-medium'
  if (score >= 70)   return 'safety-low'
  if (score >= 45)   return 'safety-medium'
  return 'safety-high'
}

export function ProposalCard({ proposal, onViewOnMap }) {
  const { t } = useTranslation()
  const [showComments, setShowComments] = useState(false)
  const p = proposal.properties ?? proposal

  return (
    <div className="proposal-card">
      <div className="proposal-card-top">
        <div className="proposal-card-title-row">
          <h3 className="proposal-card-title">{p.title}</h3>
          {p.safety_score != null && (
            <span className={`safety-badge ${safetyClass(p.safety_score)}`} style={{ fontSize: '.72rem' }}>
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
        </div>
      </div>

      {showComments && <CommentThread proposalId={p.id} />}
    </div>
  )
}

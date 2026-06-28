import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { ProposalCard } from '../components/Proposals/ProposalCard'

const SORT_OPTIONS = ['date', 'score', 'votes']

export function ProposalsPage({ proposals, onViewOnMap, onDelete }) {
  const { t } = useTranslation()
  const { user, role } = useAuth()
  const [sortBy, setSortBy] = useState('date')

  const features = proposals?.features ?? []

  const sorted = [...features].sort((a, b) => {
    const ap = a.properties, bp = b.properties
    if (sortBy === 'score') return (bp.safety_score ?? -1) - (ap.safety_score ?? -1)
    if (sortBy === 'votes') return (bp.upvotes ?? 0) - (ap.upvotes ?? 0)
    return new Date(bp.created_at ?? 0) - new Date(ap.created_at ?? 0)
  })

  return (
    <div className="proposals-page">
      <div className="proposals-header">
        <h2 className="proposals-title">{t('proposals.title')}</h2>
        <div className="proposals-sort">
          <span className="proposals-sort-label">{t('proposals.sortBy')}:</span>
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt}
              className={`proposals-sort-btn${sortBy === opt ? ' active' : ''}`}
              onClick={() => setSortBy(opt)}
            >
              {t(`proposals.sort.${opt}`)}
            </button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="proposals-empty">{t('proposals.empty')}</p>
      ) : (
        <div className="proposals-list">
          {sorted.map((f, i) => (
            <ProposalCard
              key={f.properties?.id ?? i}
              proposal={f}
              onViewOnMap={onViewOnMap}
              userId={user?.id}
              userRole={role}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

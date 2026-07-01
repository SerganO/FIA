import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { ProposalCard } from '../components/Proposals/ProposalCard'
import { PROPOSAL_STATUSES } from '../lib/proposalStatuses'

const SORT_OPTIONS = ['date', 'score', 'votes']
const STATUS_FILTERS = ['all', ...PROPOSAL_STATUSES]
const SOURCE_FILTERS = ['all', 'community', 'official']

export function ProposalsPage({ proposals, onViewOnMap, onDelete, onUpdated, onRefresh }) {
  const { t } = useTranslation()
  const { user, role } = useAuth()
  const [sortBy, setSortBy] = useState('date')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    if (!onRefresh || refreshing) return
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  const features = proposals?.features ?? []

  const filtered = features.filter(f => {
    const p = f.properties ?? {}
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    const source = p.source ?? 'community'
    if (sourceFilter !== 'all' && source !== sourceFilter) return false
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const ap = a.properties, bp = b.properties
    if (sortBy === 'score') return (bp.safety_score ?? -1) - (ap.safety_score ?? -1)
    if (sortBy === 'votes') return (bp.upvotes ?? 0) - (ap.upvotes ?? 0)
    return new Date(bp.created_at ?? 0) - new Date(ap.created_at ?? 0)
  })

  return (
    <div className="proposals-page">
      <div className="proposals-header">
        <div className="page-title-row">
          <h2 className="proposals-title">{t('proposals.title')}</h2>
          {onRefresh && (
            <button
              type="button"
              className="page-refresh-btn"
              onClick={handleRefresh}
              disabled={refreshing}
              title={t('app.refresh')}
            >
              ↻ {refreshing ? t('app.refreshing') : t('app.refresh')}
            </button>
          )}
        </div>
        <div className="proposals-header-controls">
          <div className="proposals-sort">
            <span className="proposals-sort-label">{t('proposals.filterBy')}:</span>
            {STATUS_FILTERS.map(opt => (
              <button
                key={opt}
                className={`proposals-sort-btn${statusFilter === opt ? ' active' : ''}`}
                onClick={() => setStatusFilter(opt)}
              >
                {opt === 'all' ? t('proposals.filter.all') : t(`proposals.statuses.${opt}`)}
              </button>
            ))}
          </div>
          <div className="proposals-sort">
            <span className="proposals-sort-label">{t('proposals.sourceFilterBy')}:</span>
            {SOURCE_FILTERS.map(opt => (
              <button
                key={opt}
                className={`proposals-sort-btn${sourceFilter === opt ? ' active' : ''}`}
                onClick={() => setSourceFilter(opt)}
              >
                {opt === 'all' ? t('proposals.filter.all') : t(`proposals.sources.${opt}`)}
              </button>
            ))}
          </div>
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
              onUpdated={onUpdated}
            />
          ))}
        </div>
      )}
    </div>
  )
}

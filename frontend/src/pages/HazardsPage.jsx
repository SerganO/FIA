import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HazardCard } from '../components/Reports/HazardCard'

const STATUS_FILTERS = ['active', 'all', 'resolved']

export function HazardsPage({ hazardReports, onViewOnMap, onUpdated, onRefresh }) {
  const { t } = useTranslation()
  const [statusFilter, setStatusFilter] = useState('active')
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

  const features = hazardReports?.features ?? []

  const filtered = features.filter(f => {
    const status = f.properties?.status
    if (statusFilter === 'active') return status !== 'resolved'
    if (statusFilter === 'resolved') return status === 'resolved'
    return true
  })

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.properties?.created_at ?? 0) - new Date(a.properties?.created_at ?? 0),
  )

  return (
    <div className="hazards-page">
      <div className="hazards-header">
        <div className="page-title-row">
          <h2 className="hazards-title">{t('hazards.title')}</h2>
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
        <div className="hazards-header-controls">
          <div className="hazards-filter">
            <span className="hazards-filter-label">{t('hazards.filterBy')}:</span>
            {STATUS_FILTERS.map(opt => (
              <button
                key={opt}
                className={`hazards-filter-btn${statusFilter === opt ? ' active' : ''}`}
                onClick={() => setStatusFilter(opt)}
              >
                {t(`hazards.filter.${opt}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="hazards-empty">{t('hazards.empty')}</p>
      ) : (
        <div className="hazards-list">
          {sorted.map((f, i) => (
            <HazardCard
              key={f.properties?.id ?? i}
              hazard={f}
              onViewOnMap={onViewOnMap}
              onUpdated={onUpdated}
            />
          ))}
        </div>
      )}
    </div>
  )
}

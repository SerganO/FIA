import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AccidentCard } from '../components/Reports/AccidentCard'

export function AccidentsPage({ accidents, onViewOnMap, onRefresh }) {
  const { t } = useTranslation()
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

  const sorted = useMemo(() => (
    [...(accidents?.features ?? [])].sort(
      (a, b) => new Date(b.properties?.accident_date ?? b.properties?.created_at ?? 0)
        - new Date(a.properties?.accident_date ?? a.properties?.created_at ?? 0),
    )
  ), [accidents])

  return (
    <div className="hazards-page">
      <div className="hazards-header">
        <div className="page-title-row">
          <h2 className="hazards-title">{t('accidents.title')}</h2>
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
      </div>

      {sorted.length === 0 ? (
        <p className="hazards-empty">{t('accidents.empty')}</p>
      ) : (
        <div className="hazards-list">
          {sorted.map((f, i) => (
            <AccidentCard
              key={f.properties?.id ?? i}
              accident={f}
              onViewOnMap={onViewOnMap}
            />
          ))}
        </div>
      )}
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import { HazardStatusControl } from './HazardStatusControl'

const statusStyle = {
  open:         { background: '#fee2e2', color: '#b91c1c' },
  acknowledged: { background: '#fef9c3', color: '#a16207' },
  resolved:     { background: '#dcfce7', color: '#15803d' },
}

export function HazardCard({ hazard, onViewOnMap, onUpdated }) {
  const { t } = useTranslation()
  const p = hazard.properties ?? hazard

  return (
    <div className="hazard-card">
      <div className="hazard-card-top">
        <div className="hazard-card-title-row">
          <h3 className="hazard-card-title">
            ⚠️ {t(`hazard.types.${p.report_type}`) ?? p.report_type}
          </h3>
          <span className="hazard-status-badge" style={statusStyle[p.status] ?? statusStyle.open}>
            {t(`hazard.statuses.${p.status}`) ?? p.status}
          </span>
        </div>
        {p.created_at && (
          <span className="hazard-meta-chip">
            {new Date(p.created_at).toLocaleDateString()}
          </span>
        )}
      </div>

      {p.description && <p className="hazard-card-desc">{p.description}</p>}

      {p.photo_url && (
        <div className="hazard-card-photo">
          <img src={p.photo_url} alt="" />
        </div>
      )}

      <div className="hazard-card-footer">
        <HazardStatusControl
          hazardId={p.id}
          currentStatus={p.status}
          onUpdated={onUpdated}
        />
        {onViewOnMap && p.status !== 'resolved' && (
          <button
            className="btn btn-ghost hazard-card-map-btn"
            onClick={() => onViewOnMap(hazard)}
          >
            🗺 {t('hazards.viewOnMap')}
          </button>
        )}
      </div>
    </div>
  )
}

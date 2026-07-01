import { useTranslation } from 'react-i18next'
import { formatAccidentDateTime } from '../../lib/dates'

export function AccidentCard({ accident, onViewOnMap }) {
  const { t, i18n } = useTranslation()
  const p = accident.properties ?? accident
  const isCrowd = p.source === 'crowdsourced'
  const title = isCrowd && p.report_type
    ? t(`accident.types.${p.report_type}`)
    : t(`map.severity.${p.severity}`) ?? t('map.accident')

  return (
    <div className="hazard-card">
      <div className="hazard-card-top">
        <div className="hazard-card-title-row">
          <h3 className="hazard-card-title">
            {isCrowd ? '🚑' : '⚠️'} {title}
          </h3>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {p.accident_date && (
            <span className="hazard-meta-chip">
              {t('accident.dateTime')}: {formatAccidentDateTime(p.accident_date, i18n.language)}
            </span>
          )}
          {p.severity && (
            <span className="hazard-meta-chip">
              {t('accident.severity')}: {t(`map.severity.${p.severity}`)}
            </span>
          )}
          {p.street_name && (
            <span className="hazard-meta-chip">
              {t('accident.street')}: {p.street_name}
            </span>
          )}
          {p.source && (
            <span className="hazard-meta-chip">
              {t('accidents.source')}: {t(`accidents.sources.${p.source}`, p.source)}
            </span>
          )}
        </div>
      </div>

      {p.description && <p className="hazard-card-desc">{p.description}</p>}

      {p.photo_url && (
        <div className="hazard-card-photo">
          <img src={p.photo_url} alt="" />
        </div>
      )}

      {onViewOnMap && (
        <div className="hazard-card-footer">
          <button
            className="btn btn-ghost hazard-card-map-btn"
            onClick={() => onViewOnMap(accident)}
          >
            🗺 {t('accidents.viewOnMap')}
          </button>
        </div>
      )}
    </div>
  )
}

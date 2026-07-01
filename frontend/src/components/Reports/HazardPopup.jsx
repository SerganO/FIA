import { I18nextProvider, useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { HazardStatusControl } from './HazardStatusControl'

function HazardPopupInner({ properties, onUpdated }) {
  const { t } = useTranslation()
  const p = properties

  return (
    <div className="hazard-popup">
      <h3 className="hazard-popup-title">
        ⚠️ {t(`hazard.types.${p.report_type}`) ?? p.report_type}
      </h3>
      {p.description && (
        <p className="hazard-popup-desc">{p.description}</p>
      )}
      <div className="hazard-popup-meta">
        <strong>{t('map.status')}:</strong> {t(`hazard.statuses.${p.status}`) ?? p.status}<br />
        <strong>📅</strong> {p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}
      </div>
      {p.photo_url && (
        <div className="hazard-popup-photo">
          <img src={p.photo_url} alt="" />
        </div>
      )}
      <HazardStatusControl
        hazardId={p.id}
        currentStatus={p.status}
        onUpdated={onUpdated}
      />
    </div>
  )
}

export function HazardPopup({ properties, onUpdated }) {
  return (
    <I18nextProvider i18n={i18n}>
      <HazardPopupInner properties={properties} onUpdated={onUpdated} />
    </I18nextProvider>
  )
}

import { I18nextProvider, useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { formatAccidentDateTime } from '../../lib/dates'

function AccidentPopupInner({ properties }) {
  const { t, i18n } = useTranslation()
  const p = properties
  const isCrowd = p.source === 'crowdsourced'
  const title = isCrowd && p.report_type
    ? t(`accident.types.${p.report_type}`)
    : t(`map.severity.${p.severity}`) ?? t('map.accident')

  return (
    <div className="hazard-popup">
      <h3 className="hazard-popup-title">
        {isCrowd ? '🚑' : '⚠️'} {title}
      </h3>
      {p.description && (
        <p className="hazard-popup-desc">{p.description}</p>
      )}
      <div className="hazard-popup-meta">
        <strong>{t('accident.dateTime')}:</strong> {formatAccidentDateTime(p.accident_date, i18n.language) || '—'}<br />
        <strong>{t('accident.severity')}:</strong> {t(`map.severity.${p.severity}`) ?? p.severity}<br />
        {p.street_name && <><strong>{t('accident.street')}:</strong> {p.street_name}<br /></>}
        {p.road_type && <><strong>{t('map.road')}:</strong> {p.road_type}<br /></>}
        {p.weather && <><strong>{t('map.weather')}:</strong> {p.weather}<br /></>}
        {p.light_cond && <><strong>{t('map.lighting')}:</strong> {p.light_cond}<br /></>}
        {p.source && <><strong>{t('accidents.source')}:</strong> {t(`accidents.sources.${p.source}`, p.source)}<br /></>}
      </div>
      {p.photo_url && (
        <div className="hazard-popup-photo">
          <img src={p.photo_url} alt="" />
        </div>
      )}
    </div>
  )
}

export function AccidentPopup({ properties }) {
  return (
    <I18nextProvider i18n={i18n}>
      <AccidentPopupInner properties={properties} />
    </I18nextProvider>
  )
}

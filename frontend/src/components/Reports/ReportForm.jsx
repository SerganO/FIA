import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { toLocalDatetimeValue, localDatetimeToISO } from '../../lib/dates'
import { reverseGeocodeStreet } from '../../lib/geocode'
import toast from 'react-hot-toast'

const HAZARD_TYPES = [
  'pothole', 'missing_signage', 'blocked_lane',
  'near_miss', 'poor_lighting', 'other',
]

const ACCIDENT_TYPES = [
  'collision', 'fall', 'near_miss', 'dooring', 'hit_and_run', 'other',
]

const compressImage = (file, maxWidth = 1024) => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (event) => {
      const img = new Image()
      img.src = event.target.result
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scaleSize = maxWidth / img.width
        if (scaleSize < 1) {
          canvas.width = maxWidth
          canvas.height = img.height * scaleSize
        } else {
          canvas.width = img.width
          canvas.height = img.height
        }
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.jpg', {
            type: 'image/jpeg',
            lastModified: Date.now(),
          }))
        }, 'image/jpeg', 0.8)
      }
    }
  })
}

export function ReportForm({ latlng, onClose, onSubmit }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [category, setCategory] = useState('hazard')
  const [hazardType, setHazardType] = useState('pothole')
  const [accidentType, setAccidentType] = useState('collision')
  const [severity, setSeverity] = useState('2')
  const [accidentDateTime, setAccidentDateTime] = useState(() => toLocalDatetimeValue())
  const [streetName, setStreetName] = useState('')
  const [streetLoading, setStreetLoading] = useState(false)
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const fileInputRef = useRef(null)

  const isHazard = category === 'hazard'

  useEffect(() => {
    if (!latlng) return
    let cancelled = false
    setStreetLoading(true)
    setStreetName('')

    reverseGeocodeStreet(latlng.lat, latlng.lng, i18n.language)
      .then(name => {
        if (!cancelled) setStreetName(name ?? '')
      })
      .finally(() => {
        if (!cancelled) setStreetLoading(false)
      })

    return () => { cancelled = true }
  }, [latlng, i18n.language])

  const handlePhotoChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setPhoto(file)
      setPhotoPreview(URL.createObjectURL(file))
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!supabase || !user) return
    setSaving(true)

    try {
      let photo_url = null
      if (photo) {
        toast.loading(t('report.uploadingPhoto'), { id: 'upload-toast' })
        const compressedFile = await compressImage(photo)
        const fileName = `${Date.now()}_${user.id}.jpg`
        const bucket = isHazard ? 'hazards' : 'accidents'

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(fileName, compressedFile)

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage
          .from(bucket)
          .getPublicUrl(fileName)

        photo_url = publicUrl
        toast.dismiss('upload-toast')
      }

      if (isHazard) {
        const { error } = await supabase.from('hazard_reports').insert({
          location: `SRID=4326;POINT(${latlng.lng} ${latlng.lat})`,
          report_type: hazardType,
          description: description.trim() || null,
          photo_url,
          reported_by: user.id,
        })
        if (error) throw error
        toast.success(t('hazard.submitted'))
      } else {
        const { error } = await supabase.from('accidents').insert({
          location: `SRID=4326;POINT(${latlng.lng} ${latlng.lat})`,
          report_type: accidentType,
          severity: parseInt(severity, 10),
          accident_date: localDatetimeToISO(accidentDateTime),
          street_name: streetName.trim() || null,
          description: description.trim() || null,
          photo_url,
          reported_by: user.id,
          source: 'crowdsourced',
          is_actual: true,
        })
        if (error) throw error
        toast.success(t('accident.submitted'))
      }

      onSubmit?.(category)
      onClose()
    } catch (err) {
      toast.error(err.message)
      toast.dismiss('upload-toast')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ position: 'relative', width: 360 }}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>{t('report.title')}</h2>

        <p style={{ fontSize: '.8rem', color: 'var(--color-muted)', marginBottom: 14 }}>
          📍 {latlng.lat.toFixed(5)}, {latlng.lng.toFixed(5)}
          {!isHazard && streetName && (
            <><br />{t('accident.street')}: {streetName}</>
          )}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>{t('report.mode')}</label>
            <div className="report-type-toggle">
              {['hazard', 'accident'].map(mode => (
                <button
                  key={mode}
                  type="button"
                  className={`report-type-btn${category === mode ? ' active' : ''}`}
                  onClick={() => setCategory(mode)}
                >
                  {t(`report.${mode}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>{t(isHazard ? 'hazard.type' : 'accident.type')}</label>
            <select
              value={isHazard ? hazardType : accidentType}
              onChange={e => isHazard
                ? setHazardType(e.target.value)
                : setAccidentType(e.target.value)}
            >
              {(isHazard ? HAZARD_TYPES : ACCIDENT_TYPES).map(type => (
                <option key={type} value={type}>
                  {t(`${isHazard ? 'hazard' : 'accident'}.types.${type}`)}
                </option>
              ))}
            </select>
          </div>

          {!isHazard && (
            <>
              <div className="form-group">
                <label>{t('accident.severity')}</label>
                <select value={severity} onChange={e => setSeverity(e.target.value)}>
                  {[1, 2, 3].map(s => (
                    <option key={s} value={s}>{t(`map.severity.${s}`)}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>{t('accident.street')}</label>
                <input
                  type="text"
                  value={streetName}
                  onChange={e => setStreetName(e.target.value)}
                  placeholder={
                    streetLoading
                      ? t('accident.streetLoading')
                      : t('accident.streetPlaceholder')
                  }
                  disabled={streetLoading}
                />
              </div>

              <div className="form-group">
                <label>{t('accident.dateTime')}</label>
                <input
                  type="datetime-local"
                  value={accidentDateTime}
                  max={toLocalDatetimeValue(new Date())}
                  onChange={e => setAccidentDateTime(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label>{t(isHazard ? 'hazard.description' : 'accident.description')}</label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t(isHazard ? 'hazard.descPlaceholder' : 'accident.descPlaceholder')}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div className="form-group">
            <label>{t('photo')}</label>

            {photoPreview ? (
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <img
                  src={photoPreview}
                  alt="Preview"
                  style={{ width: '100%', borderRadius: 8, objectFit: 'cover', maxHeight: 200 }}
                />
                <button
                  type="button"
                  onClick={() => { setPhoto(null); setPhotoPreview(null) }}
                  style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ flex: 1 }}
                >
                  {t('addPhoto')}
                </button>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handlePhotoChange}
                  style={{ display: 'none' }}
                />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
              {t('proposal.cancel')}
            </button>
            <button type="submit" className="btn btn-danger" style={{ flex: 1 }} disabled={saving}>
              {saving ? t('auth.wait') : t('report.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

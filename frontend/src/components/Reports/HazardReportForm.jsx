import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import toast from 'react-hot-toast'

const REPORT_TYPES = [
  'pothole', 'missing_signage', 'blocked_lane',
  'near_miss', 'poor_lighting', 'other',
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
          resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
            type: 'image/jpeg',
            lastModified: Date.now(),
          }))
        }, 'image/jpeg', 0.8)
      }
    }
  })
}

export function HazardReportForm({ latlng, onClose, onSubmit }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [reportType, setReportType] = useState('pothole')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const fileInputRef = useRef(null)

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
        toast.loading(t('hazard.uploadingPhoto'), { id: 'upload-toast' })
        const compressedFile = await compressImage(photo)
        const fileName = `${Date.now()}_${user.id}.jpg`

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('hazards')
          .upload(fileName, compressedFile)

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage
          .from('hazards')
          .getPublicUrl(fileName)
          
        photo_url = publicUrl
        toast.dismiss('upload-toast')
      }

      const { error } = await supabase.from('hazard_reports').insert({
        location: `SRID=4326;POINT(${latlng.lng} ${latlng.lat})`,
        report_type: reportType,
        description: description.trim() || null,
        photo_url: photo_url,
        reported_by: user.id,
      })
      
      if (error) throw error
      
      toast.success(t('hazard.submitted'))
      onSubmit?.()
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
        <h2>{t('hazard.title')}</h2>

        <p style={{ fontSize: '.8rem', color: 'var(--color-muted)', marginBottom: 14 }}>
          📍 {latlng.lat.toFixed(5)}, {latlng.lng.toFixed(5)}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>{t('hazard.type')}</label>
            <select value={reportType} onChange={e => setReportType(e.target.value)}>
              {REPORT_TYPES.map(type => (
                <option key={type} value={type}>{t(`hazard.types.${type}`)}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>{t('hazard.description')}</label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('hazard.descPlaceholder')}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div className="form-group">
            <label>{t('hazard.photo')}</label>
            
            {photoPreview ? (
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <img 
                  src={photoPreview} 
                  alt="Preview" 
                  style={{ width: '100%', borderRadius: 8, objectFit: 'cover', maxHeight: 200 }} 
                />
                <button 
                  type="button" 
                  onClick={() => { setPhoto(null); setPhotoPreview(null); }}
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
              {saving ? t('auth.wait') : t('hazard.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

import { useState, useEffect, useMemo, useRef } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { MapView }          from './components/Map/MapView'
import { LoginModal }       from './components/Auth/LoginModal'
import { RoleGuard }        from './components/Auth/RoleGuard'
import { HazardReportForm } from './components/Reports/HazardReportForm'
import { ProposalsPage }    from './pages/ProposalsPage'
import { AdminPage }        from './pages/AdminPage'
import { useAuth }    from './hooks/useAuth'
import { useMapData } from './hooks/useMapData'
import { predictSafety, prewarmBackend } from './lib/apiClient'
import { supabase } from './lib/supabaseClient'

const ROLE_COLORS = {
  guest:         'role-guest',
  user:          'role-user',
  city_official: 'role-city_official',
  admin:         'role-admin',
}

function BikeInfraControl({ layers, onToggle }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const anyActive = layers.bikeLanes || layers.bikeParking || layers.bikeRental

  useEffect(() => {
    if (!open) return
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  function toggleAll() {
    const next = !anyActive
    ;['bikeLanes', 'bikeParking', 'bikeRental'].forEach(key => {
      if (!!layers[key] !== next) onToggle(key)
    })
  }

  return (
    <div ref={ref}>
      <div className="layer-toggle-row">
        <button
          className={`layer-toggle split-left${anyActive ? ' active' : ''}`}
          onClick={toggleAll}
        >
          <span className="layer-dot" style={{ background: '#22c55e' }} />
          {t('layer.bikeInfra')}
        </button>
        <button
          className={`layer-filter-chevron${open ? ' open' : ''}`}
          onClick={() => setOpen(p => !p)}
        >
          ▾
        </button>
      </div>
      {open && (
        <div className="infra-dropdown">
          {[
            { key: 'bikeLanes',   label: t('layer.bikeLanes'),   dot: '#22c55e' },
            { key: 'bikeParking', label: t('layer.bikeParking'), dot: '#3b82f6' },
            { key: 'bikeRental',  label: t('layer.bikeRental'),  dot: '#a855f7' },
          ].map(({ key, label, dot }) => (
            <label key={key} className="infra-checkbox-row">
              <input
                type="checkbox"
                checked={!!layers[key]}
                onChange={() => onToggle(key)}
              />
              <span className="layer-dot" style={{ background: dot }} />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function LayerControls({ layers, onToggle, filterOpen, onFilterToggle, filterPanelProps }) {
  const { t } = useTranslation()

  function renderSimpleItem({ key, label, dot }) {
    return (
      <div key={key}>
        <div className="layer-toggle-row">
          <button
            className={`layer-toggle${layers[key] ? ' active' : ''}`}
            onClick={() => onToggle(key)}
          >
            <span className="layer-dot" style={{ background: dot }} />
            {label}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="map-controls">
      {/* Accidents with filter chevron */}
      <div>
        <div className="layer-toggle-row">
          <button
            className={`layer-toggle${layers.accidents ? ' active' : ''}${layers.accidents ? ' split-left' : ''}`}
            onClick={() => onToggle('accidents')}
          >
            <span className="layer-dot" style={{ background: '#ef4444' }} />
            {t('layer.accidents')}
          </button>
          {layers.accidents && (
            <button
              className={`layer-filter-chevron${filterOpen ? ' open' : ''}`}
              onClick={onFilterToggle}
              title={t('filter.tooltip')}
            >
              ▾
            </button>
          )}
        </div>
        {layers.accidents && filterOpen && (
          <AccidentFilterPanel {...filterPanelProps} />
        )}
      </div>

      {/* Bicycle infrastructure group */}
      <BikeInfraControl layers={layers} onToggle={onToggle} />

      {/* Remaining single-toggle layers */}
      {[
        { key: 'proposals',     label: t('layer.proposals'),     dot: '#3b82f6' },
        { key: 'hazardReports', label: t('layer.hazardReports'), dot: '#f97316' },
        { key: 'traffic',       label: t('layer.traffic'),       dot: '#94a3b8' },
      ].map(renderSimpleItem)}
    </div>
  )
}

// ── Accident filter panel ────────────────────────────────────────────────────
// opacity = 0.2 + 0.8 * t^decayRate   (t=0 oldest, t=1 newest in range)
// decayRate=1 → linear   decayRate>1 → sharp drop-off   decayRate<1 → gradual

const toDateStr = ms => (ms != null && !isNaN(ms)) ? new Date(ms).toISOString().slice(0, 10) : ''
const toMs      = str => new Date(str).getTime()

function AccidentFilterPanel({ dataDateRange, dateRange, onDateRange, decayRate, onDecayRate }) {
  const { t } = useTranslation()
  const [dataMin, dataMax] = dataDateRange
  const [selMin,  selMax]  = dateRange
  if (!dataMin || !dataMax) return null

  return (
    <div className="accident-filter-panel">
      <div className="afp-title">{t('filter.title')}</div>

      <div className="afp-row">
        <span className="afp-label">{t('filter.dateRange')}</span>
        <div className="afp-dates">
          <input
            type="date"
            value={toDateStr(selMin)}
            min={toDateStr(dataMin)}
            max={toDateStr(selMax)}
            onChange={e => onDateRange([e.target.value ? toMs(e.target.value) : dataMin, selMax])}
          />
          <span className="afp-sep">–</span>
          <input
            type="date"
            value={toDateStr(selMax)}
            min={toDateStr(selMin)}
            max={toDateStr(dataMax)}
            onChange={e => onDateRange([selMin, e.target.value ? toMs(e.target.value) : dataMax])}
          />
        </div>
      </div>

      <div className="afp-row">
        <div className="afp-label-row">
          <span className="afp-label">{t('filter.fadeRate')}</span>
          <span className="afp-value">{decayRate.toFixed(1)}</span>
        </div>
        <input
          type="range"
          className="afp-slider"
          min="0.2" max="4" step="0.1"
          value={decayRate}
          onChange={e => onDecayRate(parseFloat(e.target.value))}
        />
        <div className="afp-slider-labels">
          <span>{t('filter.gradual')}</span>
          <span>{t('filter.sharp')}</span>
        </div>
      </div>
    </div>
  )
}

function ProposalModal({ geometry, onSave, onClose }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [title, setTitle]       = useState('')
  const [desc, setDesc]         = useState('')
  const [score, setScore]       = useState(null)
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    setLoading(true)
    predictSafety(geometry)
      .then(data => setScore(data))
      .catch(() => toast.error(t('proposal.err.ml')))
      .finally(() => setLoading(false))
  }, [geometry, t])

  async function handleSave() {
    if (!title.trim()) { toast.error(t('proposal.err.noTitle')); return }
    if (!supabase || !user) { toast.error(t('proposal.err.signIn')); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('proposals').insert({
        geom: `SRID=4326;LINESTRING(${geometry.coordinates.map(c => c.join(' ')).join(', ')})`,
        title:        title.trim(),
        description:  desc.trim() || null,
        proposed_by:  user.id,
        safety_score: score?.safety_score ?? null,
        ml_version:   score?.model_version ?? null,
        ml_features:  score?.features ?? null,
      })
      if (error) throw error
      toast.success(t('proposal.heading') + ' — OK')
      onSave()
      onClose()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const priority = score?.risk_level
  const safetyClass = priority ? `priority-${priority}` : 'priority-medium'

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ position: 'relative', width: 420 }}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>{t('proposal.heading')}</h2>

        <div style={{
          background: 'var(--color-bg)',
          borderRadius: 'var(--radius)',
          padding: '14px 16px',
          marginBottom: 18,
          textAlign: 'center',
        }}>
          {loading ? (
            <p style={{ color: 'var(--color-muted)', fontSize: '.9rem' }}>
              {t('proposal.calculating')}
            </p>
          ) : score ? (
            <>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1 }}>
                <span className={`safety-badge ${safetyClass}`}>
                  {score.safety_score}/100
                </span>
              </div>
              <p style={{ marginTop: 8, fontSize: '.85rem', color: 'var(--color-muted)' }}>
                {t(score.recommendation)}
              </p>
              <div style={{ marginTop: 8, fontSize: '.75rem', color: 'var(--color-muted)', display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <span>{t('proposal.accidents100m')}: <strong>{score.features?.accidents_within_100m}</strong></span>
                <span>{t('proposal.length')}: <strong>{Math.round(score.features?.length_m ?? 0)}м</strong></span>
                <span>{t('proposal.nearestLane')}: <strong>{Math.round(score.features?.nearest_bike_lane_m ?? 0)}м</strong></span>
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--color-muted)', fontSize: '.85rem' }}>
              {t('proposal.scoreUnavailable')}
            </p>
          )}
        </div>

        <div className="form-group">
          <label>{t('proposal.titleLabel')}</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('proposal.titlePlaceholder')} />
        </div>
        <div className="form-group">
          <label>{t('proposal.descLabel')}</label>
          <textarea rows={3} value={desc} onChange={e => setDesc(e.target.value)} placeholder={t('proposal.descPlaceholder')} style={{ resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>{t('proposal.cancel')}</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving || loading}>
            {saving ? t('proposal.saving') : t('proposal.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const { accidents, bikeLanes, bikeParking, bikeRental, proposals, hazardReports, loading, refreshAccidents, refreshBikeLanes, refreshBikeParking, refreshBikeRental, refreshProposals, refreshHazardReports } = useMapData()

  const [view,           setView]          = useState('map')   // 'map' | 'proposals' | 'admin'
  const [showLogin,      setShowLogin]     = useState(false)
  const [drawnGeom,      setDrawnGeom]     = useState(null)
  const [hazardLatLng,   setHazardLatLng]  = useState(null)   // map click target for hazard form
  const [mapFlyTo,       setMapFlyTo]      = useState(null)   // [lat, lng] to fly to
  const [layers, setLayers] = useState({
    accidents:     true,
    bikeLanes:     true,
    bikeParking:   true,
    bikeRental:    true,
    proposals:     true,
    traffic:       false,
    hazardReports: true,
  })

  // ── Accident filter state ────────────────────────────────────────────────
  const [accidentDecay,     setAccidentDecay]     = useState(1)
  const [accidentDateRange, setAccidentDateRange] = useState([null, null])
  const [dataDateRange,     setDataDateRange]     = useState([null, null])
  const [showAccidentFilter, setShowAccidentFilter] = useState(false)

  // Initialise date range once accidents data arrives
  useEffect(() => {
    if (!accidents?.features?.length) return
    const times = accidents.features
      .map(f => new Date(f.properties.accident_date).getTime())
      .filter(n => !isNaN(n))
    if (!times.length) return
    const min = Math.min(...times)
    const max = Math.max(...times)
    setDataDateRange([min, max])
    setAccidentDateRange(prev => prev[0] === null ? [min, max] : prev)
  }, [accidents])

  // Filter accidents by date range, then stamp _opacity onto each feature.
  // Runs only when accidents data, date selection, or decay rate changes.
  const processedAccidents = useMemo(() => {
    if (!accidents?.features) return accidents
    const [selMin, selMax] = accidentDateRange[0] !== null ? accidentDateRange : dataDateRange
    if (!selMin || !selMax) return accidents          // data not yet loaded

    const spanMs = Math.max(selMax - selMin, 1)

    const features = accidents.features
      .filter(f => {
        const d = new Date(f.properties.accident_date).getTime()
        if (isNaN(d)) return true                    // keep undated rows
        return d >= selMin && d <= selMax
      })
      .map(f => {
        const d = new Date(f.properties.accident_date).getTime()
        // t = 0 (oldest in range) → 1 (newest in range)
        const t = isNaN(d) ? 0.5 : Math.max(0, Math.min(1, (d - selMin) / spanMs))
        // opacity = 0.2 + 0.8 * t^decayRate
        const _opacity = 0.2 + 0.8 * Math.pow(t, accidentDecay)
        return { ...f, properties: { ...f.properties, _opacity } }
      })

    return { ...accidents, features }
  }, [accidents, accidentDateRange, dataDateRange, accidentDecay])

  // Pre-warm Render backend on mount
  useEffect(() => { prewarmBackend() }, [])

  const toggleLayer = (key) => {
    setLayers(prev => {
      const next = { ...prev, [key]: !prev[key] }
      if (key === 'accidents' && !next.accidents) setShowAccidentFilter(false)
      return next
    })
  }

  const canDraw = ['user', 'city_official', 'admin'].includes(auth.role)

  return (
    <div className="app">
      <Toaster position="top-right" />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="app-header">
        <span className="logo">{t('app.title')}</span>

        <nav className="app-nav">
          {['map', 'proposals'].map(v => (
            <button key={v} className={`nav-tab${view === v ? ' active' : ''}`} onClick={() => setView(v)}>
              {t(`nav.${v}`)}
            </button>
          ))}
          <RoleGuard minRole="admin">
            <button className={`nav-tab${view === 'admin' ? ' active' : ''}`} onClick={() => setView('admin')}>
              {t('nav.admin')}
            </button>
          </RoleGuard>
        </nav>

        <RoleGuard minRole="user">
          <span
            className={`role-badge ${ROLE_COLORS[auth.role] ?? 'role-guest'}`}
            title={t(`role.${auth.role}`)}
          >
            {t(`role.${auth.role}`)}
          </span>
        </RoleGuard>

        <div className="header-spacer" />

        <button
          className="btn btn-ghost"
          style={{ fontSize: '.8rem', padding: '4px 10px' }}
          onClick={() => i18n.changeLanguage(i18n.language === 'uk' ? 'en' : 'uk')}
        >
          {t('lang.switch')}
        </button>

        {auth.isAuthenticated ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '.85rem', color: 'var(--color-muted)' }}>
              {auth.profile?.username ?? auth.user?.email}
            </span>
            <button className="btn btn-ghost" onClick={auth.signOut}>{t('app.signOut')}</button>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={() => setShowLogin(true)}>
            {t('app.signIn')}
          </button>
        )}
      </header>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main className="app-main">

        {/* Map view */}
        <div className="map-container" style={{ display: view === 'map' ? 'flex' : 'none', flex: 1 }}>
          {loading && <div className="map-loading">{t('app.loading')}</div>}

          <MapView
            accidents={processedAccidents}
            bikeLanes={bikeLanes}
            bikeParking={bikeParking}
            bikeRental={bikeRental}
            proposals={proposals}
            hazardReports={hazardReports}
            layers={layers}
            canDraw={canDraw}
            flyTo={mapFlyTo}
            onProposalDrawn={(geom) => {
              if (!auth.isAuthenticated) {
                toast(t('proposal.err.signIn'), { icon: '🔒' })
                setShowLogin(true)
                return
              }
              setDrawnGeom(geom)
            }}
            onMapClick={(latlng) => {
              if (!auth.isAuthenticated) return
              setHazardLatLng(latlng)
            }}
          />

          <div className="map-controls-wrapper">
            <LayerControls
              layers={layers}
              onToggle={toggleLayer}
              filterOpen={showAccidentFilter}
              onFilterToggle={() => setShowAccidentFilter(p => !p)}
              filterPanelProps={{
                dataDateRange,
                dateRange: accidentDateRange[0] !== null ? accidentDateRange : dataDateRange,
                onDateRange: setAccidentDateRange,
                decayRate: accidentDecay,
                onDecayRate: setAccidentDecay,
              }}
            />
          </div>
        </div>

        {/* Proposals list view */}
        {view === 'proposals' && (
          <ProposalsPage
            proposals={proposals}
            onViewOnMap={(proposal) => {
              const coords = proposal.geometry?.coordinates
              if (coords?.length) {
                const mid = coords[Math.floor(coords.length / 2)]
                setMapFlyTo([mid[1], mid[0]])
              }
              setView('map')
            }}
            onDelete={refreshProposals}
          />
        )}

        {/* Admin view */}
        {view === 'admin' && (
          <AdminPage
            onImportAccidents={refreshAccidents}
            onImportBikeLanes={() => { refreshBikeLanes(); refreshBikeParking(); refreshBikeRental() }}
          />
        )}

      </main>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}

      {drawnGeom && (
        <ProposalModal
          geometry={drawnGeom}
          onSave={refreshProposals}
          onClose={() => setDrawnGeom(null)}
        />
      )}

      {hazardLatLng && (
        <HazardReportForm
          latlng={hazardLatLng}
          onSubmit={refreshHazardReports}
          onClose={() => setHazardLatLng(null)}
        />
      )}
    </div>
  )
}

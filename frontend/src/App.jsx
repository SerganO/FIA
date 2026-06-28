import { useState, useEffect, useMemo } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import { MapView }    from './components/Map/MapView'
import { LoginModal } from './components/Auth/LoginModal'
import { RoleGuard }  from './components/Auth/RoleGuard'
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

function LayerControls({ layers, onToggle, filterOpen, onFilterToggle, filterPanelProps }) {
  const items = [
    { key: 'accidents',  label: 'Accidents',    dot: '#ef4444', filterable: true },
    { key: 'bikeLanes',  label: 'Bike Lanes',   dot: '#22c55e' },
    { key: 'proposals',  label: 'Proposals',    dot: '#3b82f6' },
    { key: 'traffic',    label: 'Live Traffic', dot: '#f97316' },
  ]
  return (
    <div className="map-controls">
      {items.map(({ key, label, dot, filterable }) => (
        <div key={key}>
          <div className="layer-toggle-row">
            <button
              className={`layer-toggle${layers[key] ? ' active' : ''}${filterable && layers[key] ? ' split-left' : ''}`}
              onClick={() => onToggle(key)}
            >
              <span className="layer-dot" style={{ background: dot }} />
              {label}
            </button>
            {filterable && layers[key] && (
              <button
                className={`layer-filter-chevron${filterOpen ? ' open' : ''}`}
                onClick={onFilterToggle}
                title="Filter accidents"
              >
                ▾
              </button>
            )}
          </div>
          {filterable && layers[key] && filterOpen && (
            <AccidentFilterPanel {...filterPanelProps} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Accident filter panel ────────────────────────────────────────────────────
// opacity = 0.25 + 0.75 * t^decayRate   (t=0 oldest, t=1 newest in range)
// decayRate=1 → linear   decayRate>1 → sharp drop-off   decayRate<1 → gradual

const toDateStr = ms => new Date(ms).toISOString().slice(0, 10)
const toMs      = str => new Date(str).getTime()

function AccidentFilterPanel({ dataDateRange, dateRange, onDateRange, decayRate, onDecayRate }) {
  const [dataMin, dataMax] = dataDateRange
  const [selMin,  selMax]  = dateRange
  if (!dataMin || !dataMax) return null

  return (
    <div className="accident-filter-panel">
      <div className="afp-title">Accident Filters</div>

      <div className="afp-row">
        <span className="afp-label">Date range</span>
        <div className="afp-dates">
          <input
            type="date"
            value={toDateStr(selMin)}
            min={toDateStr(dataMin)}
            max={toDateStr(selMax)}
            onChange={e => onDateRange([toMs(e.target.value), selMax])}
          />
          <span className="afp-sep">–</span>
          <input
            type="date"
            value={toDateStr(selMax)}
            min={toDateStr(selMin)}
            max={toDateStr(dataMax)}
            onChange={e => onDateRange([selMin, toMs(e.target.value)])}
          />
        </div>
      </div>

      <div className="afp-row">
        <div className="afp-label-row">
          <span className="afp-label">Fade rate</span>
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
          <span>Gradual</span>
          <span>Sharp</span>
        </div>
      </div>
    </div>
  )
}

function ProposalModal({ geometry, onSave, onClose }) {
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
      .catch(() => toast.error('ML service unavailable — score will be null'))
      .finally(() => setLoading(false))
  }, [geometry])

  async function handleSave() {
    if (!title.trim()) { toast.error('Please enter a title'); return }
    if (!supabase || !user) { toast.error('Sign in to save proposals'); return }
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
      toast.success('Proposal saved!')
      onSave()
      onClose()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const risk = score?.risk_level
  const safetyClass = risk ? `safety-${risk}` : 'safety-medium'

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ position: 'relative', width: 420 }}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>New Bike Lane Proposal</h2>

        {/* Safety score section */}
        <div style={{
          background: 'var(--color-bg)',
          borderRadius: 'var(--radius)',
          padding: '14px 16px',
          marginBottom: 18,
          textAlign: 'center',
        }}>
          {loading ? (
            <p style={{ color: 'var(--color-muted)', fontSize: '.9rem' }}>
              Calculating safety score…
            </p>
          ) : score ? (
            <>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1 }}>
                <span className={`safety-badge ${safetyClass}`}>
                  {score.safety_score}/100
                </span>
              </div>
              <p style={{ marginTop: 8, fontSize: '.85rem', color: 'var(--color-muted)' }}>
                {score.recommendation}
              </p>
              <div style={{ marginTop: 8, fontSize: '.75rem', color: 'var(--color-muted)', display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <span>Accidents 100m: <strong>{score.features?.accidents_within_100m}</strong></span>
                <span>Length: <strong>{Math.round(score.features?.length_m ?? 0)}m</strong></span>
                <span>Nearest lane: <strong>{Math.round(score.features?.nearest_bike_lane_m ?? 0)}m</strong></span>
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--color-muted)', fontSize: '.85rem' }}>
              Score unavailable — the proposal will be saved without an ML score.
            </p>
          )}
        </div>

        <div className="form-group">
          <label>Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. New lane on High Street" />
        </div>
        <div className="form-group">
          <label>Description (optional)</label>
          <textarea rows={3} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Context, motivation, references…" style={{ resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save Proposal'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const auth = useAuth()
  const { accidents, bikeLanes, proposals, loading, refreshProposals } = useMapData()

  const [showLogin,      setShowLogin]     = useState(false)
  const [drawnGeom,      setDrawnGeom]     = useState(null)
  const [layers, setLayers] = useState({
    accidents: true,
    bikeLanes: true,
    proposals: true,
    traffic:   false,
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
        // opacity = 0.25 + 0.75 * t^decayRate
        const _opacity = 0.25 + 0.75 * Math.pow(t, accidentDecay)
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
        <span className="logo">🚲 CycloSafe</span>

        <RoleGuard minRole="user">
          <span
            className={`role-badge ${ROLE_COLORS[auth.role] ?? 'role-guest'}`}
            title="Your access level"
          >
            {auth.role.replace('_', ' ')}
          </span>
        </RoleGuard>

        <div className="header-spacer" />

        {auth.isAuthenticated ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '.85rem', color: 'var(--color-muted)' }}>
              {auth.profile?.username ?? auth.user?.email}
            </span>
            <button className="btn btn-ghost" onClick={auth.signOut}>Sign Out</button>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={() => setShowLogin(true)}>
            Sign In
          </button>
        )}
      </header>

      {/* ── Map ────────────────────────────────────────────────────────────── */}
      <main className="app-main">
        <div className="map-container">
          {loading && <div className="map-loading">Loading map data…</div>}

          <MapView
            accidents={processedAccidents}
            bikeLanes={bikeLanes}
            proposals={proposals}
            layers={layers}
            canDraw={canDraw}
            onProposalDrawn={(geom) => {
              if (!auth.isAuthenticated) {
                toast('Sign in to save proposals', { icon: '🔒' })
                setShowLogin(true)
                return
              }
              setDrawnGeom(geom)
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
    </div>
  )
}

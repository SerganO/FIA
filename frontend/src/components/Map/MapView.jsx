import { useEffect, useRef, useState, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { MapContainer, TileLayer, GeoJSON, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import i18n from '../../i18n'
import { proposalsBySource } from '../../lib/geojson'
import { formatAccidentDateTime } from '../../lib/dates'
import { TrafficLayer } from './TrafficLayer'
import { HazardPopup } from '../Reports/HazardPopup'
import { AccidentPopup } from '../Reports/AccidentPopup'

// Fix Leaflet's default icon paths broken by Vite's asset bundling.
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon   from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl:       markerIcon,
  shadowUrl:     markerShadow,
})

// ── Severity colour map ───────────────────────────────────────────────────────
const SEVERITY_COLOR = { 1: '#facc15', 2: '#f97316', 3: '#ef4444' }

const t = (...args) => i18n.t(...args)

function accidentStyle(feature) {
  return {
    radius:      feature.properties.severity === 3 ? 8 : 6,
    fillColor:   SEVERITY_COLOR[feature.properties.severity] ?? '#94a3b8',
    color:       '#fff',
    weight:      1.5,
    opacity:     1,
    fillOpacity: feature.properties._opacity ?? 0.85,
  }
}

function isCrowdAccident(p) {
  return p?.source === 'crowdsourced'
}

const crowdAccidentIcon = L.divIcon({
  className: '',
  html: '<div style="background:#ef4444;color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">A</div>',
  iconSize:   [22, 22],
  iconAnchor: [11, 11],
  popupAnchor:[0, -12],
})

function accidentPointToLayer(feature, latlng) {
  if (isCrowdAccident(feature.properties)) {
    return L.marker(latlng, { icon: crowdAccidentIcon })
  }
  return L.circleMarker(latlng, accidentStyle(feature))
}

function accidentOnEach(feature, layer) {
  const p = feature.properties

  if (isCrowdAccident(p)) {
    const container = document.createElement('div')
    let root = null
    layer.bindPopup(container, { maxWidth: 280, minWidth: 240, className: 'custom-hazard-popup' })
    layer.on('popupopen', () => {
      root = createRoot(container)
      root.render(<AccidentPopup properties={p} />)
    })
    layer.on('popupclose', () => {
      root?.unmount()
      root = null
    })
    return
  }

  layer.bindPopup(`
    <strong>${t(`map.severity.${p.severity}`) ?? t('map.accident')}</strong><br/>
    ${p.accident_date ? `${t('map.dateTime')}: ${formatAccidentDateTime(p.accident_date, i18n.language)}<br/>` : ''}
    ${p.street_name   ? `${t('accident.street')}: ${p.street_name}<br/>` : ''}
    ${p.road_type     ? `${t('map.road')}: ${p.road_type}<br/>` : ''}
    ${p.weather       ? `${t('map.weather')}: ${p.weather}<br/>` : ''}
    ${p.light_cond    ? `${t('map.lighting')}: ${p.light_cond}` : ''}
  `)
}

function bikeLaneStyle() {
  return { color: '#22c55e', weight: 4, opacity: 0.85 }
}

function bikeLaneOnEach(feature, layer) {
  const p = feature.properties
  layer.bindPopup(`
    <strong>${p.name ?? t('map.bikeLane')}</strong><br/>
    ${p.lane_type ? `${t('map.type')}: ${p.lane_type}<br/>` : ''}
    ${p.surface   ? `${t('map.surface')}: ${p.surface}` : ''}
  `)
}

function communityProposalStyle(feature) {
  const score = feature.properties.safety_score
  const color = score == null ? '#94a3b8' : score >= 70 ? '#3b82f6' : score >= 45 ? '#f97316' : '#ef4444'
  return { color, weight: 5, opacity: 0.9, dashArray: '8 4' }
}

function officialProposalStyle(feature) {
  const score = feature.properties.safety_score
  const color = score == null ? '#a78bfa' : score >= 70 ? '#7c3aed' : score >= 45 ? '#9333ea' : '#6d28d9'
  return { color, weight: 6, opacity: 0.95, dashArray: '2 6' }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function proposalOnEach(feature, layer) {
  const p = feature.properties
  const score = p.safety_score != null ? `${p.safety_score}/100` : t('map.pending')
  const source = p.source ?? 'community'
  const descBlock = p.description
    ? `<br/><em>${escapeHtml(p.description)}</em>`
    : ''
  layer.bindPopup(`
    <strong>${escapeHtml(p.title ?? t('map.proposal'))}</strong>${descBlock}<br/>
    ${t('proposals.sourceLabel')}: ${t(`proposals.sources.${source}`) ?? source}<br/>
    ${t('map.safetyScore')}: <strong>${score}</strong><br/>
    ${t('map.status')}: ${t(`proposals.statuses.${p.status}`) ?? p.status}<br/>
    👍 ${p.upvotes ?? 0}  👎 ${p.downvotes ?? 0}
  `)
}

// ── Bike parking icon & popup ─────────────────────────────────────────────────
const parkingIcon = L.divIcon({
  className: '',
  html: '<div style="background:#3b82f6;color:#fff;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">P</div>',
  iconSize:   [18, 18],
  iconAnchor: [9, 9],
  popupAnchor:[0, -10],
})

function parkingOnEach(feature, layer) {
  const p = feature.properties
  layer.bindPopup(`
    <strong>${p.name ?? t('map.bikeParking')}</strong><br/>
    ${p.capacity    ? `${t('map.capacity')}: ${p.capacity}<br/>` : ''}
    ${p.parking_type? `${t('map.type')}: ${p.parking_type}<br/>` : ''}
    ${p.covered != null ? `${t('map.covered')}: ${p.covered ? '✓' : '✗'}` : ''}
  `)
}

// ── Bike rental icon & popup ──────────────────────────────────────────────────
const rentalIcon = L.divIcon({
  className: '',
  html: '<div style="background:#a855f7;color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">R</div>',
  iconSize:   [20, 20],
  iconAnchor: [10, 10],
  popupAnchor:[0, -11],
})

function rentalOnEach(feature, layer) {
  const p = feature.properties
  layer.bindPopup(`
    <strong>${p.name ?? t('map.bikeRental')}</strong><br/>
    ${p.network  ? `${t('map.network')}: ${p.network}<br/>` : ''}
    ${p.operator ? `${t('map.operator')}: ${p.operator}<br/>` : ''}
    ${p.capacity ? `${t('map.capacity')}: ${p.capacity}` : ''}
  `)
}

// ── Hazard report icon & popup ────────────────────────────────────────────────
const hazardIcon = L.divIcon({
  className: '',
  html: '<div style="background:#f97316;color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">!</div>',
  iconSize:   [22, 22],
  iconAnchor: [11, 11],
  popupAnchor:[0, -12],
})

function hazardOnEach(feature, layer, onHazardUpdated) {
  const p = feature.properties
  const container = document.createElement('div')
  let root = null

  layer.bindPopup(container, { maxWidth: 280, minWidth: 240, className: 'custom-hazard-popup' })

  layer.on('popupopen', () => {
    root = createRoot(container)
    root.render(<HazardPopup properties={p} onUpdated={onHazardUpdated} />)
  })

  layer.on('popupclose', () => {
    root?.unmount()
    root = null
  })
}

// Fires onMapDoubleClick when the map canvas itself is double-clicked (not a marker/feature).
// Skips when Geoman is in draw or edit mode so draw clicks don't open the report form.
function MapDoubleClickHandler({ onMapDoubleClick }) {
  const map = useMap()
  useMapEvents({
    dblclick(e) {
      if (map.pm?.globalDrawModeEnabled() || map.pm?.globalEditModeEnabled()) return
      onMapDoubleClick?.(e.latlng)
    },
  })
  return null
}

// Fly to GPS on mount; also responds to programmatic flyTo coords from parent.
function LocateOnMount({ flyTo }) {
  const map = useMap()

  // useEffect(() => {
  //   if (!navigator.geolocation) return
  //   navigator.geolocation.getCurrentPosition(
  //     ({ coords }) => map.flyTo([coords.latitude, coords.longitude], 14, { duration: 1.2 }),
  //     () => { /* permission denied — stay on Lviv */ },
  //     { timeout: 8000, maximumAge: 60000 },
  //   )
  // }, [map])

  useEffect(() => {
    if (flyTo) map.flyTo(flyTo, 15, { duration: 1.0 })
  }, [map, flyTo])

  return null
}

// Custom "Propose Lane" button rendered as a Leaflet control — no Geoman toolbar.
function DrawButtonControl({ onProposalDrawn }) {
  const map = useMap()
  const [drawing, setDrawing] = useState(false)
  const [container, setContainer] = useState(null)

  // Create a Leaflet control that owns a DOM node we can portal into.
  useEffect(() => {
    const div = L.DomUtil.create('div', '')
    L.DomEvent.disableClickPropagation(div)
    L.DomEvent.disableScrollPropagation(div)
    const ctrl = L.control({ position: 'bottomleft' })
    ctrl.onAdd = () => div
    ctrl.addTo(map)
    setContainer(div)
    return () => ctrl.remove()
  }, [map])

  useEffect(() => {
    if (!map.pm) return
    const handleCreate = (e) => {
      if (e.shape === 'Line') {
        const latlngs = e.layer.getLatLngs()
        const coordinates = latlngs.map(ll => [ll.lng, ll.lat])
        map.removeLayer(e.layer)
        setDrawing(false)
        onProposalDrawn?.({ type: 'LineString', coordinates })
      }
    }
    map.on('pm:create', handleCreate)
    return () => map.off('pm:create', handleCreate)
  }, [map, onProposalDrawn])

  function toggleDraw() {
    if (!map.pm) return
    if (drawing) {
      map.pm.disableDraw()
      setDrawing(false)
    } else {
      map.pm.enableDraw('Line', { snappable: false })
      setDrawing(true)
    }
  }

  if (!container) return null
  return createPortal(
    <button
      onClick={toggleDraw}
      style={{
        background:   drawing ? '#ef4444' : '#2563eb',
        color:        '#fff',
        border:       'none',
        borderRadius: '8px',
        padding:      '10px 20px',
        fontWeight:   700,
        fontSize:     '14px',
        cursor:       'pointer',
        boxShadow:    '0 2px 8px rgba(0,0,0,.3)',
        whiteSpace:   'nowrap',
        marginBottom: '8px',
      }}
    >
      {drawing ? t('proposal.cancelDraw') : `✏ ${t('proposal.drawBtn')}`}
    </button>,
    container,
  )
}

export function MapView({
  accidents,
  bikeLanes,
  bikeParking,
  bikeRental,
  proposals,
  hazardReports,
  layers,
  onProposalDrawn,
  onMapDoubleClick,
  canDraw,
  flyTo,
  onHazardUpdated,
}) {
  const accRef      = useRef()
  const blRef       = useRef()
  const parkingRef  = useRef()
  const rentalRef   = useRef()
  const proposalCommunityRef = useRef()
  const proposalOfficialRef  = useRef()
  const hazardRef   = useRef()

  const communityProposals = useMemo(
    () => proposalsBySource(proposals, 'community'),
    [proposals],
  )
  const officialProposals = useMemo(
    () => proposalsBySource(proposals, 'official'),
    [proposals],
  )

  // Re-render GeoJSON layers when data changes
  useEffect(() => {
    if (accRef.current) {
      accRef.current.clearLayers()
      if (accidents) accRef.current.addData(accidents)
    }
  }, [accidents])

  useEffect(() => {
    if (blRef.current) {
      blRef.current.clearLayers()
      if (bikeLanes) blRef.current.addData(bikeLanes)
    }
  }, [bikeLanes])

  useEffect(() => {
    if (parkingRef.current) {
      parkingRef.current.clearLayers()
      if (bikeParking) parkingRef.current.addData(bikeParking)
    }
  }, [bikeParking])

  useEffect(() => {
    if (rentalRef.current) {
      rentalRef.current.clearLayers()
      if (bikeRental) rentalRef.current.addData(bikeRental)
    }
  }, [bikeRental])

  useEffect(() => {
    if (proposalCommunityRef.current) {
      proposalCommunityRef.current.clearLayers()
      if (communityProposals) proposalCommunityRef.current.addData(communityProposals)
    }
  }, [communityProposals])

  useEffect(() => {
    if (proposalOfficialRef.current) {
      proposalOfficialRef.current.clearLayers()
      if (officialProposals) proposalOfficialRef.current.addData(officialProposals)
    }
  }, [officialProposals])

  useEffect(() => {
    if (hazardRef.current) {
      hazardRef.current.clearLayers()
      if (hazardReports) hazardRef.current.addData(hazardReports)
    }
  }, [hazardReports])

  return (
    <MapContainer
      center={[49.842, 24.032]}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
      doubleClickZoom={false}
    >
      {/* CartoDB Voyager basemap — free, no key required */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
        maxZoom={22}
      />

      {/* TomTom live traffic */}
      <TrafficLayer visible={layers.traffic} />

      {/* Accident markers */}
      {layers.accidents && accidents && (
        <GeoJSON
          key={`acc-${JSON.stringify(accidents).length}`}
          data={accidents}
          pointToLayer={accidentPointToLayer}
          onEachFeature={accidentOnEach}
          ref={accRef}
        />
      )}

      {/* Existing bike lanes */}
      {layers.bikeLanes && bikeLanes && (
        <GeoJSON
          key={`bl-${JSON.stringify(bikeLanes).length}`}
          data={bikeLanes}
          style={bikeLaneStyle}
          onEachFeature={bikeLaneOnEach}
          ref={blRef}
        />
      )}

      {/* Bike parking */}
      {layers.bikeParking && bikeParking && (
        <GeoJSON
          key={`bp-${JSON.stringify(bikeParking).length}`}
          data={bikeParking}
          pointToLayer={(f, ll) => L.marker(ll, { icon: parkingIcon })}
          onEachFeature={parkingOnEach}
          ref={parkingRef}
        />
      )}

      {/* Bike rental */}
      {layers.bikeRental && bikeRental && (
        <GeoJSON
          key={`br-${JSON.stringify(bikeRental).length}`}
          data={bikeRental}
          pointToLayer={(f, ll) => L.marker(ll, { icon: rentalIcon })}
          onEachFeature={rentalOnEach}
          ref={rentalRef}
        />
      )}

      {/* Community proposals */}
      {layers.proposalsCommunity && communityProposals && (
        <GeoJSON
          key={`pr-c-${JSON.stringify(communityProposals).length}`}
          data={communityProposals}
          style={communityProposalStyle}
          onEachFeature={proposalOnEach}
          ref={proposalCommunityRef}
        />
      )}

      {/* Official proposals */}
      {layers.proposalsOfficial && officialProposals && (
        <GeoJSON
          key={`pr-o-${JSON.stringify(officialProposals).length}`}
          data={officialProposals}
          style={officialProposalStyle}
          onEachFeature={proposalOnEach}
          ref={proposalOfficialRef}
        />
      )}

      {/* Hazard reports */}
      {layers.hazardReports && hazardReports && (
        <GeoJSON
          key={`hr-${JSON.stringify(hazardReports).length}`}
          data={hazardReports}
          pointToLayer={(f, ll) => L.marker(ll, { icon: hazardIcon })}
          onEachFeature={(f, l) => hazardOnEach(f, l, onHazardUpdated)}
          ref={hazardRef}
        />
      )}

      {/* Fly to user location on first load */}
      <LocateOnMount flyTo={flyTo} />

      {/* Map double-click → report form */}
      <MapDoubleClickHandler onMapDoubleClick={onMapDoubleClick} />

      {/* Custom draw button (only visible for authorised roles) */}
      {canDraw && <DrawButtonControl onProposalDrawn={onProposalDrawn} />}
    </MapContainer>
  )
}

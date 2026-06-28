import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import { TrafficLayer } from './TrafficLayer'

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
const SEVERITY_LABEL = { 1: 'Minor', 2: 'Serious', 3: 'Fatal' }

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

function accidentOnEach(feature, layer) {
  const p = feature.properties
  layer.bindPopup(`
    <strong>${SEVERITY_LABEL[p.severity] ?? 'Accident'}</strong><br/>
    ${p.accident_date ? `Date: ${p.accident_date}<br/>` : ''}
    ${p.road_type     ? `Road: ${p.road_type}<br/>` : ''}
    ${p.weather       ? `Weather: ${p.weather}<br/>` : ''}
    ${p.light_cond    ? `Lighting: ${p.light_cond}` : ''}
  `)
}

function bikeLaneStyle() {
  return { color: '#22c55e', weight: 4, opacity: 0.85 }
}

function bikeLaneOnEach(feature, layer) {
  const p = feature.properties
  layer.bindPopup(`
    <strong>${p.name ?? 'Bike Lane'}</strong><br/>
    ${p.lane_type ? `Type: ${p.lane_type}<br/>` : ''}
    ${p.surface   ? `Surface: ${p.surface}` : ''}
  `)
}

function proposalStyle(feature) {
  const score = feature.properties.safety_score
  const color = score == null ? '#94a3b8' : score >= 70 ? '#22c55e' : score >= 45 ? '#f97316' : '#ef4444'
  return { color, weight: 5, opacity: 0.9, dashArray: '8 4' }
}

function proposalOnEach(feature, layer) {
  const p = feature.properties
  const score = p.safety_score != null ? `${p.safety_score}/100` : 'Pending'
  layer.bindPopup(`
    <strong>${p.title ?? 'Proposal'}</strong><br/>
    Safety score: <strong>${score}</strong><br/>
    Status: ${p.status}<br/>
    👍 ${p.upvotes ?? 0}  👎 ${p.downvotes ?? 0}
  `)
}

// Fly to the user's GPS position on mount; silently falls back to Lviv if denied.
function LocateOnMount() {
  const map = useMap()

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => map.flyTo([coords.latitude, coords.longitude], 14, { duration: 1.2 }),
      () => { /* permission denied or unavailable — stay on Lviv */ },
      { timeout: 8000, maximumAge: 60000 },
    )
  }, [map])

  return null
}

// Geoman draw controller (mounted inside MapContainer so it can useMap)
function GeomanController({ onProposalDrawn, enabled }) {
  const map = useMap()

  useEffect(() => {
    if (!enabled) return
    if (!map.pm) return  // geoman not loaded

    map.pm.addControls({
      position:     'topleft',
      drawMarker:   false,
      drawCircle:   false,
      drawPolygon:  false,
      drawRectangle: false,
      drawCircleMarker: false,
      drawText:     false,
      editMode:     true,
      dragMode:     false,
      cutPolygon:   false,
      removalMode:  true,
    })

    const handleCreate = (e) => {
      if (e.shape === 'Line') {
        const latlngs = e.layer.getLatLngs()
        const coordinates = latlngs.map(ll => [ll.lng, ll.lat])
        const geojson = { type: 'LineString', coordinates }
        map.removeLayer(e.layer)
        if (onProposalDrawn) onProposalDrawn(geojson)
      }
    }

    map.on('pm:create', handleCreate)
    return () => {
      map.off('pm:create', handleCreate)
      if (map.pm) map.pm.removeControls()
    }
  }, [map, enabled, onProposalDrawn])

  return null
}

export function MapView({
  accidents,
  bikeLanes,
  proposals,
  layers,
  onProposalDrawn,
  canDraw,
}) {
  const accRef      = useRef()
  const blRef       = useRef()
  const proposalRef = useRef()

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
    if (proposalRef.current) {
      proposalRef.current.clearLayers()
      if (proposals) proposalRef.current.addData(proposals)
    }
  }, [proposals])

  return (
    <MapContainer
      center={[49.842, 24.032]}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
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
          pointToLayer={(f, ll) => L.circleMarker(ll, accidentStyle(f))}
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

      {/* Saved proposals */}
      {layers.proposals && proposals && (
        <GeoJSON
          key={`pr-${JSON.stringify(proposals).length}`}
          data={proposals}
          style={proposalStyle}
          onEachFeature={proposalOnEach}
          ref={proposalRef}
        />
      )}

      {/* Fly to user location on first load */}
      <LocateOnMount />

      {/* Draw toolbar (only visible for authorised roles) */}
      <GeomanController onProposalDrawn={onProposalDrawn} enabled={canDraw} />
    </MapContainer>
  )
}

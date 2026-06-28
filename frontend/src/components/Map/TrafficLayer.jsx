import { TileLayer } from 'react-leaflet'

const TOMTOM_KEY = import.meta.env.VITE_TOMTOM_API_KEY

/**
 * TomTom Traffic Flow tile layer.
 * Visibility is controlled by the `visible` prop — the component mounts/unmounts
 * cleanly so toggling doesn't leave stale tile requests.
 */
export function TrafficLayer({ visible }) {
  if (!visible || !TOMTOM_KEY) return null

  return (
    <TileLayer
      url={`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`}
      attribution='Traffic &copy; <a href="https://www.tomtom.com">TomTom</a>'
      opacity={0.7}
      maxZoom={22}
    />
  )
}

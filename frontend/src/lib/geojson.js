/** Return a GeoJSON FeatureCollection with features matching `predicate`. */
export function filterFeatureCollection(fc, predicate) {
  if (!fc?.features) return fc
  return { ...fc, features: fc.features.filter(predicate) }
}

/** Exclude resolved hazard reports (for map display). */
export function activeHazardsOnly(fc) {
  return filterFeatureCollection(fc, f => f.properties?.status !== 'resolved')
}

/** Filter proposals by source (`community` | `official`). Missing source defaults to community. */
export function proposalsBySource(fc, source) {
  return filterFeatureCollection(fc, f => (f.properties?.source ?? 'community') === source)
}

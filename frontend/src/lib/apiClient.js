import axios from 'axios'

const BASE_URL = import.meta.env.VITE_FASTAPI_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
})

export async function predictSafety(geojsonLineString) {
  const { data } = await api.post('/api/predict_safety', {
    geometry: geojsonLineString,
  })
  return data
}

export async function getModelVersions() {
  const { data } = await api.get('/api/model_versions')
  return data.versions
}

export async function triggerRetrain(notes = '') {
  const { data } = await api.post('/api/retrain', { notes })
  return data
}

export async function activateModel(version) {
  const { data } = await api.post(`/api/activate_model/${version}`)
  return data
}

/**
 * Import accidents from a CSV File object.
 * Returns { inserted, skipped }.
 */
export async function importAccidents(file) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post('/api/import/accidents', form)
  return data
}

/**
 * Import bike lanes from a GeoJSON File object.
 * Returns { inserted, skipped }.
 */
export async function importBikeLanes(file) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post('/api/import/bike_lanes', form)
  return data
}

/**
 * Import danger crossings from a GeoJSON File object.
 * Returns { inserted, skipped }.
 */
export async function importCrossings(file) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post('/api/import/crossings', form)
  return data
}

/** Pre-warm Render's free tier so there's no cold-start delay during demo. */
export function prewarmBackend() {
  api.get('/health').catch(() => {})
}

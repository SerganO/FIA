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

/** Pre-warm Render's free tier so there's no cold-start delay during demo. */
export function prewarmBackend() {
  api.get('/health').catch(() => {})
}

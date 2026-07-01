/** Value for `<input type="datetime-local" />` in local time. */
export function toLocalDatetimeValue(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Parse datetime-local input to ISO string for Postgres TIMESTAMPTZ. */
export function localDatetimeToISO(localValue) {
  if (!localValue) return null
  const d = new Date(localValue)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Display accident timestamp in the user's locale. */
export function formatAccidentDateTime(value, locale) {
  if (value == null || value === '') return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const lang = locale?.startsWith('uk') ? 'uk-UA' : undefined
  return d.toLocaleString(lang, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** End of local calendar day for date-range filters. */
export function endOfDayMs(ms) {
  const d = new Date(ms)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/** Parse accident_date from GeoJSON properties (ISO string or legacy date). */
export function parseAccidentDateMs(value) {
  if (value == null || value === '') return NaN
  const raw = typeof value === 'string' ? value : String(value)
  return new Date(raw).getTime()
}

/** Min/max accident timestamps from GeoJSON features. */
export function accidentDateExtents(features) {
  const times = (features ?? [])
    .map(f => parseAccidentDateMs(f.properties?.accident_date))
    .filter(n => !Number.isNaN(n))
  if (!times.length) return null
  return { min: Math.min(...times), max: Math.max(...times) }
}

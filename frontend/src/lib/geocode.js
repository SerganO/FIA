const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'
const USER_AGENT = 'UrbanFlow/1.0 (cyclist safety map; contact: urbanflow@local.dev)'

/** Pick the best street-like label from a Nominatim address object. */
function streetFromAddress(address = {}) {
  return (
    address.road
    || address.pedestrian
    || address.footway
    || address.path
    || address.cycleway
    || address.residential
    || address.neighbourhood
    || null
  )
}

/**
 * Reverse-geocode coordinates to a street name via OSM Nominatim (free).
 * Returns null when lookup fails or no street is found.
 */
export async function reverseGeocodeStreet(lat, lng, language) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'json',
    addressdetails: '1',
    zoom: '18',
  })
  if (language?.startsWith('uk')) params.set('accept-language', 'uk,en')

  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  })

  if (!res.ok) return null

  const data = await res.json()
  return streetFromAddress(data.address)
}

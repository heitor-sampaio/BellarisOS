// Server-side geocoding via Nominatim (OpenStreetMap). In-memory cache persists
// across requests within the same Node.js process (warm after first full render).
// For production scale, replace with a persisted cache (Redis / Supabase table).

const geocodeCache = new Map<string, { lat: number; lng: number } | null>()

async function geocodeQuery(query: string): Promise<{ lat: number; lng: number } | null> {
  if (geocodeCache.has(query)) return geocodeCache.get(query) ?? null

  try {
    const url =
      `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br`

    const res = await fetch(url, {
      headers: { 'User-Agent': 'EstéticaOS/1.0 (heitorosampaio@gmail.com)' },
      // Next.js data cache — revalidate once per day
      next: { revalidate: 86400 },
    })

    if (!res.ok) { geocodeCache.set(query, null); return null }

    const data = (await res.json()) as Array<{ lat: string; lon: string }>
    const result = data[0] ? { lat: +data[0].lat, lng: +data[0].lon } : null
    geocodeCache.set(query, result)
    return result
  } catch {
    geocodeCache.set(query, null)
    return null
  }
}

/** Geocodes an array of unique city names in parallel (Brasil context). */
export async function geocodeCities(
  cities: string[],
): Promise<Map<string, { lat: number; lng: number } | null>> {
  const unique = [...new Set(cities.filter(Boolean))]
  const pairs = await Promise.all(
    unique.map(async (city) => {
      const coords = await geocodeQuery(`${city}, Brasil`)
      return [city, coords] as const
    }),
  )
  return new Map(pairs)
}

/** Geocodes Brazilian CEPs via BrasilAPI v2; falls back to city+state via Nominatim. */
export async function geocodeCeps(
  ceps: string[],
): Promise<Map<string, { lat: number; lng: number } | null>> {
  const unique = [...new Set(ceps.map(c => c.replace(/\D/g, '')).filter(c => c.length === 8))]
  const pairs = await Promise.all(
    unique.map(async (cep) => {
      const cacheKey = `cep:${cep}`
      if (geocodeCache.has(cacheKey)) return [cep, geocodeCache.get(cacheKey) ?? null] as const
      try {
        const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, {
          next: { revalidate: 86400 },
        })
        if (!res.ok) { geocodeCache.set(cacheKey, null); return [cep, null] as const }
        const data = await res.json() as {
          street?:       string
          neighborhood?: string
          city?:         string
          state?:        string
          location?: { coordinates?: { latitude?: string | number; longitude?: string | number } }
        }

        const lat = data.location?.coordinates?.latitude
        const lng = data.location?.coordinates?.longitude

        let result: { lat: number; lng: number } | null = null

        if (lat != null && lng != null && +lat !== 0 && +lng !== 0) {
          // BrasilAPI returned precise coordinates
          result = { lat: +lat, lng: +lng }
        } else if (data.city && data.state) {
          // Fallback: build the most precise address string available
          const parts = [data.street, data.neighborhood, data.city, data.state, 'Brasil']
            .filter(Boolean)
          result = await geocodeQuery(parts.join(', '))
        }

        geocodeCache.set(cacheKey, result)
        return [cep, result] as const
      } catch {
        geocodeCache.set(cacheKey, null)
        return [cep, null] as const
      }
    }),
  )
  return new Map(pairs)
}

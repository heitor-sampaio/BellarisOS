import { NextResponse } from 'next/server'
import { geocodeCities, geocodeCeps } from '@/lib/geocoding'

export async function POST(req: Request) {
  const { cities = [], ceps = [] } = await req.json() as { cities?: string[]; ceps?: string[] }

  const [cityMap, cepMap] = await Promise.all([
    geocodeCities(cities),
    geocodeCeps(ceps),
  ])

  return NextResponse.json({
    cities: Object.fromEntries(cityMap),
    ceps:   Object.fromEntries(cepMap),
  })
}

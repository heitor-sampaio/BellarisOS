import { NextResponse } from 'next/server'
import { geocodeCities, geocodeCeps } from '@/lib/geocoding'
import { getTenantContext } from '@/lib/auth'

/**
 * Cada item vira uma consulta ao Nominatim ou ao BrasilAPI. O teto existe
 * porque o Nominatim bane o IP de quem passa de 1 consulta por segundo — e o
 * IP é o do servidor, o mesmo que o mapa de calor de toda clínica usa.
 */
const TETO = 2000

export async function POST(req: Request) {
  // `/api/*` é público no proxy: sem conferir a sessão aqui, isto era um
  // proxy aberto para qualquer um na internet.
  const ctx = await getTenantContext().catch(() => null)
  if (!ctx || ctx.isClient || !ctx.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { cities = [], ceps = [] } = await req.json() as { cities?: string[]; ceps?: string[] }
  if (!Array.isArray(cities) || !Array.isArray(ceps) || cities.length + ceps.length > TETO) {
    return NextResponse.json({ error: `Envie até ${TETO} itens.` }, { status: 413 })
  }

  const [cityMap, cepMap] = await Promise.all([
    geocodeCities(cities),
    geocodeCeps(ceps),
  ])

  return NextResponse.json({
    cities: Object.fromEntries(cityMap),
    ceps:   Object.fromEntries(cepMap),
  })
}

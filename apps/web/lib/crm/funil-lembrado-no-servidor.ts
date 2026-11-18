import 'server-only'
import { cookies } from 'next/headers'
import { COOKIE_DO_FUNIL } from '@/lib/crm/funil-lembrado'

/** O último funil escolhido (o cookie do `FunnelSelect`), ou null. */
export async function funilLembrado(): Promise<string | null> {
  try {
    return decodeURIComponent((await cookies()).get(COOKIE_DO_FUNIL)?.value ?? '') || null
  } catch {
    return null
  }
}

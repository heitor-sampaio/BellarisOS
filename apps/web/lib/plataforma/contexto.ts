import { cache } from 'react'
import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { semAcesso } from '@/lib/sem-acesso'

/**
 * Quem é da PLATAFORMA — a equipe do BellarisOS que atende as redes
 * (`/suporte`).
 *
 * Não é membro de rede: é um login do Auth com `app_metadata.plataforma` e uma
 * linha em `platform_staff`, que é a fonte de verdade (a marca do JWT só serve
 * para desviar a pessoa dos portais das redes — ver `buildContext`). Sem
 * `tenant_id`, nenhuma política de RLS de rede a alcança: o painel lê pelo
 * servidor, com o service role, e cada leitura é desta pessoa conferida aqui.
 *
 * Toda page e toda action de `/suporte` chama isto por si (o layout protege a
 * navegação, não a URL — §6).
 */
export type PapelDaPlataforma = 'SUPORTE' | 'ADMIN'

export interface PlatformContext {
  authId:  string
  staffId: string
  nome:    string
  email:   string
  papel:   PapelDaPlataforma
  ehAdmin: boolean
}

interface MembroDaPlataforma {
  id: string; name: string; email: string; papel: PapelDaPlataforma; is_active: boolean
}

/** A linha da equipe, com cache curto (desativar expira a tag na hora). */
export function getCachedStaff(authId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      return await ler(admin
        .from('platform_staff')
        .select('id, name, email, papel, is_active')
        .eq('auth_id', authId)
        .maybeSingle(), 'buscar a pessoa da plataforma') as MembroDaPlataforma | null
    },
    [`plataforma-${authId}`],
    { revalidate: 300, tags: [`plataforma:${authId}`] },
  )()
}

/** As claims que importam para a plataforma, sem confiar em nada além do JWT. */
export interface ClaimsDaSessao {
  sub:           string
  aal?:          string
  session_id?:   string
  app_metadata?: { plataforma?: string } & Record<string, unknown>
  suporte?:      unknown
}

export const lerClaims = cache(async function lerClaims(): Promise<ClaimsDaSessao | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims as ClaimsDaSessao | undefined
  if (error || !claims?.sub) return null
  return claims
})

/** A sessão é de alguém da plataforma? (Só a marca — quem decide é o banco.) */
export function marcaDaPlataforma(claims: ClaimsDaSessao | null): PapelDaPlataforma | null {
  const p = claims?.app_metadata?.plataforma
  return p === 'SUPORTE' || p === 'ADMIN' ? p : null
}

/**
 * O contexto de quem está no `/suporte`.
 *
 * - sem sessão → `/login`;
 * - sem a marca, desativado, ou numa sessão de SUPORTE (entrando como alguém
 *   de uma rede) → sem acesso;
 * - sem a verificação em duas etapas (`aal2`) → `/suporte/verificacao`, salvo
 *   para a própria tela de verificação (`semVerificacao`);
 * - `papel: 'ADMIN'` → só admin da plataforma.
 */
export const getPlatformContext = cache(async function getPlatformContext(
  opcoes: { papel?: 'ADMIN'; semVerificacao?: boolean } = {},
): Promise<PlatformContext> {
  const claims = await lerClaims()
  if (!claims) redirect('/login')
  if (!marcaDaPlataforma(claims) || claims.suporte) throw semAcesso()

  const staff = await getCachedStaff(claims.sub)
  if (!staff || !staff.is_active) throw semAcesso()

  if (!opcoes.semVerificacao && claims.aal !== 'aal2') redirect('/suporte/verificacao')
  if (opcoes.papel === 'ADMIN' && staff.papel !== 'ADMIN') throw semAcesso()

  return {
    authId:  claims.sub,
    staffId: staff.id,
    nome:    staff.name,
    email:   staff.email,
    papel:   staff.papel,
    ehAdmin: staff.papel === 'ADMIN',
  }
})

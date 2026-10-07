import { cache } from 'react'
import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createClient } from '../supabase/server'
import { createAdminClient } from '../supabase/admin'
import { ler } from '../db'
import { semAcesso } from '../sem-acesso'
import { verificacaoDaSessao } from './verificacao-exigida'
import { papelAlcanca } from './destino'

/**
 * Quem é da PLATAFORMA — a equipe do BellarisOS que atende as redes
 * (os apps `sistema` e `suporte`, cada um no seu host).
 *
 * Não é membro de rede: é um login do Auth com `app_metadata.plataforma` e uma
 * linha em `platform_staff`, que é a fonte de verdade (a marca do JWT só serve
 * para desviar a pessoa dos portais das redes — ver `buildContext`). Sem
 * `tenant_id`, nenhuma política de RLS de rede a alcança: o painel lê pelo
 * servidor, com o service role, e cada leitura é desta pessoa conferida aqui.
 *
  * Toda page e toda action do sistema e do suporte chama isto por si (o layout protege a
 * navegação, não a URL — §6).
 */
/** GERENTE (2026-10-07): vê o sistema inteiro, não edita nada, não entra no suporte. */
export type PapelDaPlataforma = 'SUPORTE' | 'ADMIN' | 'GERENTE'

export interface PlatformContext {
  authId:  string
  staffId: string
  nome:    string
  email:   string
  papel:   PapelDaPlataforma
  ehAdmin: boolean
  /** Só o ADMIN grava; o GERENTE vê. As telas do sistema travam os controles por isto. */
  podeEditar: boolean
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
  return p === 'SUPORTE' || p === 'ADMIN' || p === 'GERENTE' ? p : null
}

/**
 * O contexto de quem está no sistema ou no suporte (cada um no seu host).
 *
 * - sem sessão → `/login`;
 * - sem a marca, desativado, ou numa sessão de SUPORTE (entrando como alguém
 *   de uma rede) → sem acesso;
 * - verificação em duas etapas pendente → `/verificacao` do host, salvo para a
 *   própria tela de verificação (`semVerificacao`). Pendente é a regra de
 *   `verificacao-exigida.ts`: a plataforma a exige (opção do admin), ou a
 *   pessoa tem autenticador e ainda não digitou o código;
 * - o que a pessoa ALCANÇA (`papelAlcanca`, destino.ts): `papel: 'ADMIN'`
 *   administra o sistema (toda action que grava); `verSistema` abre as telas
 *   do sistema (ADMIN e GERENTE); sem nenhum dos dois, é o ATENDIMENTO (o
 *   suporte: SUPORTE e ADMIN). O padrão nega o GERENTE — papel novo não passa
 *   por descuido.
 */
export const getPlatformContext = cache(async function getPlatformContext(
  opcoes: { papel?: 'ADMIN'; verSistema?: boolean; semVerificacao?: boolean } = {},
): Promise<PlatformContext> {
  const claims = await lerClaims()
  if (!claims) redirect('/login')
  if (!marcaDaPlataforma(claims) || claims.suporte) throw semAcesso()

  const staff = await getCachedStaff(claims.sub)
  if (!staff || !staff.is_active) throw semAcesso()

  if (!opcoes.semVerificacao && (await verificacaoDaSessao()).pendente) redirect('/verificacao')
  const alcance = opcoes.papel === 'ADMIN' ? 'administrar' : opcoes.verSistema ? 'ver-sistema' : 'atender'
  if (!papelAlcanca(staff.papel, alcance)) throw semAcesso()

  return {
    authId:  claims.sub,
    staffId: staff.id,
    nome:    staff.name,
    email:   staff.email,
    papel:   staff.papel,
    ehAdmin: staff.papel === 'ADMIN',
    podeEditar: staff.papel === 'ADMIN',
  }
})

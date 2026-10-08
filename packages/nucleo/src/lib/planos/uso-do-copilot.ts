import { createAdminClient } from '../supabase/admin'
import { ler } from '../db'
import { cotaDoCopilot, percentualDaCota } from './recursos'

/**
 * O consumo do Copilot no mês (de Brasília) — `copilot_uso_mensal`, somado a
 * cada pedido pela clínica. Lido pela clínica (a cota que barra, a aba
 * Assinatura) e pelo sistema (a tela da rede). A cota vem do retrato do plano
 * (`cotas.copilot`, em tokens; null = sem limite).
 */

type Admin = ReturnType<typeof createAdminClient>

export function mesDeBrasilia(agora = new Date()): string {
  const [ano, mes] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .format(agora).split('-')
  return `${ano}-${mes}-01`
}

export interface UsoDoCopilot {
  tokens: number
  /** null = sem limite. */
  cota: number | null
  /** 0 a 100 (null sem cota). */
  percentual: number | null
}

export async function usoDoCopilot(admin: Admin, tenantId: string, recursos: { cotas?: { copilot: number | null } } | null): Promise<UsoDoCopilot> {
  const linha = await ler(admin.from('copilot_uso_mensal').select('tokens')
    .eq('tenant_id', tenantId).eq('mes', mesDeBrasilia()).maybeSingle(), 'ler o uso do Copilot') as { tokens: number } | null
  const tokens = Number(linha?.tokens ?? 0)
  const cota = cotaDoCopilot(recursos)
  return { tokens, cota, percentual: percentualDaCota(tokens, cota) }
}

/** "600 tokens · 100% da cota" / "1,2 mi tokens · sem limite". */
export function descreverUsoDoCopilot(u: UsoDoCopilot): string {
  const t = u.tokens >= 1_000_000
    ? `${(u.tokens / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi tokens`
    : `${u.tokens.toLocaleString('pt-BR')} tokens`
  return `${t} · ${u.percentual === null ? 'sem limite' : `${u.percentual}% da cota`}`
}

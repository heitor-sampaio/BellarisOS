import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

type Admin = ReturnType<typeof createAdminClient>

const ROTULO_DO_CAMPO: Record<string, string> = {
  phone: 'telefone', email: 'e-mail', birth_date: 'nascimento', document: 'CPF',
  documento_tipo: 'documento', documento_numero: 'documento', gender: 'sexo', notes: 'observações', tags: 'tags', name: 'nome',
}

/** "Alterou: telefone, e-mail" — os campos do evento, sem repetir. Nada alterado: a ficha já tinha tudo. */
export function textoDaUnificacao(alterou: string[] | null | undefined): string {
  const campos = [...new Set((alterou ?? []).map(c => ROTULO_DO_CAMPO[c] ?? c))]
  return campos.length ? `Alterou: ${campos.join(', ')}` : 'Nada mudou: a ficha já tinha o que foi digitado'
}

export interface UnificacaoDaFicha { id: string; date: string; subtitle: string; autor: string | null }

/**
 * As vezes em que o cadastro UNIFICOU o que se digitou nesta ficha (A23 da 7ª
 * simulação, 2026-11-05: "Unificar" não deixava registro no Histórico). O
 * fato mora na corrente de eventos (`cliente.dados_alterados` com a marca
 * `unificado`, gravado por `atualizarFichaComOPreenchido`).
 */
export async function unificacoesDaFicha(admin: Admin, tenantId: string, clientId: string): Promise<UnificacaoDaFicha[]> {
  const linhas = await ler(admin.from('domain_events')
    .select('id, ocorrido_em, dados, ator_nome')
    .eq('tenant_id', tenantId).eq('entidade', 'cliente').eq('entidade_id', clientId)
    .eq('nome', 'cliente.dados_alterados').eq('dados->>unificado', 'true')
    .order('ocorrido_em', { ascending: false }).limit(50), 'buscar as unificações da ficha') as
    { id: string; ocorrido_em: string; dados: { alterou?: string[] } | null; ator_nome: string | null }[] | null
  return (linhas ?? []).map(l => ({ id: l.id, date: l.ocorrido_em, subtitle: textoDaUnificacao(l.dados?.alterou), autor: l.ator_nome }))
}

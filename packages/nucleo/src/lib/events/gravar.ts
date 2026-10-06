import 'server-only'
import { createAdminClient } from '../supabase/admin'
import { sessaoDeSuporteAtual } from '../suporte/requisicao'
import type {
  NomeDeEvento, EntidadeDeEvento, OrigemDeEvento, AtorDoEvento, DadosDeEvento, DadosDeMembro,
} from '@estetica-os/types'

/**
 * GRAVA um fato na corrente de eventos (`domain_events`) — e só isso.
 *
 * A clínica emite por `emitirEvento` (`apps/web/lib/events/emitir.ts`), que
 * grava por aqui e depois DESPACHA para as automações. A plataforma (os apps
 * sistema e suporte) grava direto por aqui e NÃO despacha: ação da plataforma
 * não dispara automação da clínica — o mesmo princípio do modo suporte, em que
 * o fato fica registrado (a clínica vê) mas não vira mensagem ao paciente.
 *
 * Nunca lança: perder um evento é ruim; derrubar a ação porque o log falhou é
 * pior. Devolve o id do evento novo, ou null (falhou, ou a chave de
 * idempotência barrou a repetição — 23505, que não é erro).
 */
export interface EntradaDeEvento {
  tenantId:    string
  branchId?:   string | null
  entidadeId?: string | null
  dados?:      DadosDeEvento
  ator?:       AtorDoEvento
  origem?:     OrigemDeEvento
  /** Idempotência: o mesmo fato não vira dois eventos (`agendamento.confirmado:<id>`). */
  chave?:      string
  /** Momento do FATO, quando ele não é agora (webhook atrasado). */
  ocorridoEm?: Date
  /** Quantas automações houve antes deste fato (o teto do anel). */
  profundidade?: number
}

/** A entidade é sempre o prefixo do nome — não há por que pedir duas vezes. */
export function entidadeDe(nome: NomeDeEvento): EntidadeDeEvento {
  return nome.split('.')[0] as EntidadeDeEvento
}

export async function gravarEvento(
  nome: NomeDeEvento,
  e: EntradaDeEvento,
): Promise<{ id: string; suporteSessaoId: string | null } | null> {
  try {
    const suporteSessaoId = e.ator?.suporteSessaoId ?? await sessaoDeSuporteAtual()
    const { data, error } = await createAdminClient().from('domain_events').insert({
      tenant_id:   e.tenantId,
      branch_id:   e.branchId ?? null,
      nome,
      entidade:    entidadeDe(nome),
      entidade_id: e.entidadeId ?? null,
      dados:       e.dados ?? {},
      ator_id:     e.ator?.id ?? null,
      ator_nome:   e.ator?.nome ?? null,
      ator_tipo:   e.ator?.tipo ?? 'sistema',
      origem:      e.origem ?? 'app',
      chave:       e.chave ?? null,
      ocorrido_em: (e.ocorridoEm ?? new Date()).toISOString(),
      // Fato gravado numa sessão do SUPORTE da plataforma: a clínica vê o que
      // o suporte fez (Configurações → Suporte).
      suporte_sessao_id: suporteSessaoId,
    }).select('id').maybeSingle()

    // 23505 = a chave de idempotência barrou uma repetição: a trava fazendo o
    // trabalho dela, não uma falha.
    if (error && error.code !== '23505') {
      console.error('[gravarEvento]', nome, error.message)
      return null
    }
    if (error || !data) return null
    return { id: data.id as string, suporteSessaoId }
  } catch (err) {
    console.error('[gravarEvento]', nome, (err as Error).message)
    return null
  }
}

/** O retrato de um membro que os eventos `membro.*` carregam. */
export async function retratoDoMembro(userId: string, tenantId: string): Promise<{ dados: DadosDeMembro; branchId: string | null }> {
  const { data, error } = await createAdminClient()
    .from('users')
    .select('id, name, email, branch_id, role_id, provides_services, tenant_roles(label)')
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) console.error('[retratoDoMembro]', error.message)
  const cargo = data?.tenant_roles as unknown as { label?: string } | null
  return {
    branchId: (data?.branch_id as string) ?? null,
    dados: {
      nome:           (data?.name as string) ?? null,
      email:          (data?.email as string) ?? null,
      cargoId:        (data?.role_id as string) ?? null,
      cargoNome:      cargo?.label ?? null,
      unidadeId:      (data?.branch_id as string) ?? null,
      atendeNaAgenda: (data?.provides_services as boolean) ?? undefined,
    },
  }
}

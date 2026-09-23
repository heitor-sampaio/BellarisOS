import { createAdminClient } from '@/lib/supabase/admin'
import type {
  NomeDeEvento, EntidadeDeEvento, OrigemDeEvento, AtorDoEvento, DadosDeEvento,
} from '@estetica-os/types'

/**
 * Grava um fato na corrente de eventos.
 *
 * ⚠️ Mora fora de `actions/` de propósito: **todo export de um arquivo
 * `'use server'` vira um endpoint público**, e um gravador de eventos exposto
 * assim deixaria qualquer cliente forjar a corrente que as automações usam como
 * gatilho. É a mesma razão de `lib/lead-events.ts`.
 *
 * **Síncrono e aguardado**, não em `after()`: é um insert, custa pouco, e o
 * fato precisa existir mesmo que o processo morra logo depois. `after()` fica
 * para os EFEITOS (CAPI, push), que podem esperar — o registro, não.
 *
 * **Nunca lança.** Perder um evento é ruim; impedir o agendamento porque o log
 * de evento falhou é pior. O erro vai para o console, não é engolido.
 */
export interface EntradaDeEvento {
  tenantId:    string
  branchId?:   string | null
  entidadeId?: string | null
  dados?:      DadosDeEvento
  ator?:       AtorDoEvento
  origem?:     OrigemDeEvento
  /**
   * Idempotência. Com ela preenchida, o mesmo fato não vira dois eventos ainda
   * que o caminho rode duas vezes — reentrega de webhook, clique duplo,
   * retentativa. Determinística a partir do fato:
   * `agendamento.confirmado:<id>`.
   */
  chave?:      string
  /** Momento do FATO, quando ele não é agora (webhook atrasado). */
  ocorridoEm?: Date
}

/** A entidade é sempre o prefixo do nome — não há por que pedir duas vezes. */
function entidadeDe(nome: NomeDeEvento): EntidadeDeEvento {
  return nome.split('.')[0] as EntidadeDeEvento
}

export async function emitirEvento(
  nome: NomeDeEvento,
  e:    EntradaDeEvento,
): Promise<void> {
  try {
    const admin = createAdminClient()

    const { error } = await admin.from('domain_events').insert({
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
    })

    // 23505 = a chave de idempotência barrou uma repetição. Não é erro: é a
    // trava fazendo o trabalho dela, e registrar como falha poluiria o log
    // justamente no caminho que funcionou.
    if (error && error.code !== '23505') {
      console.error('[emitirEvento]', nome, error.message)
    }
  } catch (err) {
    console.error('[emitirEvento]', nome, (err as Error).message)
  }
}

/**
 * O ator a partir do contexto de quem está logado.
 *
 * Atalho porque praticamente toda emissão dentro de uma action repete os
 * mesmos três campos, e esquecer o ator é o defeito mais provável: o evento
 * grava, a automação dispara, e ninguém sabe quem causou.
 */
export function atorDoContexto(ctx: {
  internalUserId?: string | null
  userName?:       string | null
}): AtorDoEvento {
  return {
    id:   ctx.internalUserId ?? null,
    nome: ctx.userName || null,
    tipo: 'usuario',
  }
}

/** Ator de quem não é gente: webhook, cron, gatilho. */
export const ATOR_SISTEMA: AtorDoEvento = { tipo: 'sistema' }

/**
 * Os campos que mudaram entre dois estados.
 *
 * Compara só o que foi PEDIDO para mudar, não a linha inteira: `updated_at`
 * muda sempre e apareceria em toda alteração, tornando `alterou` inútil para
 * decidir se a automação dispara.
 */
export function camposAlterados(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
): string[] {
  const mudou: string[] = []
  for (const campo of Object.keys(depois)) {
    if (campo === 'updated_at') continue
    const a = antes[campo]
    const d = depois[campo]
    if (JSON.stringify(a ?? null) !== JSON.stringify(d ?? null)) mudou.push(campo)
  }
  return mudou
}

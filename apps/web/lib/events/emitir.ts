import { gravarEvento, entidadeDe, type EntradaDeEvento } from '@estetica-os/nucleo/lib/events/gravar'
import type { NomeDeEvento, AtorDoEvento } from '@estetica-os/types'

export type { EntradaDeEvento }

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
/**
 * Entrega o fato ao motor de automações.
 *
 * Em `after()`, e não no caminho crítico: gravar o evento é o compromisso
 * desta função; reagir a ele é de outra. Um motor lento — ou quebrado — não
 * pode segurar o agendamento que acabou de ser criado.
 *
 * O import é dinâmico porque `lib/automacoes/` puxa as ações, que puxam push e
 * canais: carregar essa árvore em toda emissão, inclusive nas que nenhuma
 * automação assina, sairia caro à toa.
 */
async function despachar(
  evento: Parameters<typeof import('@/lib/automacoes/executar')['despacharEvento']>[0],
  tenantId: string,
  profundidade: number,
): Promise<void> {
  try {
    const { after } = await import('next/server')
    const disparar = async () => {
      try {
        const { despacharEvento } = await import('@/lib/automacoes/executar')
        await despacharEvento(evento, tenantId, profundidade)
      } catch (e) {
        console.error('[despachar]', (e as Error).message)
      }
    }
    // Fora de um request (cron, script, gatilho do banco chamado por rota)
    // `after()` lança. Ali o trabalho roda direto: não há resposta para
    // devolver primeiro.
    try { after(disparar) } catch { await disparar() }
  } catch (e) {
    console.error('[despachar]', (e as Error).message)
  }
}

export async function emitirEvento(
  nome: NomeDeEvento,
  e:    EntradaDeEvento,
): Promise<void> {
  try {
    // O insert é do núcleo (a plataforma grava por lá, sem despachar).
    const gravado = await gravarEvento(nome, e)
    // Repetição barrada pela chave não é fato novo: não despacha — a segunda
    // tentativa de um webhook não pode mandar a mensagem de novo.
    if (!gravado) return
    // No modo suporte nada sai para o paciente — e as automações mandam
    // mensagem. O fato fica registrado (a clínica vê), mas não dispara fluxo.
    if (gravado.suporteSessaoId) return

    await despachar({
      id:         gravado.id,
      nome,
      entidade:   entidadeDe(nome),
      entidadeId: e.entidadeId ?? null,
      dados:      (e.dados ?? {}) as Record<string, unknown>,
      atorNome:   e.ator?.nome ?? null,
      atorTipo:   e.ator?.tipo ?? 'sistema',
      origem:     e.origem ?? 'app',
      ocorridoEm: (e.ocorridoEm ?? new Date()).toISOString(),
      branchId:   e.branchId ?? null,
    }, e.tenantId, e.profundidade ?? 0)
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
  suporte?:        { sessaoId: string } | null
}): AtorDoEvento {
  return {
    id:   ctx.internalUserId ?? null,
    // Numa sessão de suporte o nome já vem "Ana (via suporte: Heitor)".
    nome: ctx.userName || null,
    tipo: 'usuario',
    ...(ctx.suporte ? { suporteSessaoId: ctx.suporte.sessaoId } : {}),
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

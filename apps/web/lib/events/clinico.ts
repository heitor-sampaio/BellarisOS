import { createAdminClient } from '@/lib/supabase/admin'
import { emitirEvento, atorDoContexto, ATOR_SISTEMA } from './emitir'
import type { NomeDeEvento, DadosClinicos } from '@estetica-os/types'
import { ler } from '@/lib/db'

type Ctx = { tenantId?: string | null; internalUserId?: string | null; userName?: string | null }

/**
 * Emite um fato clínico com o cliente junto.
 *
 * O cliente vem no retrato porque toda automação clínica termina falando com
 * ele — confirmar que a anamnese chegou, avisar que o termo foi assinado,
 * lembrar do retorno depois da aplicação. Buscá-lo no motor seria uma consulta
 * por disparo.
 *
 * ⚠️ Estes eventos tocam PRONTUÁRIO, e o payload é deliberadamente magro:
 * nome do cliente, referência (ficha, termo, procedimento) e os ids. **Nada de
 * conteúdo clínico** — resposta de anamnese, foto, evolução. A corrente é lida
 * pelo motor de automações e, um dia, por integrações; dado de saúde não
 * atravessa essa fronteira por conveniência de gatilho.
 */
export async function emitirEventoClinico(
  nome: NomeDeEvento,
  entidadeId: string,
  ctx: Ctx,
  dados: {
    clientId?:      string | null
    agendamentoId?: string | null
    referencia?:    string | null
    branchId?:      string | null
    /** Idempotência; sem ela o mesmo fato pode virar dois eventos. */
    chave?:         string
  },
): Promise<void> {
  try {
    if (!ctx.tenantId) return

    let nomeCliente: string | null = null
    if (dados.clientId) {
      const data = await ler(createAdminClient()
        .from('clients').select('name')
        .eq('id', dados.clientId).eq('tenant_id', ctx.tenantId).maybeSingle(), 'buscar o cliente')
      nomeCliente = (data?.name as string) ?? null
    }

    const payload: DadosClinicos = {
      clienteId:     dados.clientId ?? null,
      clienteNome:   nomeCliente,
      agendamentoId: dados.agendamentoId ?? null,
      referencia:    dados.referencia ?? null,
    }

    await emitirEvento(nome, {
      tenantId:   ctx.tenantId,
      branchId:   dados.branchId ?? null,
      entidadeId,
      dados:      payload,
      ator:       ctx.internalUserId ? atorDoContexto(ctx) : ATOR_SISTEMA,
      chave:      dados.chave,
    })
  } catch (e) {
    console.error('[eventoClinico]', nome, (e as Error).message)
  }
}

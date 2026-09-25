import { emitirEvento, atorDoContexto, ATOR_SISTEMA } from './emitir'
import { EVENTOS } from '@estetica-os/types'
import type { DadosDeIntegracao } from '@estetica-os/types'

type Ctx = { tenantId?: string | null; internalUserId?: string | null; userName?: string | null }

/**
 * Conexão de canal ou de anúncios mudou de estado.
 *
 * **A entidade é o PROVEDOR, não a linha de `integration_configs`.** O id da
 * linha não significa nada para quem lê o evento, e a mesma rede chega a
 * apagar e recriar a config (é o que `removerConexaoUazapi` faz) sem que a
 * integração, do ponto de vista do negócio, tenha mudado de identidade.
 *
 * Deliberadamente **sem chave de idempotência**: conectar e desconectar
 * alternam a vida inteira, e o que se quer poder ler é exatamente essa
 * alternância — "caiu de novo pela terceira vez hoje" é a automação que
 * justifica o evento.
 *
 * ⚠️ Nada de token, segredo ou credencial no payload. Ele vai para uma tabela
 * lida pelo motor de automações e, um dia, por integrações; `rotulo` é o que um
 * humano usa para reconhecer a conexão, e só.
 */
export async function emitirEventoDeIntegracao(
  conectada: boolean,
  provedor: string,
  ctx: Ctx,
  extras?: { rotulo?: string | null; motivo?: string | null; numeroId?: string | null },
): Promise<void> {
  try {
    if (!ctx.tenantId) return

    const dados: DadosDeIntegracao = {
      provedor,
      rotulo: extras?.rotulo ?? null,
    }
    if (extras?.numeroId) dados.numeroId = extras.numeroId
    if (extras?.motivo)   dados.motivo   = extras.motivo

    await emitirEvento(
      conectada ? EVENTOS.INTEGRACAO_CONECTADA : EVENTOS.INTEGRACAO_DESCONECTADA,
      {
        tenantId:   ctx.tenantId,
        // Integração continua sendo da REDE: a caixa serve todas as unidades, e
        // o `branch_id` de uma linha de `whatsapp_numbers` é RÓTULO, não escopo.
        branchId:   null,
        // A entidade passa a ser a CAIXA, quando há uma. Antes era sempre nulo
        // porque a integração se confundia com o provedor; com três números na
        // rede, "a integração caiu" sem dizer qual não serve para nada.
        entidadeId: extras?.numeroId ?? null,
        dados,
        ator:       ctx.internalUserId ? atorDoContexto(ctx) : ATOR_SISTEMA,
      },
    )
  } catch (e) {
    console.error('[eventoDeIntegracao]', provedor, (e as Error).message)
  }
}

export const integracaoConectada = (
  provedor: string, ctx: Ctx, rotulo?: string | null, numeroId?: string | null,
) => emitirEventoDeIntegracao(true, provedor, ctx, { rotulo, numeroId })

export const integracaoDesconectada = (
  provedor: string, ctx: Ctx, motivo?: string | null,
  rotulo?: string | null, numeroId?: string | null,
) => emitirEventoDeIntegracao(false, provedor, ctx, { motivo, rotulo, numeroId })

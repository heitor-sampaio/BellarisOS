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
  extras?: { rotulo?: string | null; motivo?: string | null },
): Promise<void> {
  try {
    if (!ctx.tenantId) return

    const dados: DadosDeIntegracao = {
      provedor,
      rotulo: extras?.rotulo ?? null,
    }
    if (extras?.motivo) dados.motivo = extras.motivo

    await emitirEvento(
      conectada ? EVENTOS.INTEGRACAO_CONECTADA : EVENTOS.INTEGRACAO_DESCONECTADA,
      {
        tenantId:   ctx.tenantId,
        // Integração é da REDE: uma conexão de WhatsApp serve todas as unidades.
        branchId:   null,
        entidadeId: null,
        dados,
        ator:       ctx.internalUserId ? atorDoContexto(ctx) : ATOR_SISTEMA,
      },
    )
  } catch (e) {
    console.error('[eventoDeIntegracao]', provedor, (e as Error).message)
  }
}

export const integracaoConectada = (
  provedor: string, ctx: Ctx, rotulo?: string | null,
) => emitirEventoDeIntegracao(true, provedor, ctx, { rotulo })

export const integracaoDesconectada = (
  provedor: string, ctx: Ctx, motivo?: string | null,
) => emitirEventoDeIntegracao(false, provedor, ctx, { motivo })

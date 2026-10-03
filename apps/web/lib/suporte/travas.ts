import type { TenantContext } from '@estetica-os/types'

/**
 * O que a sessão de SUPORTE não faz, mesmo podendo pelo cargo do membro.
 *
 * Decisão do Heitor: no modo suporte, nada sai para o PACIENTE — mensagem no
 * inbox, campanha, pedido de assinatura, link pela conversa. Uma mensagem
 * errada em nome da clínica não se desfaz. Também não mexe na conta do membro
 * (senha, sair, aparelho de push) — essas o banco também barra.
 *
 * Devolve a mensagem para a tela (ou `null` se pode): as actions daqui
 * respondem `{ error }`, e em produção uma exceção chegaria à tela trocada.
 */
export function bloqueioDoSuporte(ctx: Pick<TenantContext, 'suporte'>, oQue: string): string | null {
  if (!ctx.suporte) return null
  return `No modo suporte não dá para ${oQue}. Isto é feito pela própria clínica.`
}

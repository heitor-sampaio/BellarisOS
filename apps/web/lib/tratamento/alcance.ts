import type { TenantContext } from '@estetica-os/types'
import { alcancaUnidade } from '@/lib/auth'

/**
 * As DUAS regras do tratamento que a cliente já comprou — o pacote, o plano
 * fechado e o procedimento pré-pago (F73; D3 da 14ª simulação). Até aqui as
 * duas eram uma só (`alcancaUnidade` com a unidade da VENDA), e a recepção da
 * Pampulha abria o pacote que a Marina comprou na Savassi e via "0 / 6
 * sessões", sem erro, enquanto a agenda da mesma recepção já usava a sessão
 * pelo "Já pago".
 *
 * 1. **Ver e agendar as sessões é da CLÍNICA** (H5, CLAUDE.md §5: "A cliente é
 *    da clínica, pode agendar em qualquer unidade da clínica"): basta o
 *    registro ser da rede de quem chama. A unidade do AGENDAMENTO é que passa
 *    pelo alcance — no núcleo (`createAppointmentCore` →
 *    `conferirPecasDoAgendamento`), como todo agendamento.
 * 2. **Mexer no dinheiro é do CAIXA da unidade da venda** (§11, "a abrangência
 *    se confere na action"): cancelar o pacote ou o plano, estornar, fechar o
 *    checkout — só quem alcança a unidade em que o dinheiro entrou.
 *
 * Toda action de pacote, plano ou pré-pago escolhe UMA das duas pelo nome:
 * `tests/tratamento-da-clinica.test.ts` trava quem voltar a decidir por conta
 * própria.
 */
export function alcancaOTratamento(
  ctx: Pick<TenantContext, 'tenantId'>, redeDoRegistro: string | null | undefined,
): boolean {
  return !!redeDoRegistro && !!ctx.tenantId && redeDoRegistro === ctx.tenantId
}

/** O dinheiro do tratamento (cancelar, estornar, fechar): a rede E a unidade da venda ao alcance. */
export function alcancaOCaixaDoTratamento(
  ctx: TenantContext, redeDoRegistro: string | null | undefined, unidadeDaVenda: string | null | undefined,
): boolean {
  return alcancaOTratamento(ctx, redeDoRegistro) && alcancaUnidade(ctx, unidadeDaVenda)
}

import { z } from 'zod'

/**
 * O "Cancelar plano" do plano AINDA NÃO ACEITO — o rascunho e o proposto (A1a
 * da 25ª simulação; o Heitor, 18/11, à pergunta "o plano proposto e ainda não
 * aceito não tem um botão 'Cancelar'. Entra?": "sim").
 *
 * Ele não tem dinheiro: a comanda do plano só nasce no aceite, e "Uma coisa só
 * foi vendida se foi paga." (o Heitor, 18/11). Cancelar é só fechar o plano,
 * com o motivo — o mesmo que o cancelamento do aceito pede (princípio 7: a
 * mesma forma). Quem cancela é quem MONTA o plano (`montaPlano`, PT2), como
 * quem o edita e o manda à cliente; o aceito segue com o "Cancelar plano" do
 * Financeiro em Gerenciar (`plano_cancelar_devolvendo`).
 *
 * Fora de `'use server'`: são regras e textos, não endpoints.
 */
export const STATUS_QUE_SE_CANCELA_SEM_DINHEIRO = ['DRAFT', 'PROPOSED'] as const

export function cancelaSemDinheiro(status: string | null | undefined): boolean {
  return !!status && (STATUS_QUE_SE_CANCELA_SEM_DINHEIRO as readonly string[]).includes(status)
}

/** Por que este plano não se cancela por aqui (nulo: se cancela). A mesma lista mora em `plano_cancelar_proposto`. */
export function recusaDoCancelamentoSemDinheiro(status: string | null | undefined): string | null {
  if (cancelaSemDinheiro(status)) return null
  if (status === 'CANCELLED' || status === 'REJECTED') return 'Este plano já foi cancelado.'
  if (status === 'COMPLETED') return 'Todas as sessões deste plano já foram feitas: não há o que cancelar.'
  if (status === 'ACCEPTED') {
    return 'Este plano já foi aceito: o cancelamento dele acerta o dinheiro e é de quem tem o Financeiro em Gerenciar ("Cancelar plano", no resumo do plano).'
  }
  return 'Plano não encontrado.'
}

/** O que a janela manda: só o motivo, obrigatório como no cancelamento do aceito. */
export const EntradaDoCancelamentoProposto = z.object({
  motivo: z.string({ required_error: 'Diga o motivo do cancelamento.' }).trim().min(1, 'Diga o motivo do cancelamento.').max(500),
})

/** O que a janela diz antes de confirmar (princípio 3: o que acontece, à vista). */
export const AVISO_DO_CANCELAMENTO_PROPOSTO =
  'O plano ainda não foi aceito: nada foi vendido nem recebido, e não há dinheiro a acertar. Ele fica cancelado, só de leitura, e sai do app da cliente; os documentos dele que esperam assinatura são cancelados. Não se desfaz.'

/** O aceite (da equipe) do plano cancelado. A frase do banco (`plano_aceitar`) começa igual. */
export const RECUSA_DO_PLANO_CANCELADO = 'Este plano foi cancelado e não pode mais ser aceito. Para tratar de novo, monte um plano novo.'

/** O aceite PELO APP do plano cancelado (era "Plano não encontrado."). */
export const RECUSA_DO_PLANO_CANCELADO_NO_APP = 'Este plano foi cancelado e não pode mais ser aceito. Fale com a equipe se quiser retomar o tratamento.'

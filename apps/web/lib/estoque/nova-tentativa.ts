/**
 * A saída de estoque calculada no app sobre o saldo LIDO (a conclusão do
 * atendimento, a entrega do produto de voucher): o banco trava a linha e
 * confere que o saldo ainda é aquele (`private.estoque_conferir_lido`). Mudou
 * no meio — outra saída, uma transferência — e ele recusa com PT409, sem gravar
 * nada. Aqui o app RELÊ e calcula de novo: `tentar` faz a leitura, a conta e a
 * gravação a cada volta.
 */

/**
 * O código de "mudou no meio" (o PostgREST responde 409). Não é o 40001
 * (serialization_failure): esse o PostgREST repete sozinho, sem reler o saldo.
 */
export const SALDO_MUDOU = 'PT409'

export async function comNovaTentativa<R extends { error: { code?: string } | null }>(
  tentar: () => Promise<R>, vezes = 3,
): Promise<R> {
  let ultimo = await tentar()
  for (let i = 1; i < vezes && ultimo.error?.code === SALDO_MUDOU; i++) ultimo = await tentar()
  return ultimo
}

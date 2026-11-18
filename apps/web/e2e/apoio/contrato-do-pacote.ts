import { expect, type Locator, type Page } from '@playwright/test'
import { banco } from './banco'
import { chamarAcao, type RespostaDeAcao } from './acao-direta'

/**
 * PC2 (auditoria das regras, 2026-11-18): com o contrato de pacote ativo na
 * rede — e toda rede nasce com o padrão (DC2) —, a venda do pacote devolve
 * `contratoParaAssinar` e NÃO grava nada: "primeiro colhe assinatura, depois
 * paga" (o Heitor, do plano; do pacote: "o ideal era funcionar como no plano
 * de tratamento").
 *
 * Nos specs que vendem pela ação e não testam o contrato, o contrato da venda
 * é DISPENSADO direto no banco (o caminho que a regra aceita, com o motivo) e
 * a venda vai de novo, com os mesmos argumentos. O que devolver outra coisa
 * (uma pergunta, um erro, a venda) volta como veio.
 */
export async function venderPacotePelaAcao(page: Page, rota: string, args: unknown[]): Promise<RespostaDeAcao> {
  const r = await chamarAcao(page, 'actions/pacotes.ts', 'venderPacote', rota, args)
  const id = contratoDaResposta(r)
  if (!id) return r
  const { error } = await banco().from('issued_documents')
    .update({ status: 'DISPENSADO', closed_reason: '[e2e] dispensado para vender', closed_at: new Date().toISOString() })
    .eq('id', id)
  expect(error, 'dispensar o contrato da venda do pacote').toBeNull()
  return chamarAcao(page, 'actions/pacotes.ts', 'venderPacote', rota, args)
}

/** O id do contrato que a venda pediu para colher antes do dinheiro, se pediu. */
export function contratoDaResposta(r: RespostaDeAcao | null | undefined): string | null {
  return /"contratoParaAssinar":\{"id":"([0-9a-f-]{36})"/.exec(r?.texto ?? '')?.[1] ?? null
}

/**
 * O mesmo pela TELA (o "Vender" → Pacote): clica em "Vender por…"; se a venda
 * mostrar o contrato a colher antes do pagamento (`[data-contrato-antes-de-vender]`,
 * com o id dele), o contrato é dispensado no banco e "Já assinou: vender" vende.
 * Para os specs que vendem pacote pela tela e não testam o contrato.
 */
export async function venderNaTelaPassandoPeloContrato(janela: Locator, vender: Locator): Promise<void> {
  await vender.click()
  const bloco = janela.locator('[data-contrato-antes-de-vender]')
  const apareceu = await bloco.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false)
  if (!apareceu) return
  const id = await bloco.getAttribute('data-contrato-antes-de-vender')
  expect(id, 'o bloco do contrato traz o id dele').toMatch(/^[0-9a-f-]{36}$/)
  const { error } = await banco().from('issued_documents')
    .update({ status: 'DISPENSADO', closed_reason: '[e2e] dispensado para vender', closed_at: new Date().toISOString() })
    .eq('id', id!)
  expect(error, 'dispensar o contrato da venda do pacote').toBeNull()
  await bloco.getByRole('button', { name: 'Já assinou: vender' }).click()
}

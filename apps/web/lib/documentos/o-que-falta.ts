/**
 * O que falta no cadastro para o documento se montar, como a pessoa lê:
 * "Cliente · CPF" → "CPF"; todo "Pagamento · …" → "o pagamento do contrato"
 * (uma vez). Recebe os rótulos de `rotuloDoQueFalta` (lib/documentos/leitura).
 * Saiu de actions/documentos-da-janela.ts para a venda do pacote dizer o mesmo
 * (D1 da 15ª simulação).
 */
export function oQueFalta(faltando: readonly string[]): string[] {
  const saida: string[] = []
  for (const f of faltando) {
    const t = f.startsWith('Pagamento ·') ? FALTA_O_PAGAMENTO : f.replace(/^Cliente · /, '')
    if (!saida.includes(t)) saida.push(t)
  }
  return saida
}

/** O que `oQueFalta` diz do pagamento do contrato (o que se define, não se completa no cadastro). */
export const FALTA_O_PAGAMENTO = 'o pagamento do contrato'

/**
 * D4 da 43ª (DG-01: quem colhe define o pagamento): sobre a lista de
 * `oQueFalta`, falta algum dado do CADASTRO ("Completar o cadastro") — o
 * pagamento do contrato não se completa na aba Dados.
 */
export function faltaNoCadastro(faltando: readonly string[]): boolean {
  return faltando.some(f => f !== FALTA_O_PAGAMENTO)
}

/** Sobre a lista de `oQueFalta`: falta o pagamento combinado do contrato ("Definir pagamento"). */
export function faltaOPagamento(faltando: readonly string[]): boolean {
  return faltando.includes(FALTA_O_PAGAMENTO)
}

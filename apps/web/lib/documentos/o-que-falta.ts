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
    const t = f.startsWith('Pagamento ·') ? 'o pagamento do contrato' : f.replace(/^Cliente · /, '')
    if (!saida.includes(t)) saida.push(t)
  }
  return saida
}

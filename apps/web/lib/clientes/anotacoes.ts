/**
 * As anotações da ficha para quem só LÊ (A32 da 26ª simulação; princípio 7):
 * o campo travado com o convite "Preferências, restrições, combinados…"
 * parecia um campo para escrever. Quem só vê lê o texto — ou "Sem anotações.".
 */
export function anotacoesParaLer(notas: string | null | undefined): string {
  const texto = notas?.trim()
  return texto ? texto : 'Sem anotações.'
}

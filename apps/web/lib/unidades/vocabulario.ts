/**
 * A clínica de UMA unidade não fala "rede" (F8 da 5ª simulação, 2026-11-02;
 * a régua é a do D-19, `redeTemUmaUnidade` / `umaUnidadeSo`).
 *
 * O D-19 tirou da clínica de uma unidade os quadros que só fazem sentido com
 * duas; o texto seguia dizendo "rede" no menu, no cargo, na Equipe, nas
 * Configurações… A troca é de VOCABULÁRIO: "rede" vira "clínica" — as duas
 * palavras são femininas, e "da rede", "nesta rede", "toda a rede" continuam
 * certos como "da clínica", "nesta clínica", "toda a clínica". Com a segunda
 * unidade, o texto volta como foi escrito.
 *
 * "Filial" não passa por aqui: a palavra do sistema é "unidade", nos dois
 * casos, e o texto já se escreve assim.
 *
 * O cargo de sistema "Admin da rede" se chama "Admin" na clínica de uma
 * unidade. Só o RÓTULO muda; a chave (`tenant_roles.key = 'NETWORK_ADMIN'`)
 * é a mesma, e é por ela que o sistema decide (lib/equipe/admin-da-rede.ts).
 */

const TROCAS: readonly [RegExp, string][] = [
  [/\badmin da rede\b/gi, 'Admin'],
  [/\brede inteira\b/gi, 'clínica toda'],
  [/\brede toda\b/gi, 'clínica toda'],
  [/\brede\b/gi, 'clínica'],
]

/** A troca com a caixa do original: "REDE" → "CLÍNICA", "Rede" → "Clínica". */
function naCaixaDe(original: string, troca: string): string {
  const letras = original.replace(/[^a-zA-ZÀ-ÿ]/g, '')
  if (letras.length > 1 && letras === letras.toUpperCase()) return troca.toUpperCase()
  const primeira = original.charAt(0)
  if (primeira !== primeira.toLowerCase()) return troca.charAt(0).toUpperCase() + troca.slice(1)
  return troca
}

/** O texto da tela com "clínica" no lugar de "rede". */
export function falaDaClinica(texto: string): string {
  let saida = texto
  for (const [padrao, troca] of TROCAS) saida = saida.replace(padrao, m => naCaixaDe(m, troca))
  return saida
}

/** A fala da tela: com UMA unidade, `falaDaClinica`; com duas ou mais, o texto como está. */
export function vocabulario(umaUnidade: boolean): (texto: string) => string {
  return umaUnidade ? falaDaClinica : (texto: string) => texto
}

/** O rótulo do cargo na tela: "Admin da rede" é "Admin" na clínica de uma unidade. */
export function rotuloDoCargo(rotulo: string, umaUnidade: boolean): string {
  return umaUnidade ? falaDaClinica(rotulo) : rotulo
}

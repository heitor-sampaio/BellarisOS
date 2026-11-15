/**
 * A fala da rede de UMA unidade (a régua é a do D-19, `redeTemUmaUnidade` /
 * `umaUnidadeSo`).
 *
 * PO2 do plano de adaptação (a revisão do Heitor, 2026-11-13: "Clinica é a
 * mesma coisa que rede e não deve existir no sistema"). Até aqui a rede de uma
 * unidade trocava "rede" por "clínica" em toda frase (F8 da 5ª simulação). Não
 * troca mais: onde a palavra é NECESSÁRIA — o rótulo que é só a rede ("Rede",
 * "Toda a rede", "A rede", o grupo das Configurações) —, entra o NOME da rede
 * ("Estética Bella"); onde não é, a frase diz "rede", a palavra do sistema
 * (os filtros e os seletores de unidade, que só servem com duas, já somem).
 * Com a segunda unidade, o texto fica como foi escrito.
 *
 * O cargo de sistema "Admin da rede" se chama "Admin" na rede de uma unidade.
 * Só o RÓTULO muda; a chave (`tenant_roles.key = 'NETWORK_ADMIN'`) é a mesma,
 * e é por ela que o sistema decide (lib/equipe/admin-da-rede.ts).
 */

/** Os rótulos que são SÓ a rede: com uma unidade, o nome dela no lugar. */
// "A rede inteira" fica: é o nome da abrangência (U1/EQ1a), e as notas da tela
// de Cargos falam nele (quem tem “A rede inteira”).
const ROTULOS_DA_REDE = new Set(['rede', 'a rede', 'da rede', 'toda a rede'])

/** O texto da tela na rede de uma unidade: o nome no rótulo que é só a rede, e "Admin" no cargo de sistema. */
export function falaDeUmaUnidade(texto: string, nomeDaRede?: string | null): string {
  const nome = nomeDaRede?.trim()
  if (nome && ROTULOS_DA_REDE.has(texto.trim().toLowerCase())) return nome
  return texto.replace(/\badmin da rede\b/gi, 'Admin')
}

/** A fala da tela: com UMA unidade, `falaDeUmaUnidade`; com duas ou mais, o texto como está. */
export function vocabulario(umaUnidade: boolean, nomeDaRede?: string | null): (texto: string) => string {
  return umaUnidade ? (texto: string) => falaDeUmaUnidade(texto, nomeDaRede) : (texto: string) => texto
}

/** O rótulo do cargo na tela: "Admin da rede" é "Admin" na rede de uma unidade. */
export function rotuloDoCargo(rotulo: string, umaUnidade: boolean): string {
  return umaUnidade ? falaDeUmaUnidade(rotulo) : rotulo
}

/**
 * Quem tem Clientes só em Ver (D4/D5 da 5ª simulação, 2026-11-01: "quem só
 * pode ver só pode ver", o Heitor). O cadastro e a edição pedem Clientes em
 * Gerenciar: a tela não oferece o botão, e a action devolve esta frase em
 * `{ error }` — lançar `semAcesso()` dentro do `useActionState` (ou de uma
 * promessa sem `catch`) derrubava a tela inteira em "Você não tem acesso".
 */
export const SO_CONSULTA_CLIENTES = 'Seu cargo só consulta os clientes: cadastrar e editar pedem Clientes em Gerenciar.'

/**
 * O CPF digitado vale: 11 dígitos, os dois verificadores conferidos, e não é
 * uma sequência repetida (111.111.111-11 "fecha" a conta e não é de ninguém).
 * Até 2026-10-29 o cadastro só conferia o TAMANHO, e o 11111111111 virava a
 * senha inicial do login da cliente (D12 da simulação). A conta é UMA: o
 * cadastro, o acesso ao app, o Copilot e a importação usam esta.
 */
export function cpfValido(cpf: string | null | undefined): boolean {
  const c = (cpf ?? '').replace(/\D/g, '')
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  const dv = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}

/**
 * O telefone NACIONAL — DDD + número, 10 (fixo) ou 11 (celular) dígitos —,
 * ou nulo. O 55 do WhatsApp (e o "+55") é tirado, como em `maskPhone`. Sem DDD
 * não se adivinha a cidade; incompleto não é telefone: "(41) 9920" passava no
 * cadastro e a ficha mostrava "(41) 9920-" (D13 da simulação de 2026-10-29).
 */
export function telefoneNacional(telefone: string | null | undefined): string | null {
  const d = (telefone ?? '').replace(/\D/g, '')
  const nacional = (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d
  return nacional.length === 10 || nacional.length === 11 ? nacional : null
}

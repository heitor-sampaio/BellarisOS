/**
 * O NOME da rede nas frases do portal e do app da cliente (CA1, a
 * recomendação aprovada pelo Heitor em 13/11 com "Concordo": "Crédito na
 * clínica", "Telefone da clínica"… passam a usar o NOME da rede). Sem artigo
 * ("Crédito em Estética Bella", "fale com Studio Manacá"): o gênero do nome
 * não se adivinha (decisão do Claude, catálogo de 24/11, como o texto neutro
 * do PO-08). Puro: a página no servidor e o componente no navegador dizem o
 * mesmo.
 */
export function falaDaRede(nome: string | null | undefined) {
  const n = nome?.trim()
  return {
    // Sem nome (não acontece: a rede nasce com nome), o do app da cliente.
    credito:  n ? `Crédito em ${n}` : 'Seu crédito',
    faleCom:  n ? `fale com ${n}` : 'fale com a rede',
    FaleCom:  n ? `Fale com ${n}` : 'Fale com a rede',
    falarCom: n ? `Falar com ${n}` : 'Falar com a rede',
    telefone: n ? `Telefone de ${n}` : 'Telefone da rede',
  }
}

export type FalaDaRede = ReturnType<typeof falaDaRede>

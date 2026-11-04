/**
 * A concordância pelo SEXO da ficha (A50 da 6ª simulação, 2026-11-04): o termo
 * dizia "fui informada(o)" ao Bruno, com o sexo cadastrado. O par "a(o)" /
 * "o(a)" no fim de uma palavra (ou sozinho: "o(a) paciente") vira a forma do
 * sexo da ficha — F, a; M, o. Sem o dado (ou "Outro"), fica como a clínica
 * escreveu. O documento montado é o que se assina (e o hash é dele): a cliente
 * lê exatamente o texto ajustado.
 *
 * Puro.
 */
export type SexoDaFicha = 'F' | 'M' | 'O' | null | undefined

const PAR = /(^|[^\p{L}])(\p{L}*?)([ao])\(([ao])\)(?!\p{L})/gu

export function concordarComOGenero(texto: string, sexo: SexoDaFicha): string {
  if (sexo !== 'F' && sexo !== 'M') return texto
  const quer = sexo === 'F' ? 'a' : 'o'
  return texto.replace(PAR, (inteiro, antes: string, raiz: string, primeira: string, segunda: string) => {
    if (primeira === segunda) return inteiro
    return `${antes}${raiz}${quer}`
  })
}

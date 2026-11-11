/**
 * O fuso horário da UNIDADE (F62, o Heitor, 2026-11-11: "Não, deixa a clinica
 * configurar o seu fuso"). Mora em `branches.fuso`; o padrão é o horário de
 * Brasília, e quem não mexer não vê nada mudar. O setup e o "Nova unidade"
 * sugerem pelo estado do CEP. Puro: roda no servidor e no navegador.
 *
 * A lista é a dos fusos do Brasil que uma clínica escolhe — o banco aceita só
 * estes (`branches_fuso_valido`). O oeste do Amazonas (Eirunepé, UTC−5) usa o
 * do Acre, que é a mesma hora.
 */

export const FUSO_PADRAO = 'America/Sao_Paulo'

export interface OpcaoDeFuso {
  valor: string
  /** O rótulo do seletor. */
  rotulo: string
  /** O nome curto, nas notas da tela: "horário de Manaus". */
  nome: string
}

export const FUSOS: readonly OpcaoDeFuso[] = [
  { valor: 'America/Sao_Paulo',    rotulo: 'Horário de Brasília (UTC−3)',                nome: 'horário de Brasília' },
  { valor: 'America/Noronha',      rotulo: 'Fernando de Noronha (UTC−2)',                nome: 'horário de Fernando de Noronha' },
  { valor: 'America/Manaus',       rotulo: 'Amazonas — Manaus (UTC−4)',                  nome: 'horário de Manaus' },
  { valor: 'America/Boa_Vista',    rotulo: 'Roraima — Boa Vista (UTC−4)',                nome: 'horário de Boa Vista' },
  { valor: 'America/Porto_Velho',  rotulo: 'Rondônia — Porto Velho (UTC−4)',             nome: 'horário de Porto Velho' },
  { valor: 'America/Cuiaba',       rotulo: 'Mato Grosso — Cuiabá (UTC−4)',               nome: 'horário de Cuiabá' },
  { valor: 'America/Campo_Grande', rotulo: 'Mato Grosso do Sul — Campo Grande (UTC−4)',  nome: 'horário de Campo Grande' },
  { valor: 'America/Rio_Branco',   rotulo: 'Acre — Rio Branco (UTC−5)',                  nome: 'horário de Rio Branco' },
]

const POR_ESTADO: Record<string, string> = {
  AM: 'America/Manaus',
  RR: 'America/Boa_Vista',
  RO: 'America/Porto_Velho',
  MT: 'America/Cuiaba',
  MS: 'America/Campo_Grande',
  AC: 'America/Rio_Branco',
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * O fuso que o estado (e a cidade) do CEP sugere: AM/RR/RO/MT/MS/AC têm o
 * seu; Fernando de Noronha (PE) fica à parte; o resto é o de Brasília.
 */
export function fusoPeloEstado(uf: string | null | undefined, cidade?: string | null): string {
  if (cidade && semAcento(cidade) === 'fernando de noronha') return 'America/Noronha'
  return POR_ESTADO[(uf ?? '').trim().toUpperCase()] ?? FUSO_PADRAO
}

/** O fuso gravado, se é um da lista; senão, o padrão. */
export function fusoValido(fuso: string | null | undefined): string {
  return FUSOS.some(f => f.valor === fuso) ? fuso! : FUSO_PADRAO
}

export function rotuloDoFuso(fuso: string | null | undefined): string {
  return FUSOS.find(f => f.valor === fusoValido(fuso))!.rotulo
}

/** "horário de Manaus" — para a nota da tela de uma unidade fora de Brasília. */
export function nomeDoFuso(fuso: string | null | undefined): string {
  return FUSOS.find(f => f.valor === fusoValido(fuso))!.nome
}

/**
 * O fuso de um conjunto de unidades: o delas, se todas têm o mesmo; com
 * fusos diferentes (ou nenhuma), o de Brasília. É o fuso da REDE no
 * consolidado (`fuso_do_recorte` no banco, a mesma regra): a janela do
 * período sai nele, e o dia de cada lançamento é o da unidade dele.
 */
export function fusoComum(fusos: readonly (string | null | undefined)[]): string {
  const validos = new Set(fusos.map(fusoValido))
  return validos.size === 1 ? [...validos][0]! : FUSO_PADRAO
}

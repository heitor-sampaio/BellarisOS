/**
 * F17-3 (o Heitor, às decisões da F17: "a ser configurado pela clínica, mas,
 * a princípio, avaliação do atendimento e avaliação por procedimento também").
 *
 * O que a cliente avalia ao confirmar o atendimento pelo app é da clínica
 * (`tenants.avaliacao_o_que`, Configurações → Geral):
 * - OS_DOIS (o padrão): a nota do ATENDIMENTO — que vale para o atendimento e
 *   a profissional — e uma para CADA procedimento feito nele;
 * - ATENDIMENTO: só a do atendimento (o ranking por procedimento fica sem
 *   nota: o procedimento sem nota própria não herda a do atendimento —
 *   princípio 4, "Não chutar número", 2026-11-18);
 * - PROCEDIMENTOS: só a de cada procedimento (a profissional fica com a
 *   média delas).
 *
 * A conta dos rankings é do banco (`metrics_notas_dos_procedimentos`, e a do
 * atendimento em `metrics_top_professionals`). Aqui fica o que a TELA diz.
 */

export const O_QUE_A_CLIENTE_AVALIA = ['OS_DOIS', 'ATENDIMENTO', 'PROCEDIMENTOS'] as const
export type OQueAClienteAvalia = typeof O_QUE_A_CLIENTE_AVALIA[number]

export const ROTULO_DO_QUE_AVALIA: Record<OQueAClienteAvalia, string> = {
  OS_DOIS:       'O atendimento e cada procedimento',
  ATENDIMENTO:   'Só o atendimento',
  PROCEDIMENTOS: 'Só cada procedimento',
}

export function oQueAvalia(valor: unknown): OQueAClienteAvalia {
  return (O_QUE_A_CLIENTE_AVALIA as readonly string[]).includes(String(valor)) ? valor as OQueAClienteAvalia : 'OS_DOIS'
}

/**
 * O que a tela diz da nota do ranking por procedimento (princípios 3 e 4,
 * 2026-11-18): o procedimento sem nota própria fica fora da média — não herda
 * a nota do atendimento (`metrics_notas_dos_procedimentos`).
 */
export const TEXTO_DA_NOTA_DO_PROCEDIMENTO =
  'O ranking de procedimentos usa só a nota própria de cada procedimento: o procedimento sem ela fica fora da média (não herda a nota do atendimento).'

export const avaliaOAtendimento = (o: OQueAClienteAvalia) => o !== 'PROCEDIMENTOS'
export const avaliaOsProcedimentos = (o: OQueAClienteAvalia) => o !== 'ATENDIMENTO'

/** A nota que a cliente deu a um procedimento do atendimento. */
export interface NotaDoProcedimento { procedureId: string; nome: string; nota: number }

/** Uma nota como a tela a mostra: "Atendimento 4/5", "Botox 5/5". */
export interface NotaNaTela { rotulo: string; nota: number }

/**
 * As notas que a cliente DEU, na ordem da tela: o atendimento e cada
 * procedimento. A avaliação de antes (sem notas por procedimento) mostra a
 * nota de procedimento dela com o nome do procedimento do agendamento. Só o
 * que ela deu — a nota do atendimento que vale para o procedimento é conta do
 * ranking, não da tela.
 */
export function notasDaAvaliacao(a: {
  client_rating?: number | null
  procedure_rating?: number | null
  procedureName: string
}, dosProcedimentos: readonly NotaDoProcedimento[] = []): NotaNaTela[] {
  const notas: NotaNaTela[] = []
  if (a.client_rating != null) notas.push({ rotulo: 'Atendimento', nota: Number(a.client_rating) })
  if (dosProcedimentos.length) {
    for (const n of dosProcedimentos) notas.push({ rotulo: n.nome, nota: n.nota })
  } else if (a.procedure_rating != null) {
    notas.push({ rotulo: a.procedureName, nota: Number(a.procedure_rating) })
  }
  return notas
}

/** "Atendimento 4/5 · Botox 5/5 · Preenchimento 4/5". */
export function textoDasNotas(notas: readonly NotaNaTela[]): string {
  return notas.map(n => `${n.rotulo} ${n.nota}/5`).join(' · ')
}

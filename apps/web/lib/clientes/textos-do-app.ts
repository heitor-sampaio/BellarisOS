import { BUSINESS_TZ, partsInTZ } from '@/lib/datetime'

/**
 * Textos do app da cliente — puros, para a tela e o teste dizerem o mesmo
 * (F73: A29, A30 e A31 da 14ª simulação; princípio 3).
 */

/**
 * O aviso depois de remarcar (A51 da 12ª: com quem; A29 da 14ª: ONDE). A
 * Marina remarcou da Savassi para a Pampulha, e o aviso não dizia a unidade
 * nova — o topo do app seguia "Manacá Savassi".
 */
export function textoDoRemarcado(p: { quemAtende: string | null; dia: string; hora: string; unidadeNova: string | null }): string {
  const com = p.quemAtende ? `: com ${p.quemAtende}` : ''
  const onde = p.unidadeNova ? `, na ${p.unidadeNova} (outro endereço)` : ''
  return `Agendamento remarcado${com}, ${p.dia} às ${p.hora}${onde}.`
}

function diaEHora(iso: string, fuso: string): { dia: string; hora: string } {
  const x = partsInTZ(new Date(iso), fuso)
  const dd = (n: number) => String(n).padStart(2, '0')
  return { dia: `${dd(x.day)}/${dd(x.month)}`, hora: `${dd(x.hour)}:${dd(x.minute)}` }
}

/**
 * O cartão "Como foram os seus atendimentos?" da home (A30 da 14ª): a sessão
 * da Savassi e a da Pampulha eram iguais, sem unidade nem hora. A hora é a
 * REAL do concluído (J-34), senão a marcada; a unidade, quando a clínica tem
 * mais de uma (quem chama decide, como o Histórico — A65).
 */
export function textoDoParaAvaliar(p: { agendadoEm: string; concluidoEm: string | null; unidade: string | null; fuso?: string }): string {
  const { dia, hora } = diaEHora(p.concluidoEm ?? p.agendadoEm, p.fuso ?? BUSINESS_TZ)
  return [`Concluído em ${dia} às ${hora}`, p.unidade, 'toque para avaliar'].filter(Boolean).join(' · ')
}

/**
 * A hora do cartão do Histórico (A31 da 14ª): "19:00 · concluído às 18:11"
 * não dizia que 19:00 era a hora MARCADA. Com a hora real ao lado, a marcada
 * se diz.
 */
export function textoDoHorarioNoHistorico(horaMarcada: string, concluido: string | null): string {
  return concluido ? `marcado para ${horaMarcada} · ${concluido}` : horaMarcada
}

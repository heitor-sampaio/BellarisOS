import { BUSINESS_TZ, partsInTZ } from '@/lib/datetime'

/**
 * Textos do app da cliente — puros, para a tela e o teste dizerem o mesmo
 * (F73: A29, A30 e A31 da 14ª simulação; princípio 3).
 */

/**
 * O aviso depois de remarcar (A51 da 12ª: com quem; A29 da 14ª: ONDE). A
 * Marina remarcou da Savassi para a Pampulha, e o aviso não dizia a unidade
 * nova — o topo do app seguia "Manacá Savassi". A12 da 19ª (H3): quem remarca
 * pelo app escolheu o horário, e ele já nasce Confirmado — o aviso diz.
 */
export function textoDoRemarcado(p: { quemAtende: string | null; dia: string; hora: string; unidadeNova: string | null }): string {
  const com = p.quemAtende ? `: com ${p.quemAtende}` : ''
  const onde = p.unidadeNova ? `, na ${p.unidadeNova} (outro endereço)` : ''
  return `Agendamento remarcado${com}, ${p.dia} às ${p.hora}${onde}. O horário novo fica confirmado.`
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

/**
 * O nome do arquivo que a rede ENVIOU, no app (A10 da 18ª simulação; princípio
 * 3): a foto do atendimento chegava com o nome técnico da equipe ("Foto
 * clínica (depois) — 16/11/2026"). No app, ela é "Uma foto do seu
 * atendimento", com o momento quando ele foi gravado; o resto fica como a
 * equipe escreveu.
 */
const MOMENTO_NO_APP: Record<string, string> = { ANTES: 'antes', DURANTE: 'durante', DEPOIS: 'depois' }
export function tituloDoArquivoNoApp(d: { name: string; category: string; momento?: string | null }): string {
  if (d.category !== 'foto_clinica') return d.name
  const momento = d.momento ? MOMENTO_NO_APP[d.momento] : undefined
  return momento ? `Uma foto do seu atendimento (${momento})` : 'Uma foto do seu atendimento'
}

/**
 * A15 da 19ª (princípio 3): o campo "Nome do documento" da foto parecia ser o
 * que a cliente lê — e o app diz "Uma foto do seu atendimento" (A10 da 18ª). O
 * campo se chama "Nome no prontuário", com esta dica.
 */
export const DICA_DO_NOME_DA_FOTO = `Só a equipe lê este nome. No app, a cliente vê “${tituloDoArquivoNoApp({ name: '', category: 'foto_clinica' })}”.`

/**
 * Quando foi, no "Confirmar e avaliar" (A15 da 18ª): a sessão marcada às 03:00
 * e concluída às 01:41 dizia só "Concluído em 16 de novembro às 01:41", e a
 * cliente não reconhecia o horário que marcou. Com a hora real diferente da
 * marcada, as duas; na mesma hora (ou sem a real), uma só.
 */
export function textoDoQuandoNoConfirmar(p: { agendadoEm: string; concluidoEm: string | null; fuso?: string }): string {
  const fuso = p.fuso ?? BUSINESS_TZ
  const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: fuso, day: 'numeric', month: 'long' })
  const hora = (iso: string) => diaEHora(iso, fuso).hora
  const marcado = { dia: dia(p.agendadoEm), hora: hora(p.agendadoEm) }
  if (!p.concluidoEm) return `${marcado.dia} às ${marcado.hora}`
  const feito = { dia: dia(p.concluidoEm), hora: hora(p.concluidoEm) }
  const concluido = `concluído em ${feito.dia} às ${feito.hora}`
  if (feito.dia === marcado.dia && feito.hora === marcado.hora) return `C${concluido.slice(1)}`
  return feito.dia === marcado.dia
    ? `Marcado para ${marcado.hora} · ${concluido}`
    : `Marcado para ${marcado.dia} às ${marcado.hora} · ${concluido}`
}

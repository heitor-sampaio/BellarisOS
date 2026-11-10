import { NODES, rotuloDoEvento } from '@estetica-os/types'
import type { TipoDeNo, GrupoDeCondicao, OperadorDeCondicao } from '@estetica-os/types'
import { rotuloDoCaminho } from './disponiveis'

/**
 * O que cada node faz, em uma frase.
 *
 * Aparece no próprio card do quadro. Quem abre um fluxo de dez nodes precisa
 * entender o que ele faz sem clicar em cada um — um quadro de caixas com o
 * mesmo rótulo genérico é um quadro que ninguém lê.
 */

const OPERADOR_TEXTO: Record<OperadorDeCondicao, string> = {
  igual:      'é',
  diferente:  'não é',
  contem:     'contém',
  nao_contem: 'não contém',
  maior:      'é maior que',
  menor:      'é menor que',
  vazio:      'está vazio',
  preenchido: 'está preenchido',
  em:         'é um de',
  nao_em:     'não é nenhum de',
}

/** O canal da mensagem como a clínica o chama (o card dizia "push: Oi…" — A14). */
const CANAL_TEXTO: Record<string, string> = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', messenger: 'Messenger', push: 'Aviso no celular',
}

/** "1 dia", "2 dias": o card é lido por quem opera, e "1 dias" salta aos olhos (J-15). */
const UNIDADES: Record<string, [string, string]> = {
  dias:    ['dia', 'dias'],
  horas:   ['hora', 'horas'],
  minutos: ['minuto', 'minutos'],
}
function quantos(n: unknown, unidade: string): string {
  const [um, varios] = UNIDADES[unidade] ?? [unidade, unidade]
  return `${n} ${Number(n) === 1 ? um : varios}`
}

/**
 * O rótulo de uma alça de saída. O grafo guarda a chave (`sim`, `nao`,
 * `padrao`), e a alça mostrava a chave crua (J-15). O caso que a clínica
 * escreveu no "Escolher por" passa como ela escreveu.
 */
const ROTULO_DA_SAIDA: Record<string, string> = { sim: 'Sim', nao: 'Não', padrao: 'Padrão' }
export function rotuloDaSaida(saida: string): string {
  return ROTULO_DA_SAIDA[saida] ?? saida
}

/**
 * Os códigos que o banco guarda, como a tela os diz (A18 da 11ª: o card dizia
 * "não é nenhum de CANCELLED, NO_SHOW, COMPLETED"). Só os de situação, que
 * nenhuma clínica escreve; o valor que a clínica escreveu passa como está.
 */
const VALOR_TEXTO: Record<string, string> = {
  SCHEDULED: 'Agendado', CONFIRMED: 'Confirmado', ARRIVED: 'Chegou', IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluído', CANCELLED: 'Cancelado', NO_SHOW: 'Não compareceu',
  OPEN: 'Aberta', WON: 'Ganha', LOST: 'Perdida',
}
const valorNaTela = (v: unknown) => (typeof v === 'string' && VALOR_TEXTO[v]) || v

/** As situações do agendamento, para o "Se" escolher pelo nome (A18 da 11ª). */
export const SITUACOES_DO_AGENDAMENTO = ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']
  .map(valor => ({ valor, rotulo: VALOR_TEXTO[valor]! }))
/** O campo é a situação de um agendamento (do contexto ou do fato). */
export const ehSituacaoDoAgendamento = (campo: string) => campo === 'agendamento.status' || campo === 'evento.dados.status'

function descreverGrupo(grupo?: GrupoDeCondicao): string {
  const regras = grupo?.regras ?? []
  if (!regras.length) return 'sem filtro'

  const partes = regras.map(r => {
    const op = OPERADOR_TEXTO[r.operador] ?? r.operador
    const valor = Array.isArray(r.valor) ? r.valor.map(valorNaTela).join(', ') : valorNaTela(r.valor)
    const campo = rotuloDoCaminho(r.campo)
    return r.operador === 'vazio' || r.operador === 'preenchido'
      ? `${campo} ${op}`
      : `${campo} ${op} ${valor ?? ''}`.trim()
  })

  const cola = grupo?.juncao === 'ou' ? ' ou ' : ' e '
  // Três já bastam para entender a intenção; o resto está no painel.
  return partes.length > 3
    ? `${partes.slice(0, 3).join(cola)} e mais ${partes.length - 3}`
    : partes.join(cola)
}

export function resumoDoNo(tipo: TipoDeNo, config: Record<string, unknown>): string {
  const c = config ?? {}

  switch (tipo as TipoDeNo) {
    case NODES.GATILHO_EVENTO: {
      // O card mostrava `conversa.mensagem_recebida`. Quem opera a clínica
      // não tem por que ler ponto e underline — e o rótulo ainda distingue
      // "Cliente não compareceu" de "Agendamento cancelado", que no nome
      // técnico ficam a um underline de distância.
      const evento = c.evento ? rotuloDoEvento(c.evento as string) : 'escolha o evento'
      const filtro = c.filtro as GrupoDeCondicao | undefined
      return filtro?.regras?.length ? `${evento} · ${descreverGrupo(filtro)}` : evento
    }

    case NODES.GATILHO_AGENDA: {
      const frequencia = (c.frequencia as string) ?? 'diaria'

      if (frequencia === 'minutos' || frequencia === 'horas') {
        const n = Number(c.intervalo ?? 0)
        if (!n) return 'escolha de quanto em quanto'
        return `a cada ${quantos(n, frequencia)}`
      }

      // Qual dia (A19 da 11ª: "Todo mês às 09:00" não dizia que é o dia 1).
      const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
      const freq = frequencia === 'mensal' ? `Todo mês, dia ${Number(c.diaDoMes ?? 1)},`
        : frequencia === 'semanal' ? `Toda semana, ${DIAS[Number(c.diaDaSemana ?? 1)] ?? 'segunda'},`
        : 'Todo dia'
      return `${freq} às ${(c.hora as string) ?? '--:--'}`
    }

    case NODES.BUSCAR_CLIENTES: {
      const partes: string[] = []
      if (c.semRetornoHaDias) partes.push(`sem retorno há ${quantos(c.semRetornoHaDias, 'dias')}`)
      if (c.aniversarioHoje)  partes.push('aniversariantes de hoje')
      if (Array.isArray(c.tags) && c.tags.length) partes.push(`tags: ${(c.tags as string[]).join(', ')}`)
      return partes.length ? partes.join(' · ') : 'todos os clientes'
    }

    case NODES.CONDICAO_SE:
      return descreverGrupo(c.grupo as GrupoDeCondicao)

    case NODES.CONDICAO_ESCOLHA: {
      const casos = (c.casos as { valor: string }[]) ?? []
      return `${(c.campo as string) ?? 'campo'} · ${casos.length} ${casos.length === 1 ? 'caso' : 'casos'}`
    }

    case NODES.ESPERA_DURACAO:
      return quantos(c.quantidade ?? '?', (c.unidade as string) ?? 'dias')

    case NODES.ESPERA_ATE: {
      const min = Number(c.minutos ?? 0)
      // A18 da 11ª: o campo pelo nome ("Data e hora do agendamento") e o tempo
      // por extenso ("1 dia") — dizia "1d antes de evento.dados.agendadoPara".
      const campo = c.campo ? `“${rotuloDoCaminho(c.campo as string)}”` : 'a data'
      if (!min) return `até ${campo}`
      const abs = Math.abs(min)
      const quanto = abs % 1440 === 0 ? quantos(abs / 1440, 'dias') : abs % 60 === 0 ? quantos(abs / 60, 'horas') : quantos(abs, 'minutos')
      return `${quanto} ${min < 0 ? 'antes de' : 'depois de'} ${campo}`
    }

    case NODES.ACAO_MENSAGEM:
      return `${CANAL_TEXTO[(c.canal as string) ?? ''] ?? (c.canal as string) ?? 'canal'}: ${trecho(c.texto as string)}`

    case NODES.ACAO_NOTIFICAR_EQUIPE: {
      const alvo = { usuario: 'uma pessoa', cargo: 'um cargo', unidade: 'a unidade' }[
        (c.alvo as string) ?? ''
      ] ?? 'a equipe'
      return `${alvo}: ${trecho(c.titulo as string) || trecho(c.corpo as string)}`
    }

    case NODES.ACAO_MOVER_ETAPA:
      if (!c.etapaNome) return 'escolha a etapa'
      // O funil só aparece quando a rede tem mais de um (é o painel que decide
      // gravá-lo): "para Fechamento" é ambíguo quando três funis têm essa etapa.
      return c.funilNome
        ? `para "${c.funilNome} · ${c.etapaNome}"`
        : `para "${c.etapaNome}"`

    case NODES.ACAO_DESFECHO:
      return (c.desfecho as string) === 'perdido' ? 'marcar como perdido' : 'marcar como ganho'

    case NODES.ACAO_TAG_CLIENTE:
      return `${c.modo === 'remover' ? 'remover' : 'adicionar'} "${(c.tag as string) ?? '…'}"`

    case NODES.ACAO_ATRIBUIR:
      return c.usuarioNome ? `para ${c.usuarioNome}` : 'tirar o responsável'

    case NODES.ACAO_ANOTAR:
      return trecho(c.texto as string)

  }

  return ''
}

function trecho(texto?: string): string {
  const t = (texto ?? '').trim()
  if (!t) return ''
  return t.length > 48 ? `${t.slice(0, 48)}…` : t
}

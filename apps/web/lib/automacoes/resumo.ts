import { NODES } from '@estetica-os/types'
import type { TipoDeNo, GrupoDeCondicao, OperadorDeCondicao } from '@estetica-os/types'

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

function descreverGrupo(grupo?: GrupoDeCondicao): string {
  const regras = grupo?.regras ?? []
  if (!regras.length) return 'sem filtro'

  const partes = regras.map(r => {
    const op = OPERADOR_TEXTO[r.operador] ?? r.operador
    const valor = Array.isArray(r.valor) ? r.valor.join(', ') : r.valor
    return r.operador === 'vazio' || r.operador === 'preenchido'
      ? `${r.campo} ${op}`
      : `${r.campo} ${op} ${valor ?? ''}`.trim()
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
      const evento = (c.evento as string) ?? 'escolha o evento'
      const filtro = c.filtro as GrupoDeCondicao | undefined
      return filtro?.regras?.length ? `${evento} · ${descreverGrupo(filtro)}` : evento
    }

    case NODES.GATILHO_AGENDA: {
      const freq = { diaria: 'Todo dia', semanal: 'Toda semana', mensal: 'Todo mês' }[
        (c.frequencia as string) ?? 'diaria'
      ] ?? 'Todo dia'
      return `${freq} às ${(c.hora as string) ?? '--:--'}`
    }

    case NODES.BUSCAR_CLIENTES: {
      const partes: string[] = []
      if (c.semRetornoHaDias) partes.push(`sem retorno há ${c.semRetornoHaDias} dias`)
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
      return `${c.quantidade ?? '?'} ${(c.unidade as string) ?? 'dias'}`

    case NODES.ESPERA_ATE: {
      const min = Number(c.minutos ?? 0)
      if (!min) return `até ${(c.campo as string) ?? 'a data'}`
      const abs = Math.abs(min)
      const quanto = abs % 1440 === 0 ? `${abs / 1440}d` : abs % 60 === 0 ? `${abs / 60}h` : `${abs}min`
      return `${quanto} ${min < 0 ? 'antes de' : 'depois de'} ${(c.campo as string) ?? 'a data'}`
    }

    case NODES.ACAO_MENSAGEM:
      return `${(c.canal as string) ?? 'canal'}: ${trecho(c.texto as string)}`

    case NODES.ACAO_NOTIFICAR_EQUIPE: {
      const alvo = { usuario: 'uma pessoa', cargo: 'um cargo', unidade: 'a unidade' }[
        (c.alvo as string) ?? ''
      ] ?? 'a equipe'
      return `${alvo}: ${trecho(c.titulo as string) || trecho(c.corpo as string)}`
    }

    case NODES.ACAO_MOVER_ETAPA:
      return c.etapaNome ? `para "${c.etapaNome}"` : 'escolha a etapa'

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

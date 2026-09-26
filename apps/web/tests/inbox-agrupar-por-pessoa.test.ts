import { describe, it, expect } from 'vitest'
import { agruparPorPessoa, canaisDaLinha, type ConversaAgrupavel } from '@/lib/inbox/lista'

/**
 * A lista do inbox é por PESSOA.
 *
 * A conversa é a thread, não a pessoa: o mesmo telefone falando com duas caixas
 * são duas conversas, e era isso que colocava a mesma pessoa duas vezes na fila.
 *
 * O agrupamento é função pura justamente para ser trancado aqui — os erros dele
 * (somar não lidas errado, esconder a espera mais antiga, fundir pessoas
 * diferentes) não dão erro nenhum na tela, só um número errado.
 */

function conversa(over: Partial<ConversaAgrupavel> & { id: string }): ConversaAgrupavel {
  return {
    contato_id: null, channel: 'whatsapp', unread_count: 0,
    last_message_at: null, awaiting_since: null,
    ...over,
  }
}

describe('agruparPorPessoa', () => {
  it('duas threads da mesma pessoa viram UMA linha', () => {
    const linhas = agruparPorPessoa([
      conversa({ id: 'mkt', contato_id: 'ana', last_message_at: '2026-09-26T10:00:00Z' }),
      conversa({ id: 'rec', contato_id: 'ana', last_message_at: '2026-09-26T09:00:00Z' }),
    ])
    expect(linhas).toHaveLength(1)
    expect(linhas[0]!.threads.map(t => t.id)).toEqual(['mkt', 'rec'])
  })

  it('a linha é representada pela thread MAIS RECENTE, em qualquer ordem de entrada', () => {
    const antiga = conversa({ id: 'antiga', contato_id: 'ana', last_message_at: '2026-09-20T10:00:00Z' })
    const nova   = conversa({ id: 'nova',   contato_id: 'ana', last_message_at: '2026-09-26T10:00:00Z' })

    expect(agruparPorPessoa([antiga, nova])[0]!.principal.id).toBe('nova')
    expect(agruparPorPessoa([nova, antiga])[0]!.principal.id).toBe('nova')
  })

  it('as não lidas SOMAM — a linha é da pessoa, e o número também', () => {
    const linhas = agruparPorPessoa([
      conversa({ id: 'a', contato_id: 'ana', unread_count: 2 }),
      conversa({ id: 'b', contato_id: 'ana', unread_count: 3 }),
    ])
    expect(linhas[0]!.naoLidas).toBe(5)
  })

  it('a espera é a MAIS ANTIGA das threads', () => {
    const linhas = agruparPorPessoa([
      conversa({ id: 'recente', contato_id: 'ana', awaiting_since: '2026-09-26T10:00:00Z' }),
      conversa({ id: 'parada',  contato_id: 'ana', awaiting_since: '2026-09-24T10:00:00Z' }),
    ])
    // Pegar a mais recente esconderia o atendimento parado há dois dias atrás
    // de um que parou agora — que é o oposto do que a fila serve para mostrar.
    expect(linhas[0]!.aguardandoDesde).toBe('2026-09-24T10:00:00Z')
  })

  it('thread sem espera não apaga a espera da irmã', () => {
    const linhas = agruparPorPessoa([
      conversa({ id: 'a', contato_id: 'ana', awaiting_since: '2026-09-24T10:00:00Z' }),
      conversa({ id: 'b', contato_id: 'ana', awaiting_since: null }),
    ])
    expect(linhas[0]!.aguardandoDesde).toBe('2026-09-24T10:00:00Z')
  })

  it('pessoas diferentes ficam em linhas diferentes', () => {
    const linhas = agruparPorPessoa([
      conversa({ id: 'a', contato_id: 'ana' }),
      conversa({ id: 'b', contato_id: 'bruno' }),
    ])
    expect(linhas).toHaveLength(2)
  })

  it('conversa SEM contato nunca é fundida com outra sem contato', () => {
    // O gatilho garante que isto não acontece, mas juntar todas as sem-contato
    // numa linha só seria fundir pessoas diferentes — o pior erro possível aqui.
    const linhas = agruparPorPessoa([
      conversa({ id: 'x', contato_id: null }),
      conversa({ id: 'y', contato_id: null }),
    ])
    expect(linhas).toHaveLength(2)
    expect(linhas.map(l => l.chave)).toEqual(['conversa:x', 'conversa:y'])
  })

  it('preserva a ordem de entrada — quem ordena é quem chama', () => {
    const linhas = agruparPorPessoa([
      conversa({ id: 'a', contato_id: 'ana',   last_message_at: '2026-09-26T10:00:00Z' }),
      conversa({ id: 'b', contato_id: 'bruno', last_message_at: '2026-09-25T10:00:00Z' }),
      conversa({ id: 'c', contato_id: 'ana',   last_message_at: '2026-09-24T10:00:00Z' }),
    ])
    // A Ana veio primeiro e continua primeiro, mesmo tendo uma thread velha
    // depois do Bruno: reordenar aqui duplicaria a regra do `order by`.
    expect(linhas.map(l => l.chave)).toEqual(['ana', 'bruno'])
  })

  it('lista vazia devolve lista vazia', () => {
    expect(agruparPorPessoa([])).toEqual([])
  })
})

describe('canaisDaLinha', () => {
  it('devolve os canais distintos, sem repetir', () => {
    const linhas = agruparPorPessoa([
      conversa({ id: 'a', contato_id: 'ana', channel: 'whatsapp' }),
      conversa({ id: 'b', contato_id: 'ana', channel: 'whatsapp' }),
      conversa({ id: 'c', contato_id: 'ana', channel: 'instagram' }),
    ])
    expect(canaisDaLinha(linhas[0]!)).toEqual(['whatsapp', 'instagram'])
  })
})

/**
 * O que a lista do inbox faz com um evento de conversa vindo do Realtime.
 *
 * A sutileza que motivou este módulo: **a conversa não nasce pronta para a
 * lista**. `resolveConversation` cria o contato primeiro e a mensagem depois,
 * e `getConversations` descarta quem não tem `last_message_at` — contato sem
 * mensagem nenhuma não é conversa, é só um cadastro. Então, quando alguém novo
 * escreve pela primeira vez, chegam DOIS eventos:
 *
 *   1. INSERT da conversa, ainda muda — não pertence à lista;
 *   2. UPDATE da conversa, feito pelo trigger `on_new_message`, que é o
 *      instante em que ela passa a pertencer.
 *
 * Tratar o UPDATE só como "mescla o que já está na lista" fazia o inbox nunca
 * mostrar conversa nova sem recarregar a página — que foi o defeito relatado.
 *
 * Mora aqui, fora do componente, porque é regra pura e é o tipo de decisão que
 * se quebra em silêncio: ninguém percebe um evento que deixou de chegar.
 */

export interface ConversaDoRealtime {
  id:              string
  last_message_at: string | null
}

export type DestinoDoEvento = 'atualizar' | 'recarregar' | 'ignorar'

/**
 * @param conversa    a linha como veio do Realtime
 * @param estaNaLista se ela já está entre as conversas exibidas
 * @param semResposta ids que o servidor JÁ se recusou a devolver — conversa de
 *                    outro dono, por exemplo. Sem esta marca, cada mensagem
 *                    trocada nelas mandaria uma consulta que não traz nada.
 */
export function destinoDoEvento(
  conversa:    ConversaDoRealtime,
  estaNaLista: boolean,
  semResposta: ReadonlySet<string> = new Set(),
): DestinoDoEvento {
  if (estaNaLista) return 'atualizar'

  // Ainda muda: o servidor não a devolveria, e um card sem última mensagem
  // apareceria por um instante só para sumir no recarregamento seguinte.
  if (!conversa.last_message_at) return 'ignorar'

  if (semResposta.has(conversa.id)) return 'ignorar'

  // Ela acabou de virar conversa. Só o servidor monta o card inteiro — tags,
  // dono, etapa e funil vêm de outras tabelas e não estão na linha do Realtime.
  return 'recarregar'
}

/**
 * Uma linha da lista do inbox: uma PESSOA, com as threads dela.
 *
 * A lista passou a ser por pessoa porque a conversa é a thread, não a pessoa
 * (CLAUDE.md §9.2.1): o mesmo telefone falando com duas caixas são duas
 * conversas, e ver a mesma pessoa duas vezes na fila é o que essa verdade
 * produzia na tela.
 *
 * ⚠️ **Pessoa é a unidade de NAVEGAÇÃO; thread continua a unidade de CONVERSA.**
 * As mensagens NÃO são intercaladas de propósito: as duas threads são separadas
 * de verdade no celular do cliente, com notificação e janela de 24h próprias.
 * Um histórico misturado mostraria uma conversa que não existe do lado dele — e
 * responder "como combinamos ontem" na thread errada é pior que um clique a
 * mais.
 */
export interface LinhaDaLista<C extends ConversaAgrupavel> {
  /** `contacts.id`, ou o id da conversa quando ela ainda não tem contato. */
  chave:      string
  /** A thread que a linha representa: a de atividade mais recente. */
  principal:  C
  /** Todas, da mais recente para a mais antiga. */
  threads:    C[]
  /** Soma das não lidas. A linha é da pessoa, e o número também. */
  naoLidas:   number
  /** A espera mais ANTIGA entre as threads — é ela que dá a urgência. */
  aguardandoDesde: string | null
}

export interface ConversaAgrupavel {
  id:              string
  contato_id:      string | null
  channel:         string
  unread_count:    number
  last_message_at: string | null
  awaiting_since:  string | null
}

/**
 * Agrupa as conversas por pessoa, preservando a ordem de quem chega primeiro.
 *
 * A ordem das linhas segue a thread mais recente de cada pessoa, e é a ordem em
 * que as conversas entram — quem chama já as traz ordenadas por
 * `last_message_at`, e reordenar aqui duplicaria a regra.
 *
 * Conversa **sem contato** não é agrupada com ninguém: ela vira uma linha
 * própria, com o id dela como chave. Não deveria existir (o gatilho
 * `trg_conversa_ganha_contato` garante), mas juntar todas as sem-contato numa
 * linha só seria fundir pessoas diferentes — o pior erro possível aqui.
 */
export function agruparPorPessoa<C extends ConversaAgrupavel>(
  conversas: C[],
): LinhaDaLista<C>[] {
  const porChave = new Map<string, LinhaDaLista<C>>()

  for (const c of conversas) {
    const chave = c.contato_id ?? `conversa:${c.id}`
    const linha = porChave.get(chave)

    if (!linha) {
      porChave.set(chave, {
        chave,
        principal:       c,
        threads:         [c],
        naoLidas:        c.unread_count ?? 0,
        aguardandoDesde: c.awaiting_since,
      })
      continue
    }

    linha.threads.push(c)
    linha.naoLidas += c.unread_count ?? 0

    // A mais recente manda na linha. Comparação de string ISO serve: mesmo fuso,
    // mesma precisão, e é o que o `order by` do banco já usou.
    const atual = linha.principal.last_message_at ?? ''
    const nova  = c.last_message_at ?? ''
    if (nova > atual) linha.principal = c

    // A espera mais ANTIGA: é a que dói. Pegar a mais recente esconderia o
    // atendimento parado há dois dias atrás de um que parou agora.
    if (c.awaiting_since && (!linha.aguardandoDesde || c.awaiting_since < linha.aguardandoDesde)) {
      linha.aguardandoDesde = c.awaiting_since
    }
  }

  for (const linha of porChave.values()) {
    linha.threads.sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''))
  }

  return [...porChave.values()]
}

/** Os canais distintos de uma linha, na ordem em que aparecem. */
export function canaisDaLinha<C extends ConversaAgrupavel>(linha: LinhaDaLista<C>): string[] {
  return [...new Set(linha.threads.map(t => t.channel))]
}

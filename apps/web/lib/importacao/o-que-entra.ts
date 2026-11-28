import { camposDoDestino, sugerirMapeamento, type ChaveDeCampo, type Destino } from '@/lib/importacao/campos'
import { nomeDiferente } from '@/lib/importacao/normalizar'

/**
 * A22 da 25ª simulação (princípio 3: nada de regra escondida): sem uma coluna
 * em "Cliente desde", a ficha nova conta como cliente nova a partir de hoje —
 * os novos clientes e o selo "Novo" contam por coalesce(cliente_desde,
 * created_at) (indicadores.md). A prévia diz, antes de importar.
 */
export function avisoSemClienteDesde(destino: Destino, mapa: readonly (ChaveDeCampo | null)[]): string | null {
  if (destino !== 'clientes' || mapa.includes('cliente_desde')) return null
  return 'Sem uma coluna em “Cliente desde”, as fichas novas contam como clientes novas a partir de hoje (em “Novos clientes” e no selo “Novo”).'
}

/**
 * A linha que JUNTOU com quem já existe (A30 da 22ª simulação; princípio 3):
 * o resultado dizia só "1 sem mudança", e a prévia tinha dito "completa o que
 * está em branco". A linha diz em quem entrou e o que dela ficou de fora —
 * só o vazio se completa (D-10), e o nome e o e-mail de quem já existe ficam.
 * Nada de fora, nada a dizer.
 */
export function avisoDaLinhaJuntada(j: {
  como: 'telefone' | 'email' | 'cpf'
  existente: { nome: string | null; email: string | null }
  linha: { nome: string | null; email: string | null }
}): string | null {
  const quem = j.existente.nome?.trim() || 'quem já existia'
  const fora: string[] = []
  if (j.existente.nome?.trim() && nomeDiferente(j.linha.nome, j.existente.nome)) fora.push(`o nome “${j.linha.nome!.trim()}”`)
  const email = j.linha.email?.trim()
  if (email && j.existente.email?.trim() && email.toLowerCase() !== j.existente.email.trim().toLowerCase()) fora.push(`o e-mail ${email}`)
  if (!fora.length) return null
  const pelo = j.como === 'email' ? 'o mesmo e-mail' : j.como === 'cpf' ? 'o mesmo CPF' : 'o mesmo telefone'
  return `Entrou em ${quem} (${pelo}). ${fora.length === 1 ? 'Ficou de fora' : 'Ficaram de fora'}: ${fora.join(' e ')} — ${quem} já tem.`
}

/**
 * O que a importação faz com as linhas prontas, contado ANTES de importar
 * (A14 da 17ª simulação; princípio 3): a prévia dizia "10 linhas prontas" e o
 * botão "Importar 10 linhas", e entravam 9 contatos — uma linha juntava com
 * outra. O aviso existia; o número do botão prometia outra coisa. Puro: a
 * prévia e o teste dividem a conta.
 */

interface LinhaPronta {
  numero: number
  dados: { phone?: unknown }
  /** Clientes: o telefone desta linha já veio numa anterior, com outro nome. */
  mesmoTelefone?: { numero: number; nome: string }
}

/**
 * As linhas que juntam com OUTRA linha da planilha (não viram pessoa nova):
 * - contatos: o mesmo telefone de uma linha anterior — a que cruza com quem já
 *   existe conta como "completa quem já existe", não aqui;
 * - clientes: a do mesmo telefone com outro nome, a não ser que a rede a tenha
 *   desmarcado ("vira uma ficha separada").
 */
export function linhasQueJuntamNaPlanilha(
  destino: Destino, prontas: readonly LinhaPronta[], cruzadas: ReadonlySet<number>, separadas: ReadonlySet<number>,
): number[] {
  if (destino === 'clientes') {
    return prontas.filter(l => l.mesmoTelefone && !cruzadas.has(l.numero) && !separadas.has(l.numero)).map(l => l.numero)
  }
  const primeira = new Set<string>()
  const juntam: number[] = []
  for (const l of prontas) {
    const fone = typeof l.dados.phone === 'string' ? l.dados.phone : ''
    if (!fone) continue
    if (!primeira.has(fone)) primeira.add(fone)
    else if (!cruzadas.has(l.numero)) juntam.push(l.numero)
  }
  return juntam
}

/**
 * As linhas de clientes que NÃO juntam (o `naoCompletar` que vai ao servidor):
 * a ficha sem CPF do mesmo telefone que a linha completaria (IM-13) e a linha
 * anterior do mesmo telefone com que ela juntaria (IM-15). O padrão é o nome:
 * só junta quando ele casa (`nomeDiferente`, a comparação da importação) — o
 * Heitor, 25/11, escolheu "Vem desmarcada, a não ser que o nome case"
 * (princípio 4: mãe e filha dividem o número). `escolhas` é o que a pessoa
 * marcou ou desmarcou na prévia (true = juntar), e vence o padrão. O mesmo
 * CPF junta sempre (é a mesma pessoa): não tem caixa.
 */
interface EscolhasDaPrevia {
  prontas: readonly { numero: number; dados: { name?: unknown }; mesmoTelefone?: { numero: number; nome: string } }[]
  cruzados: readonly { numero: number; nome: string; como: 'cpf' | 'telefone' | 'email' }[]
  escolhas: ReadonlyMap<number, boolean>
}

/** Cada linha com caixa de juntar: se junta, e se o nome casa. */
function decisoesDaPrevia(p: EscolhasDaPrevia): { numero: number; juntar: boolean; nomeCasa: boolean }[] {
  const nomeDa = new Map(p.prontas.map(l => [l.numero, typeof l.dados.name === 'string' ? l.dados.name : undefined]))
  const comQuem = new Map<number, string>()
  for (const l of p.prontas) if (l.mesmoTelefone) comQuem.set(l.numero, l.mesmoTelefone.nome)
  // A que cruza com uma ficha da rede é decidida por ela (a prévia a mostra ali).
  for (const c of p.cruzados) if (c.como === 'telefone') comQuem.set(c.numero, c.nome)
  for (const c of p.cruzados) if (c.como !== 'telefone') comQuem.delete(c.numero)
  return [...comQuem].map(([numero, nome]) => {
    const nomeCasa = !nomeDiferente(nomeDa.get(numero), nome)
    return { numero, nomeCasa, juntar: p.escolhas.get(numero) ?? nomeCasa }
  })
}

export function linhasQueNaoJuntam(p: EscolhasDaPrevia): Set<number> {
  return new Set(decisoesDaPrevia(p).filter(d => !d.juntar).map(d => d.numero))
}

/**
 * As linhas de OUTRO nome que a pessoa marcou para juntar (`importacoes.juntar`):
 * sem essa marca, o servidor não junta pelo telefone a linha cujo nome não casa
 * com o da ficha (`gravarCliente`) — a regra vale mesmo que a prévia não tenha
 * conseguido cruzar a planilha.
 */
export function linhasDeOutroNomeQueJuntam(p: EscolhasDaPrevia): number[] {
  return decisoesDaPrevia(p).filter(d => d.juntar && !d.nomeCasa).map(d => d.numero).sort((a, b) => a - b)
}

/** O número com o milhar ("1.235"), como o resto do sistema (A1 e D13 da 40ª). */
const numero = (n: number) => n.toLocaleString('pt-BR')
const plural = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`

/** "Importar 10 linhas: 9 contatos novos, 1 linha junta com outra" — só o "Importar N linhas" quando todas viram pessoa nova. */
export function textoDoBotaoDeImportar(p: { destino: Destino; prontas: number; juntamNaPlanilha: number; completam: number }): string {
  const base = `Importar ${plural(p.prontas, 'linha', 'linhas')}`
  if (!p.juntamNaPlanilha && !p.completam) return base
  const novos = Math.max(0, p.prontas - p.juntamNaPlanilha - p.completam)
  const partes = [
    novos === 0
      ? (p.destino === 'clientes' ? 'nenhuma ficha nova' : 'nenhum contato novo')
      : p.destino === 'clientes' ? plural(novos, 'ficha nova', 'fichas novas') : plural(novos, 'contato novo', 'contatos novos'),
    p.completam ? `${numero(p.completam)} ${p.completam === 1 ? 'completa' : 'completam'} quem já existe` : null,
    p.juntamNaPlanilha ? `${plural(p.juntamNaPlanilha, 'linha junta', 'linhas juntam')} com outra` : null,
  ]
  return `${base}: ${partes.filter(Boolean).join(', ')}`
}

/**
 * As colunas da planilha que ficam de fora — as em "Não importar" (A19 da 20ª
 * simulação; princípio 3): a coluna "origem" de uma importação sem
 * oportunidade sumia calada (a origem não vira tag — T3). A prévia diz quais,
 * pelo cabeçalho; sem cabeçalho, "Coluna N", como o passo das colunas.
 */
export function colunasQueNaoEntram(cabecalho: readonly string[], mapa: readonly (string | null)[]): string[] {
  return cabecalho.map((h, i) => (mapa[i] ? null : h.trim() || `Coluna ${i + 1}`)).filter((h): h is string => !!h)
}

/**
 * As colunas em "Não importar" que a OPORTUNIDADE levaria (A20 da 21ª
 * simulação; princípio 3): "A coluna “origem” não será importada" não dizia
 * que, importando com oportunidade, ela vira a origem da oportunidade. É a
 * sugestão de colunas com a oportunidade ligada, só nas colunas de fora.
 */
export function colunasQueAOportunidadeLeva(
  cabecalho: readonly string[], mapa: readonly (string | null)[], destino: Destino,
): { coluna: string; chave: ChaveDeCampo; rotulo: string }[] {
  const campos = camposDoDestino(destino, { oportunidade: true })
  const sugestao = sugerirMapeamento([...cabecalho], destino, { oportunidade: true })
  return cabecalho.flatMap((h, i) => {
    const chave = sugestao[i]
    const campo = chave ? campos.find(c => c.chave === chave) : null
    if (mapa[i] || !campo || campo.grupo !== 'oportunidade') return []
    return [{ coluna: h.trim() || `Coluna ${i + 1}`, chave: campo.chave, rotulo: campo.rotulo }]
  })
}

/**
 * "Importando com oportunidade (passo 1), ela vira a origem da oportunidade."
 * `deFora` é quantas colunas ficaram de fora: com mais de uma, o "ela" não
 * diria qual — a frase cita a coluna.
 */
export function avisoDasColunasDaOportunidade(
  levadas: readonly { coluna: string; chave: ChaveDeCampo; rotulo: string }[], deFora = levadas.length,
): string | null {
  if (!levadas.length) return null
  const base = 'Importando com oportunidade (passo 1)'
  const l = levadas[0]
  if (l && levadas.length === 1) {
    const quem = deFora > 1 ? `“${l.coluna}”` : 'ela'
    return l.chave === 'op_origem'
      ? `${base}, ${quem} vira a origem da oportunidade.`
      : `${base}, ${quem} entra no card como ${l.rotulo}.`
  }
  const itens = levadas.map(l => `“${l.coluna}” como ${l.rotulo}`)
  return `${base}, elas entram no card: ${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}.`
}

/**
 * Onde estão os importados, no fim da importação (A19 da 21ª simulação; a
 * sobra do A15 da 6ª): os contatos sem oportunidade não aparecem em Clientes,
 * Oportunidades nem Inbox — só na busca, em "Contatos do CRM", e só para quem
 * cria oportunidade (`busca.md`). Sem isso, quem importava achava que nada
 * tinha entrado.
 */
export function ondeEstaoOsImportados(p: { destino: Destino; comOportunidade: boolean; podeCriarOportunidade: boolean }): {
  texto: string; link: 'clientes' | 'oportunidades' | 'busca' | null
} {
  if (p.destino === 'clientes') return { texto: 'As fichas estão em Clientes.', link: 'clientes' }
  if (p.comOportunidade) return { texto: 'Os contatos estão no quadro de Oportunidades, cada um com a sua.', link: 'oportunidades' }
  if (!p.podeCriarOportunidade) {
    return { texto: 'Os contatos sem oportunidade ficam no CRM e aparecem no Inbox quando a conversa começar.', link: null }
  }
  return {
    texto: 'Os contatos sem oportunidade não aparecem em Clientes, Oportunidades nem Inbox: ache cada um na busca do topo (Ctrl K), em “Contatos do CRM” — abrir cria a oportunidade dele.',
    link: 'busca',
  }
}

/**
 * O placar de uma importação, numa linha (o resultado e o histórico dizem
 * igual). A5 da 23ª simulação (princípio 3): "8 novos · 0 completados · 1 sem
 * mudança · 1 com aviso · 1 recusada" somava 11 de 10 linhas — "com aviso" é
 * das que ENTRARAM (nova, completada ou sem mudança), não uma situação a mais.
 */
export function placarDaImportacao(a: {
  novas: number; completadas: number; semMudanca: number; comAviso: number; recusadas: number; oportunidades: number
}): string {
  const entraram = a.novas + a.completadas + a.semMudanca
  return [
    plural(a.novas, 'novo', 'novos'), plural(a.completadas, 'completado', 'completados'),
    a.semMudanca ? `${numero(a.semMudanca)} sem mudança` : null,
    plural(a.recusadas, 'recusada', 'recusadas'),
    a.oportunidades ? plural(a.oportunidades, 'oportunidade', 'oportunidades') : null,
    a.comAviso ? (entraram === 1 ? 'a que entrou, com aviso' : `das ${numero(entraram)} que entraram, ${numero(a.comAviso)} com aviso`) : null,
  ].filter(Boolean).join(' · ')
}

/**
 * O rótulo do campo da etapa da importação (A40 da 23ª; princípio 3): com mais
 * de um funil, as etapas vêm agrupadas por funil, e "Etapa" não dizia que a
 * escolha é também a do funil.
 */
export function rotuloDaEtapaDaImportacao(funis: number): string {
  return funis > 1 ? 'Funil e etapa' : 'Etapa'
}

/**
 * O destino de CADA linha pronta, na prévia (A13 da 33ª simulação; IM-12:
 * "quem cada linha encontra na rede e por quê"): a prévia mostrava só as três
 * primeiras, sem o destino. Pela mesma conta do botão (`linhasQueJuntamNaPlanilha`
 * e o "completa quem já existe"): o que a prévia diz de cada linha é o que o
 * número do botão soma. Puro.
 */
export function destinoDeCadaLinha(p: {
  destino: Destino
  prontas: readonly { numero: number; dados: { phone?: unknown; email?: unknown; name?: unknown }; mesmoTelefone?: { numero: number; nome: string } }[]
  cruzados: readonly { numero: number; nome: string; como: 'cpf' | 'telefone' | 'email' }[]
  naoCompletar: ReadonlySet<number>
}): Map<number, string> {
  const pelo = (como: 'cpf' | 'telefone' | 'email') => como === 'cpf' ? 'o mesmo CPF' : como === 'email' ? 'o mesmo e-mail' : 'o mesmo telefone'
  const cruzado = new Map(p.cruzados.map(c => [c.numero, c]))
  const saida = new Map<number, string>()
  if (p.destino === 'clientes') {
    for (const l of p.prontas) {
      const c = cruzado.get(l.numero)
      if (c) {
        saida.set(l.numero, c.como !== 'cpf' && p.naoCompletar.has(l.numero)
          ? `ficha nova (o mesmo telefone de ${c.nome})`
          : `completa a ficha de ${c.nome} (${pelo(c.como)})`)
      } else if (l.mesmoTelefone) {
        saida.set(l.numero, p.naoCompletar.has(l.numero)
          ? `ficha nova (o mesmo telefone da linha ${l.mesmoTelefone.numero})`
          : `junta com a linha ${l.mesmoTelefone.numero} · ${l.mesmoTelefone.nome} (o mesmo telefone)`)
      } else {
        saida.set(l.numero, 'ficha nova')
      }
    }
    return saida
  }
  const primeiraDoTelefone = new Map<string, number>()
  for (const l of p.prontas) {
    const fone = typeof l.dados.phone === 'string' ? l.dados.phone : ''
    const primeira = fone ? primeiraDoTelefone.get(fone) : undefined
    if (fone && primeira === undefined) primeiraDoTelefone.set(fone, l.numero)
    const c = cruzado.get(l.numero)
    if (c) saida.set(l.numero, `junta com ${c.nome} (${pelo(c.como)})`)
    else if (primeira !== undefined) saida.set(l.numero, `junta com a linha ${primeira} (o mesmo telefone)`)
    else if (!fone) saida.set(l.numero, 'contato novo, sem telefone (entra só com o e-mail)')
    else saida.set(l.numero, 'contato novo')
  }
  return saida
}

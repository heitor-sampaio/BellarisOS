import { camposDoDestino, sugerirMapeamento, type ChaveDeCampo, type Destino } from '@/lib/importacao/campos'
import { nomeDiferente } from '@/lib/importacao/normalizar'

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

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** "Importar 10 linhas: 9 contatos novos, 1 linha junta com outra" — só o "Importar N linhas" quando todas viram pessoa nova. */
export function textoDoBotaoDeImportar(p: { destino: Destino; prontas: number; juntamNaPlanilha: number; completam: number }): string {
  const base = `Importar ${plural(p.prontas, 'linha', 'linhas')}`
  if (!p.juntamNaPlanilha && !p.completam) return base
  const novos = Math.max(0, p.prontas - p.juntamNaPlanilha - p.completam)
  const partes = [
    novos === 0
      ? (p.destino === 'clientes' ? 'nenhuma ficha nova' : 'nenhum contato novo')
      : p.destino === 'clientes' ? plural(novos, 'ficha nova', 'fichas novas') : plural(novos, 'contato novo', 'contatos novos'),
    p.completam ? `${p.completam} ${p.completam === 1 ? 'completa' : 'completam'} quem já existe` : null,
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

import type { Destino } from '@/lib/importacao/campos'

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

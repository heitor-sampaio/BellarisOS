/**
 * "Outros documentos" no cadastro do procedimento (DC1b), na ordem e com o
 * nome que a tela mostra (A22 da 18ª simulação; princípio 7): o termo ainda
 * não escolhido aparecia entre os documentos e sumia ao virar o termo — a
 * impressão era de duas formas de ligar a mesma coisa. Os documentos vêm
 * primeiro; o termo e o contrato, que também entram aqui (PC7), no fim, com o
 * tipo entre parênteses. Puro, para a tela e o teste.
 */
interface OutroDocumento { nome: string; tipo: string; ativo: boolean }

const ORDEM: Record<string, number> = { DOCUMENTO: 0, TERMO: 1, CONTRATO: 2 }

export function outrosDocumentosEmOrdem<T extends OutroDocumento>(lista: T[]): T[] {
  return lista
    .map((o, i) => ({ o, i }))
    .sort((a, b) => (ORDEM[a.o.tipo] ?? 3) - (ORDEM[b.o.tipo] ?? 3) || a.i - b.i)
    .map(x => x.o)
}

export function rotuloDoOutroDocumento(o: OutroDocumento): string {
  const partes = [o.tipo === 'TERMO' ? 'termo' : o.tipo === 'CONTRATO' ? 'contrato' : null, o.ativo ? null : 'inativo'].filter(Boolean)
  return partes.length ? `${o.nome} (${partes.join(', ')})` : o.nome
}

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

/**
 * O que "Outros documentos" oferece (A20 da 20ª simulação; princípio 7): o
 * termo recém-criado aparecia no "Termo de consentimento" E aqui, até ser
 * escolhido lá. O termo entra pelo campo dele: aqui, um termo só aparece
 * quando já há um escolhido (é um SEGUNDO termo), e um contrato, quando já há
 * um contrato. O escolhido no campo não se repete aqui; o que já está marcado
 * fica sempre (sumir da lista apagaria o vínculo ao salvar), e o inativo só se
 * está marcado.
 */
export function outrosDocumentosOferecidos<T extends OutroDocumento & { id: string }>(
  lista: readonly T[], escolhidos: { termo: string; contrato: string; marcados: readonly string[] },
): T[] {
  const { termo, contrato, marcados } = escolhidos
  return outrosDocumentosEmOrdem(lista.filter(o => {
    if (marcados.includes(o.id)) return true
    if (!o.ativo || o.id === termo || o.id === contrato) return false
    if (o.tipo === 'TERMO') return !!termo
    if (o.tipo === 'CONTRATO') return !!contrato
    return true
  }))
}

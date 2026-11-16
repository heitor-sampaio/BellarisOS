const emLista = (itens: string[]) => itens.length <= 1 ? (itens[0] ?? '') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`

export interface DocumentoDoAviso { titulo: string; status: string; faltando: string[] }

/**
 * O aviso dos documentos que a venda do pacote deixou para a cliente assinar
 * (PC2; D1 da 15ª simulação).
 *
 * Até a 15ª ele era fixo: "1 depende de completar o cadastro. Estão na ficha,
 * em Documentos." — não dizia O QUE faltava, e quem vendeu sem os Documentos
 * abria a aba e não achava nada. Agora diz o que falta no cadastro (`faltando`
 * já vem como a pessoa lê, por `oQueFalta`) e, a quem não vê os Documentos,
 * quem tem (`quemVe`; nulo = a própria pessoa vê).
 */
export function avisoDosDocumentosDaVenda(docs: DocumentoDoAviso[], quemVe: string[] | null): string {
  const incompletos = docs.filter(d => d.status === 'INCOMPLETO')
  const base = docs.length === 1
    ? `Ficou 1 documento para a cliente assinar: ${docs[0]!.titulo}.`
    : `Ficaram ${docs.length} documentos para a cliente assinar, numa assinatura só.`
  const falta = [...new Set(incompletos.flatMap(d => d.faltando))]
  const doCadastro = incompletos.length === 0 ? ''
    : falta.length
      ? ` Falta no cadastro: ${falta.join(', ')}. Completado o cadastro, ${incompletos.length === 1 ? 'ele fica pronto' : 'eles ficam prontos'} para assinar.`
      : ` ${incompletos.length === 1 ? '1 depende' : `${incompletos.length} dependem`} de completar o cadastro.`
  const onde = quemVe === null
    ? ' Estão na ficha, em Documentos.'
    : quemVe.length
      ? ` Para colher a assinatura, fale com quem tem os Documentos: ${emLista(quemVe)}.`
      : ' Para colher a assinatura, fale com quem administra a rede.'
  return `${base}${doCadastro}${onde}`
}

/**
 * A6 da 18ª (princípios 3 e 7): o aviso ANTES de vender o pacote — o contrato
 * dele pede do cadastro o que falta (o balcão só descobria depois de vender).
 * Só avisa (princípio 2): a venda segue.
 */
export function avisoDoContratoAntesDeVender(c: { titulo: string; faltando: string[] }): string {
  return `O contrato deste pacote (${c.titulo}) pede ${emLista(c.faltando)}, que falta no cadastro. Completado o cadastro antes de vender, ele já sai pronto para assinar.`
}

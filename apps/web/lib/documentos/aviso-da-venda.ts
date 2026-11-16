const emLista = (itens: string[]) => itens.length <= 1 ? (itens[0] ?? '') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`

export interface DocumentoDoAviso { titulo: string; status: string; faltando: string[] }

/**
 * O aviso dos documentos que a venda do pacote deixou para a cliente assinar
 * (PC2; D1 da 15ª simulação).
 *
 * Até a 15ª ele era fixo: "1 depende de completar o cadastro. Estão na ficha,
 * em Documentos." — não dizia O QUE faltava. Agora diz o que falta no cadastro
 * (`faltando` já vem como a pessoa lê, por `oQueFalta`). Quem vendeu colhe a
 * assinatura — colher não pede o módulo Documentos, que é o dos modelos (o
 * Heitor, 2026-11-16) —, e lê onde eles estão quando vê a ficha (`veNaFicha`).
 */
export function avisoDosDocumentosDaVenda(docs: DocumentoDoAviso[], opcoes: { veNaFicha?: boolean } = {}): string {
  const incompletos = docs.filter(d => d.status === 'INCOMPLETO')
  const base = docs.length === 1
    ? `Ficou 1 documento para a cliente assinar: ${docs[0]!.titulo}.`
    : `Ficaram ${docs.length} documentos para a cliente assinar, numa assinatura só.`
  const falta = [...new Set(incompletos.flatMap(d => d.faltando))]
  const doCadastro = incompletos.length === 0 ? ''
    : falta.length
      ? ` Falta no cadastro: ${falta.join(', ')}. Completado o cadastro, ${incompletos.length === 1 ? 'ele fica pronto' : 'eles ficam prontos'} para assinar.`
      : ` ${incompletos.length === 1 ? '1 depende' : `${incompletos.length} dependem`} de completar o cadastro.`
  const naFicha = opcoes.veNaFicha === false ? '' : ' Estão na ficha, em Documentos.'
  return `${base}${doCadastro}${naFicha}`
}

/**
 * A6 da 18ª (princípios 3 e 7): o aviso ANTES de vender o pacote — o contrato
 * dele pede do cadastro o que falta (o balcão só descobria depois de vender).
 * Só avisa (princípio 2): a venda segue.
 */
export function avisoDoContratoAntesDeVender(c: { titulo: string; faltando: string[] }): string {
  return `O contrato deste pacote (${c.titulo}) pede ${emLista(c.faltando)}, que falta no cadastro. Completado o cadastro antes de vender, ele já sai pronto para assinar.`
}

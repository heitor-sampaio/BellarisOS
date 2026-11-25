/**
 * O nome de quem assina, na tela do documento.
 *
 * Assinado, o documento não muda (documentos.md: a evidência
 * `document_signatures` é imutável e o hash cobre o documento montado): a
 * linha de assinatura é o nome com que a pessoa ASSINOU (`signer_name`), o
 * mesmo do PDF e do /verificar — nunca o nome de hoje da ficha. Corrigido o
 * nome depois, o cabeçalho mostra o de hoje com "assinado como <nome>"
 * (decisão do Claude, 25/11, D1 da 29ª). A assinar, vale o de hoje: a pessoa
 * assina com os dados de agora.
 */
export function nomesDaAssinatura(d: {
  /** Quem assina hoje (`quemAssina`): a própria cliente, ou o responsável da menor. */
  assinanteDeHoje: string
  assinatura:      { nome: string } | null
}): { linha: string; assinadoComo: string | null } {
  const gravado = d.assinatura?.nome?.trim()
  if (!gravado) return { linha: d.assinanteDeHoje, assinadoComo: null }
  return { linha: gravado, assinadoComo: gravado === d.assinanteDeHoje.trim() ? null : gravado }
}

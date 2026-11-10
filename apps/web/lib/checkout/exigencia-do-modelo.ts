/**
 * A28 da 10ª simulação (2026-11-10): no checkout do plano da dona sozinha, o
 * contrato era obrigatório numa cliente sem CPF, e a tela só dizia "Falta
 * assinar". A exigência é do MODELO do documento, que a clínica configura em
 * Configurações → Documentos ("Bloqueia" ou "Só avisa" — princípio 1: a
 * clínica decide); a tela passa a dizer isso. Puro.
 */
export function textoDaExigenciaDoModelo(titulos: string[]): string | null {
  if (!titulos.length) return null
  const nomes = titulos.map(t => `“${t}”`)
  const lista = nomes.length === 1 ? nomes[0]! : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
  return nomes.length === 1
    ? `Quem exige a assinatura de ${lista} é o modelo do documento: em Configurações → Documentos, a clínica escolhe se ele “Bloqueia” o checkout ou “Só avisa”.`
    : `Quem exige a assinatura de ${lista} são os modelos dos documentos: em Configurações → Documentos, a clínica escolhe se cada um “Bloqueia” o checkout ou “Só avisa”.`
}

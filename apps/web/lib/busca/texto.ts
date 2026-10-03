import { semAcento } from '@/lib/texto'

/**
 * Todas as palavras do termo aparecem em algum dos textos, sem acento e sem
 * caixa — a regra de `private.sem_acento` no banco: "joao" acha "João" nas
 * páginas e nos registros do mesmo jeito. Termo vazio não casa com nada (a
 * busca vazia mostra atalhos, não tudo).
 */
export function casaComTermo(termo: string, textos: readonly string[]): boolean {
  const palavras = semAcento(termo).split(/\s+/).filter(Boolean)
  if (palavras.length === 0) return false
  const alvo = textos.map(semAcento).join(' ')
  return palavras.every(p => alvo.includes(p))
}

/**
 * Telefone para ler: tira o 55 do país e põe a máscara brasileira. O banco
 * guarda do jeito que chegou — com máscara, só dígitos, com ou sem o país.
 */
export function telefoneLegivel(bruto: string | null | undefined): string | null {
  if (!bruto) return null
  let d = bruto.replace(/\D/g, '')
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return bruto
}

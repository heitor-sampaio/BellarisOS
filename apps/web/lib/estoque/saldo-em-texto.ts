import { medidaNoPlural } from '@/lib/estoque/medidas'

/**
 * O saldo de um produto com unidade de consumo, como a prateleira o mostra (A50
 * da 11ª simulação, 2026-11-10; princípio 3): "Atual: 11 refil" valia 10,84 — o
 * `current_stock` conta a embalagem aberta inteira. Agora "10 refis fechados + 1
 * aberto com 840 g" (a embalagem no plural desde a A49 da 12ª). Puro: roda no navegador.
 */
const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

export function saldoNaPrateleira(rendimento: number, rende: number, embalagem: string, consumo: string): string {
  if (!(rende > 0)) return `${fmt(rendimento)} ${medidaNoPlural(embalagem, rendimento)}`
  const total = Math.max(0, rendimento)
  const fechados = Math.floor(Math.round(total / rende * 1e6) / 1e6)
  const resto = Math.round((total - fechados * rende) * 1000) / 1000
  if (resto <= 0) return `${fmt(fechados)} ${medidaNoPlural(embalagem, fechados)}`
  if (fechados === 0) return `1 ${embalagem} aberto com ${fmt(resto)} ${consumo}`
  return `${fmt(fechados)} ${medidaNoPlural(embalagem, fechados)} ${fechados === 1 ? 'fechado' : 'fechados'} + 1 aberto com ${fmt(resto)} ${consumo}`
}

/** A linha de uma unidade como a janela do estoque a recebe. */
type LinhaDoSaldo = { currentStock: number; currentRendimento?: number | null }

/**
 * O que pode SAIR da unidade, em embalagens com a fração (C18; A6 da 42ª, ES-19):
 * o que ela RENDE — o frasco aberto conta pelo que sobra nele, como a
 * transferência confere. Sem a unidade de uso, as embalagens.
 */
export function disponivelEmEmbalagens(linha: LinhaDoSaldo, rende: number | null): number {
  if (!rende || !(rende > 0)) return linha.currentStock
  const rendimento = linha.currentRendimento ?? linha.currentStock * rende
  return Math.max(0, Math.floor(rendimento / rende * 1000) / 1000)
}

/** "1,9 frasco (57 ml)": o disponível em embalagens e na unidade de uso (A6 da 42ª, ES-19). */
export function textoDoDisponivel(linha: LinhaDoSaldo, rende: number | null, embalagem: string, consumo: string): string {
  const emEmbalagens = disponivelEmEmbalagens(linha, rende)
  const texto = `${fmt(emEmbalagens)} ${medidaNoPlural(embalagem, emEmbalagens)}`
  if (!rende || !(rende > 0) || !consumo.trim()) return texto
  const rendimento = Math.max(0, linha.currentRendimento ?? linha.currentStock * rende)
  return `${texto} (${fmt(rendimento)} ${consumo.trim()})`
}

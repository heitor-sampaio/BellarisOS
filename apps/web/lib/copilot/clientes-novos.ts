import { dayKeyTZ } from '@/lib/datetime'
import { diaDeClienteDesde, type DesdeDaCliente } from '@/lib/clientes/cliente-desde'

/**
 * Os "clientes novos" do Copilot pela regra do dashboard (sobra da F49, 10ª
 * simulação, 2026-11-10; `indicadores.md`, decisão 1 (c) da 8ª):
 * `coalesce(cliente_desde, created_at)` — a importada com "cliente desde" de
 * 2021, cadastrada hoje, não é nova. Era o `created_at` puro.
 *
 * O PostgREST não filtra por `coalesce`: a ficha SEM "cliente desde" vale pelo
 * cadastro, e a COM ela, pelo dia dela (um DIA, sem hora — o do início, no
 * fuso da unidade: F62b; sem fuso, o de Brasília).
 */
export function filtroDosClientesNovos(desde: Date, fuso?: string): string {
  return `and(cliente_desde.is.null,created_at.gte.${desde.toISOString()}),cliente_desde.gte.${dayKeyTZ(desde, fuso)}`
}

/** A mesma regra, numa linha (o espelho do filtro). */
export function ehClienteNova(c: DesdeDaCliente, desde: Date, fuso?: string): boolean {
  if (c.clienteDesde) return (diaDeClienteDesde(c, fuso) ?? '') >= dayKeyTZ(desde, fuso)
  return !!c.createdAt && new Date(c.createdAt).getTime() >= desde.getTime()
}

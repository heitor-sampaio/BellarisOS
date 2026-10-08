import 'server-only'
import type { Ferramenta } from '@/lib/copilot/ferramentas/tipos'
import { buscar } from '@/lib/copilot/ferramentas/buscar'

/**
 * O catálogo do Copilot. Ferramenta nova entra aqui e declara o que exige
 * (`modulo`/`nivel`/`recurso`/`pode`); o executor confere. Nada clínico.
 */
export const FERRAMENTAS: Ferramenta[] = [
  buscar,
]

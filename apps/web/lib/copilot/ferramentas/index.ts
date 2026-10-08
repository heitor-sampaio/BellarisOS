import 'server-only'
import type { Ferramenta } from '@/lib/copilot/ferramentas/tipos'
import { buscar } from '@/lib/copilot/ferramentas/buscar'
import { agendamentos, horariosLivres } from '@/lib/copilot/ferramentas/agenda'
import { cliente, clientes } from '@/lib/copilot/ferramentas/clientes'
import { procedimentos, indicadores } from '@/lib/copilot/ferramentas/indicadores'
import { lancamentos, estoque, oportunidades } from '@/lib/copilot/ferramentas/gestao'
import { agendar, remarcar, cancelar, confirmarAgendamento } from '@/lib/copilot/ferramentas/agenda-escrita'
import { cadastrarCliente, atualizarContato } from '@/lib/copilot/ferramentas/clientes-escrita'

/**
 * O catálogo do Copilot. Ferramenta nova entra aqui e declara o que exige
 * (`modulo`/`nivel`/`recurso`/`pode`); o executor confere. Nada clínico.
 */
export const FERRAMENTAS: Ferramenta[] = [
  // Leitura
  buscar,
  agendamentos, horariosLivres,
  cliente, clientes,
  procedimentos, indicadores,
  lancamentos, estoque, oportunidades,
  // Gravação (só com o Confirmar do cartão)
  agendar, remarcar, cancelar, confirmarAgendamento,
  cadastrarCliente, atualizarContato,
]

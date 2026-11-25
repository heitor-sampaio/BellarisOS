import 'server-only'
import type { Ferramenta } from '@/lib/copilot/ferramentas/tipos'
import { buscar } from '@/lib/copilot/ferramentas/buscar'
import { agendamentos, horariosLivres, minhaAgenda } from '@/lib/copilot/ferramentas/agenda'
import { minhasComissoes } from '@/lib/copilot/ferramentas/comissoes'
import { cliente, clientes } from '@/lib/copilot/ferramentas/clientes'
import { procedimentos, indicadores } from '@/lib/copilot/ferramentas/indicadores'
import { lancamentos, estoque, oportunidades } from '@/lib/copilot/ferramentas/gestao'
import { comandasAbertas, plano } from '@/lib/copilot/ferramentas/vendas'
import { agendar, remarcar, cancelar, confirmarAgendamento, fazerCheckIn } from '@/lib/copilot/ferramentas/agenda-escrita'
import { cadastrarCliente, atualizarContato, criarAcessoAoApp, marcarTags } from '@/lib/copilot/ferramentas/clientes-escrita'
import { documentos } from '@/lib/copilot/ferramentas/documentos'
import { cobrancaDoWhatsapp } from '@/lib/copilot/ferramentas/whatsapp'
import { lancar, marcarPago, entradaDeEstoque, ajusteDeEstoque, criarOportunidade, moverEtapa, trocarResponsavel } from '@/lib/copilot/ferramentas/gestao-escrita'

/**
 * O catálogo do Copilot. Ferramenta nova entra aqui e declara o que exige
 * (`modulo`/`nivel`/`recurso`/`pode`); o executor confere. Nada clínico.
 */
export const FERRAMENTAS: Ferramenta[] = [
  // Leitura
  buscar,
  agendamentos, horariosLivres,
  // A vista pessoal (SM2; Q03 da revisão de 24/11): só leitura, só as dela.
  minhaAgenda, minhasComissoes,
  cliente, clientes,
  procedimentos, indicadores,
  lancamentos, estoque, oportunidades,
  // CP1 (2026-11-17): só leitura — vender, receber e aceitar plano é na tela.
  comandasAbertas, plano,
  documentos, cobrancaDoWhatsapp,
  // Gravação (só com o Confirmar do cartão)
  agendar, remarcar, cancelar, confirmarAgendamento, fazerCheckIn,
  cadastrarCliente, atualizarContato, criarAcessoAoApp, marcarTags,
  lancar, marcarPago,
  entradaDeEstoque, ajusteDeEstoque,
  criarOportunidade, moverEtapa, trocarResponsavel,
]

import type { TenantContext } from '@estetica-os/types'
import { can, assertPermission, podeVerClinico } from '@/lib/auth'
import type { ClientProfileProps } from '@/components/branch/client-profile'

/**
 * A ficha da cliente de quem tem o Prontuário e NÃO tem o Clientes (pendente 5
 * da 27ª, arremate da 28ª). A regra: "o clínico (ficha de saúde, evolução,
 * fotos) é do Prontuário em Gerenciar, sem precisar atender" e "cada passo do
 * atendimento, um módulo" (CLAUDE.md §11; o Heitor, 2026-11-23). As duas fichas
 * exigiam o Clientes em Ver, e quem só tinha o Prontuário não chegava ao
 * clínico da cliente.
 *
 * Abre a ficha quem tem o Clientes em Ver OU o Prontuário em Ver. Sem o
 * Clientes, ela é só a aba Prontuário: o nome da cliente e o clínico; nada do
 * cadastro (telefone, documento, endereço, tags, notas) nem do financeiro
 * (decisão do Claude, 25/11: o texto da permissão do Clientes, "a ficha
 * completa: histórico, compras, pagamentos", é o que o Prontuário não dá).
 */

/** Abre a ficha da cliente: o Clientes em Ver, ou o Prontuário em Ver. */
export function abreAFicha(ctx: TenantContext): boolean {
  return can(ctx, 'clients', 'VIEW') || podeVerClinico(ctx)
}

/** A trava das duas fichas: sem o Clientes, o Prontuário em Ver (a tela "sem acesso" no resto). */
export function assertAbreAFicha(ctx: TenantContext): void {
  if (!can(ctx, 'clients', 'VIEW')) assertPermission(ctx, 'medical_records', 'VIEW')
}

/** A ficha é só a do prontuário: o Prontuário em Ver, sem o Clientes. */
export function fichaSoDoProntuario(ctx: TenantContext): boolean {
  return !can(ctx, 'clients', 'VIEW') && podeVerClinico(ctx)
}

/**
 * O que vai à tela da ficha só do prontuário: o nome e o clínico. É uma lista
 * do que FICA — dado novo da ficha não vaza por esquecimento.
 */
export function soOProntuarioDaFicha(p: ClientProfileProps): ClientProfileProps {
  const c = p.client
  return {
    soProntuario: true,
    client: {
      id: c.id, name: c.name, isActive: c.isActive, createdAt: c.createdAt,
      phone: '', email: null, document: null, documentoTipo: null, documentoNumero: null,
      birthDate: null, gender: null, tags: [], notes: null, clienteDesde: null,
      zipCode: null, address: null, addressNumber: null, addressComplement: null,
      neighborhood: null, city: null, state: null, temAcesso: false, responsavel: null, indicacao: null,
    },
    branchId: p.branchId, slug: p.slug, currentBranchId: p.currentBranchId, isNetworkWide: p.isNetworkWide,
    // O resto da ficha, vazio.
    stats: { totalSessions: 0, totalInvested: 0, mediaPorAtendimento: null, age: null },
    upcomingAppointments: [], recentAppointments: [], allAppointments: [],
    fidelidade: null, activePackage: null, outrosPacotes: [],
    transactions: [], internalCredits: [], documents: [], clientHistory: [],
    branches: [], canGrantCredit: false, canManageProcedures: false,
    veFinanceiro: false, termos: null, prePagos: [], opportunities: [], veOportunidades: false,
    podeAgendar: false, podeEditarCadastro: false, podeReceber: false, podeReceberAtendimento: false,
    podeVerPlanos: false, podeMontarPlano: false, podeExportarProntuario: false,
    // O clínico, como veio.
    recordForms: p.recordForms, podeVerProntuario: p.podeVerProntuario,
    generalAnamnesis: p.generalAnamnesis, fichaDeSaudeAtual: p.fichaDeSaudeAtual,
    podeEditarFichaDeSaude: p.podeEditarFichaDeSaude, alergias: p.alergias,
    anexosClinicos: p.anexosClinicos, podeAnexarClinico: p.podeAnexarClinico,
    anotacoesEVersoes: p.anotacoesEVersoes, podeAnotar: p.podeAnotar,
    lotesDosAtendimentos: p.lotesDosAtendimentos, podeAbrirLote: false,
    planejamentosQueAbrem: p.planejamentosQueAbrem, acessosAoProntuario: p.acessosAoProntuario,
    abreOAtendimento: p.abreOAtendimento, portalNoPlano: p.portalNoPlano,
  }
}

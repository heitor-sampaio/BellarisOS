import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'
import type { AppModule } from '@estetica-os/types'
import { filtroDosMembrosDaUnidade } from '@/lib/unidades/do-membro'

/**
 * Quem DESFAZ no caixa — estorna, devolve a venda de produto, cancela o pacote
 * (A33 da 8ª simulação, 2026-11-06; princípio 1 — a regra de cargo fica: é o
 * Financeiro em Gerenciar). A recepção (Recebimentos em Gerenciar) não via
 * nenhum dos três, e a tela não dizia a quem pedir: aqui, os nomes de quem
 * pode, ativos e ao alcance da unidade (os da rede e os dela). A Admin da rede
 * (o cargo de sistema) entra sempre.
 */
export async function quemDesfazNoCaixa(tenantId: string, branchId: string | null): Promise<string[]> {
  return quemTemEmGerenciar(tenantId, branchId, 'financial')
}

/**
 * Quem RECEBE no PDV (PDV1/CX1, a revisão do Heitor de 2026-11-13): a régua da
 * página do PDV (`podeReceber`) — o PDV ou o Financeiro em Gerenciar. Para quem
 * não recebe ler com quem fica a parcela (A28 da 9ª). A Admin da rede entra
 * sempre.
 */
export async function quemRecebeNoPdv(tenantId: string, branchId: string | null): Promise<string[]> {
  return quemTemEmGerenciar(tenantId, branchId, ['cashier', 'financial'])
}

/**
 * A8 da 20ª simulação (princípio 3): quem recebe NA unidade — e se são só os
 * da rede (ninguém da unidade tem o PDV nem o Financeiro em Gerenciar). A
 * comanda do Umarizal esperava alguém de lá, e só a rede recebia.
 */
export async function quemRecebeNaUnidade(tenantId: string, branchId: string | null): Promise<{ nomes: string[]; soDaRede: boolean }> {
  if (!branchId) return { nomes: await quemRecebeNoPdv(tenantId, null), soDaRede: false }
  const [daUnidade, daRede] = await Promise.all([quemRecebeNoPdv(tenantId, branchId), quemRecebeNoPdv(tenantId, null)])
  return { nomes: daUnidade, soDaRede: daUnidade.length > 0 && daUnidade.every(n => daRede.includes(n)) }
}

/**
 * A9 da 20ª simulação (princípios 1 e 3): quem CONCLUI o atendimento — o
 * Prontuário em Gerenciar, de todos (com "só os meus", conclui só os dela).
 * D1 da 22ª (princípio 3): E a Agenda de todos (em Ver ou Gerenciar) — com a
 * Agenda "só os meus", a pessoa nem abre o atendimento de outra
 * (`deOutroProfissional`), e a lista mandava pedir a ela. A Admin da rede
 * entra sempre.
 */
export async function quemConcluiOAtendimento(tenantId: string, branchId: string | null): Promise<string[]> {
  return quemTemNoNivel(tenantId, branchId, 'medical_records', ['MANAGE'], {
    soDeTodos: true, eTambem: { modulo: 'agenda', niveis: ['VIEW', 'MANAGE'] },
  })
}

/**
 * A10 da 20ª simulação (princípio 3): quem COMPLETA o cadastro da cliente — os
 * Clientes em Gerenciar. A Admin da rede entra sempre.
 */
export async function quemCompletaOCadastro(tenantId: string, branchId: string | null): Promise<string[]> {
  return quemTemEmGerenciar(tenantId, branchId, 'clients')
}

/**
 * Quem TROCA pontos por recompensa e ajusta pontos (A38 da 9ª simulação; a regra
 * de cargo fica: é a Fidelidade em Gerenciar) — a recepção com a Fidelidade em
 * Ver não tinha o botão nem lia a quem pedir, e o app dizia só "A troca é feita
 * na recepção". A mesma lista da A33 da 8ª, pelo módulo da fidelidade.
 */
export async function quemTrocaPontos(tenantId: string, branchId: string | null): Promise<string[]> {
  return quemTemEmGerenciar(tenantId, branchId, 'loyalty')
}

/**
 * Quem MUDA a configuração da clínica toda (A5 da 14ª simulação; princípios 3
 * e 7, como a A33 da 8ª): a gerente de unidade fixa lia "Esta configuração é da
 * clínica toda" sem saber a quem pedir. São os da REDE (sem unidade fixa —
 * `recusaDaConfigDaRede`), ativos, com algum dos módulos da aba em
 * Gerenciar; a Admin da rede entra sempre.
 */
export async function quemMudaNaRede(tenantId: string, modulos: readonly AppModule[]): Promise<string[]> {
  return quemTemEmGerenciar(tenantId, null, modulos)
}

/**
 * Quem MARCA A CHEGADA de um atendimento que não é dele (A10 da 19ª; D20): a
 * Agenda em Gerenciar de TODOS — com "só os meus", a pessoa marca só a dos
 * próprios, e não a de quem pede. A Admin da rede entra sempre.
 */
export async function quemMarcaAChegada(tenantId: string, branchId: string | null): Promise<string[]> {
  return quemTemNoNivel(tenantId, branchId, 'agenda', ['MANAGE'], { soDeTodos: true })
}

function quemTemEmGerenciar(tenantId: string, branchId: string | null, modulo: AppModule | readonly AppModule[]): Promise<string[]> {
  return quemTemNoNivel(tenantId, branchId, modulo, ['MANAGE'])
}

async function quemTemNoNivel(
  tenantId: string, branchId: string | null, modulo: AppModule | readonly AppModule[], niveis: readonly ('VIEW' | 'MANAGE')[],
  opcoes: {
    soDeTodos?: boolean
    /** O cargo precisa ter TAMBÉM este módulo num destes níveis (com o mesmo `soDeTodos`). */
    eTambem?: { modulo: AppModule; niveis: readonly ('VIEW' | 'MANAGE')[] }
  } = {},
): Promise<string[]> {
  const admin = createAdminClient()
  const cargosCom = (mods: AppModule[], nvs: readonly ('VIEW' | 'MANAGE')[]) => lerTodas((de, ate) => {
    let q = admin.from('role_permissions').select('role_id')
      .eq('tenant_id', tenantId).in('module', mods).in('level', [...nvs])
    // O escopo "todos" (sem escolha gravada também vale todos — resolveScopes).
    if (opcoes.soDeTodos) q = q.or('scope.is.null,scope.eq.ALL')
    return q.order('role_id').order('module').range(de, ate)
  }, 'carregar os cargos com o módulo')
  const modulos = typeof modulo === 'string' ? [modulo] : [...modulo]
  const [perms, tambem, admins] = await Promise.all([
    cargosCom(modulos, niveis),
    opcoes.eTambem ? cargosCom([opcoes.eTambem.modulo], opcoes.eTambem.niveis) : Promise.resolve(null),
    lerTodas((de, ate) => admin.from('tenant_roles').select('id')
      .eq('tenant_id', tenantId).eq('key', 'NETWORK_ADMIN').eq('is_system', true)
      .order('id').range(de, ate), 'carregar o cargo de Admin da rede'),
  ])
  const comOSegundo = tambem ? new Set(tambem.map(p => p.role_id as string)) : null
  const comOModulo = (perms ?? []).map(p => p.role_id as string).filter(id => !comOSegundo || comOSegundo.has(id))
  const cargos = [...new Set([...comOModulo, ...(admins ?? []).map(a => a.id as string)])]
  if (cargos.length === 0) return []
  const membros = await lerTodas((de, ate) => {
    let q = admin.from('users').select('id, name')
      .eq('tenant_id', tenantId).eq('is_active', true).in('role_id', cargos)
    // D1 da 17ª: a unidade nas outras do membro (EQ1a) também é dele.
    q = branchId ? q.or(filtroDosMembrosDaUnidade(branchId)) : q.is('branch_id', null)
    return q.order('name').order('id').range(de, ate)
  }, 'carregar quem tem o módulo')
  return (membros ?? []).map(m => (m.name as string | null) ?? '—').filter(n => n !== '—')
}

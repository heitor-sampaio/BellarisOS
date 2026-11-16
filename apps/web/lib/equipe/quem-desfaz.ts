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
 * Quem COLHE a assinatura dos documentos (D4 da 19ª simulação; era "quem VÊ",
 * do D1 da 15ª): quem vendeu o pacote sem o módulo lia "fale com quem tem os
 * Documentos" e a lista trazia quem só os VÊ — e colher pede os Documentos em
 * Gerenciar (`docs/regras/documentos.md`). É essa lista, ao alcance da
 * unidade; a Admin da rede entra sempre. Serve ao aviso da venda, à ficha e ao
 * "Falta assinar" do atendimento (A9/A10 da 19ª).
 */
export async function quemColheOsDocumentos(tenantId: string, branchId: string | null): Promise<string[]> {
  return quemTemEmGerenciar(tenantId, branchId, 'documents')
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
  opcoes: { soDeTodos?: boolean } = {},
): Promise<string[]> {
  const admin = createAdminClient()
  const modulos = typeof modulo === 'string' ? [modulo] : [...modulo]
  const [perms, admins] = await Promise.all([
    lerTodas((de, ate) => {
      let q = admin.from('role_permissions').select('role_id')
        .eq('tenant_id', tenantId).in('module', modulos).in('level', [...niveis])
      // O escopo "todos" (sem escolha gravada também vale todos — resolveScopes).
      if (opcoes.soDeTodos) q = q.or('scope.is.null,scope.eq.ALL')
      return q.order('role_id').order('module').range(de, ate)
    }, 'carregar os cargos com o módulo'),
    lerTodas((de, ate) => admin.from('tenant_roles').select('id')
      .eq('tenant_id', tenantId).eq('key', 'NETWORK_ADMIN').eq('is_system', true)
      .order('id').range(de, ate), 'carregar o cargo de Admin da rede'),
  ])
  const cargos = [...new Set([...(perms ?? []).map(p => p.role_id as string), ...(admins ?? []).map(a => a.id as string)])]
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

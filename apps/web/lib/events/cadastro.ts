import { createAdminClient } from '@/lib/supabase/admin'
import { emitirEvento, atorDoContexto, ATOR_SISTEMA } from './emitir'
import { EVENTOS } from '@estetica-os/types'
import type {
  NomeDeEvento, DadosDeProcedimento, DadosDeMembro, DadosDeCargo,
} from '@estetica-os/types'

type Ctx = { tenantId?: string | null; internalUserId?: string | null; userName?: string | null }

const ator = (ctx: Ctx) => (ctx.internalUserId ? atorDoContexto(ctx) : ATOR_SISTEMA)

/**
 * Procedimento do catálogo.
 *
 * Só dois eventos, e é de propósito: procedimento muda pouco e a maior parte
 * das edições (descrição, ficha vinculada, insumos) não dispara automação
 * nenhuma. O que interessa é **nascer** e **mudar de preço** — este último é o
 * único campo cuja alteração tem consequência fora da tela de cadastro.
 */
export async function emitirEventoDeProcedimento(
  nome: NomeDeEvento,
  procedureId: string,
  ctx: Ctx,
  extras?: { precoAnterior?: number | null },
): Promise<void> {
  try {
    if (!ctx.tenantId) return

    const { data, error } = await createAdminClient()
      .from('procedures')
      .select('id, name, category, price, duration_min')
      .eq('id', procedureId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle()

    if (error) console.error('[eventoDeProcedimento] retrato:', error.message)

    const dados: DadosDeProcedimento = {
      nome:       (data?.name as string) ?? null,
      categoria:  (data?.category as string) ?? null,
      preco:      data?.price != null ? Number(data.price) : null,
      duracaoMin: (data?.duration_min as number) ?? null,
    }
    if (extras?.precoAnterior != null) dados.precoAnterior = Number(extras.precoAnterior)

    await emitirEvento(nome, {
      tenantId:   ctx.tenantId,
      // Procedimento é dado da REDE (CLAUDE.md §9.3): sem unidade, de propósito.
      branchId:   null,
      entidadeId: procedureId,
      dados,
      ator:       ator(ctx),
      // `criado` acontece uma vez; `preco_alterado` acontece toda vez que o
      // preço muda, e cada uma é um fato novo — daí só o primeiro ter chave.
      chave: nome === EVENTOS.PROCEDIMENTO_CRIADO ? `${nome}:${procedureId}` : undefined,
    })
  } catch (e) {
    console.error('[eventoDeProcedimento]', nome, (e as Error).message)
  }
}

/**
 * Membro da equipe.
 *
 * `membro.desativado` é o de valor mais óbvio: é o gatilho de "revogar o que
 * essa pessoa ainda alcança". Por isso o retrato leva o cargo e a abrangência
 * que ela TINHA — depois de desativada, procurar isso já é arqueologia.
 */
export async function emitirEventoDeMembro(
  nome: NomeDeEvento,
  userId: string,
  ctx: Ctx,
): Promise<void> {
  try {
    if (!ctx.tenantId) return

    const { data, error } = await createAdminClient()
      .from('users')
      .select('id, name, email, branch_id, role_id, provides_services, tenant_roles(label)')
      .eq('id', userId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle()

    if (error) console.error('[eventoDeMembro] retrato:', error.message)

    const cargo = data?.tenant_roles as unknown as { label?: string } | null

    const dados: DadosDeMembro = {
      nome:            (data?.name as string) ?? null,
      email:           (data?.email as string) ?? null,
      cargoId:         (data?.role_id as string) ?? null,
      cargoNome:       cargo?.label ?? null,
      unidadeId:       (data?.branch_id as string) ?? null,
      atendeNaAgenda:  (data?.provides_services as boolean) ?? undefined,
    }

    await emitirEvento(nome, {
      tenantId:   ctx.tenantId,
      branchId:   (data?.branch_id as string) ?? null,
      entidadeId: userId,
      dados,
      ator:       ator(ctx),
      // `criado` é marco; desativar e reativar alternam e cada volta é um fato.
      chave: nome === EVENTOS.MEMBRO_CRIADO ? `${nome}:${userId}` : undefined,
    })
  } catch (e) {
    console.error('[eventoDeMembro]', nome, (e as Error).message)
  }
}

/** Uma linha de permissão como ela está no banco. */
export type LinhaDePermissao = { modulo: string; nivel: string; escopo: string }

/**
 * O que mudou entre duas matrizes, módulo a módulo.
 *
 * Função pura e exportada para poder ser testada sem banco: é ela que decide
 * se o evento sai, e o caso que mais importa — "salvou sem mexer em nada" — é
 * invisível em teste de tela.
 *
 * **Módulo ausente na matriz anterior conta como `NONE/ALL`**, que é o que a
 * ausência significa: cargo recém-criado não tem linha nenhuma, e sem esse
 * default a primeira gravação apareceria como se tivesse mudado os 14 módulos.
 */
export function diferencaDaMatriz(
  antes: LinhaDePermissao[],
  depois: LinhaDePermissao[],
): { modulo: string; de: string; para: string }[] {
  const chaveDe = (l: LinhaDePermissao) => `${l.nivel}/${l.escopo}`
  const mapaAntes = new Map(antes.map(l => [l.modulo, chaveDe(l)]))

  return depois
    .filter(l => (mapaAntes.get(l.modulo) ?? 'NONE/ALL') !== chaveDe(l))
    .map(l => ({
      modulo: l.modulo,
      de:     mapaAntes.get(l.modulo) ?? 'NONE/ALL',
      para:   chaveDe(l),
    }))
}

/** Lê a matriz de um cargo, para comparar antes e depois. */
export async function lerMatrizDoCargo(
  tenantId: string,
  roleId: string,
): Promise<LinhaDePermissao[]> {
  const { data, error } = await createAdminClient()
    .from('role_permissions')
    .select('module, level, scope')
    .eq('tenant_id', tenantId)
    .eq('role_id', roleId)

  if (error) {
    console.error('[lerMatrizDoCargo]', error.message)
    return []
  }
  return (data ?? []).map(l => ({
    modulo: l.module as string,
    nivel:  l.level  as string,
    escopo: l.scope  as string,
  }))
}

/**
 * Permissões de um cargo mudaram.
 *
 * O evento só sai se algo REALMENTE mudou. Abrir a tela de cargos e salvar sem
 * mexer em nada é comum — é assim que se confere a matriz — e emitir aí faria
 * a automação de auditoria gritar sobre uma conferência de rotina.
 *
 * O retrato guarda de→para por módulo porque "ganhou financeiro" e "perdeu
 * agenda" são alertas opostos, e quem lê o evento não tem como reconstruir a
 * matriz anterior: ela foi sobrescrita.
 */
export async function emitirCargoPermissoesAlteradas(
  roleId: string,
  ctx: Ctx,
  antes: LinhaDePermissao[],
  depois: LinhaDePermissao[],
  relatorios: string[],
): Promise<void> {
  try {
    if (!ctx.tenantId) return

    const mudancas = diferencaDaMatriz(antes, depois)
    if (mudancas.length === 0) return

    const { data } = await createAdminClient()
      .from('tenant_roles')
      .select('label')
      .eq('id', roleId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle()

    const dados: DadosDeCargo = {
      nome: (data?.label as string) ?? null,
      mudancas,
      relatorios,
    }

    await emitirEvento(EVENTOS.CARGO_PERMISSOES_ALTERADAS, {
      tenantId:   ctx.tenantId,
      branchId:   null,
      entidadeId: roleId,
      dados,
      ator:       ator(ctx),
      // Sem chave: cada alteração é um fato novo, e a linha do tempo de quem
      // mexeu em quê é justamente o que se quer poder auditar.
    })
  } catch (e) {
    console.error('[cargoPermissoesAlteradas]', (e as Error).message)
  }
}

/** Atalhos, para o ponto de emissão ficar legível na action. */
export const procedimentoCriado = (id: string, ctx: Ctx) =>
  emitirEventoDeProcedimento(EVENTOS.PROCEDIMENTO_CRIADO, id, ctx)

export const procedimentoPrecoAlterado = (id: string, ctx: Ctx, precoAnterior: number | null) =>
  emitirEventoDeProcedimento(EVENTOS.PROCEDIMENTO_PRECO_ALTERADO, id, ctx, { precoAnterior })

export const membroCriado     = (id: string, ctx: Ctx) => emitirEventoDeMembro(EVENTOS.MEMBRO_CRIADO, id, ctx)
export const membroDesativado = (id: string, ctx: Ctx) => emitirEventoDeMembro(EVENTOS.MEMBRO_DESATIVADO, id, ctx)
export const membroReativado  = (id: string, ctx: Ctx) => emitirEventoDeMembro(EVENTOS.MEMBRO_REATIVADO, id, ctx)

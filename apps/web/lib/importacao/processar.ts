import 'server-only'
import { randomUUID } from 'node:crypto'
import type { TenantContext } from '@estetica-os/types'
import { unitTag } from '@estetica-os/utils'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { criarOportunidadeCore } from '@/lib/crm/oportunidade'
import { propagarDadosDaPessoa } from '@/lib/contatos/propagar'
import type { ChaveDeCampo, Destino } from './campos'
import { validarLinha, chaveDaPessoa, variantesDoTelefone, type DadosDaLinha } from './normalizar'
import { referenciasDaRede } from './referencias'

/**
 * Grava uma importação de contatos em segundo plano (2026-10-13).
 *
 * Linha a linha, valida DE NOVO (a prévia do navegador não é confiável),
 * acha a pessoa que já existe e só completa o VAZIO (nunca troca o que a
 * clínica tem), cria quem não existe e, se pedido, a oportunidade — sem evento
 * de domínio nenhum: uma planilha não pode disparar mil automações de
 * boas-vindas. Acesso ao portal não é criado (a clínica cria na ficha).
 *
 * O que a linha cita por nome (unidade, etapa, responsável, procedimento) é
 * resolvido contra as listas da rede montadas AQUI (`referenciasDaRede`).
 *
 * Mesmo padrão do histórico do WhatsApp: reivindica a linha antes de rodar
 * (carimbando a `execucao`), dá sinal de vida a cada pedaço — e todo sinal
 * filtra pela própria execução: a passagem que perdeu a vez (um "Tentar de
 * novo" de uma que parecia morta) para de gravar em vez de sobrescrever a
 * nova. As linhas do arquivo saem conforme são gravadas.
 */

const PEDACO = 100
const MAX_ERROS = 2000
const SEM_SINAL_MS = 15 * 60_000
const RETENCAO_MS = 7 * 86_400_000
export const INTERROMPIDA_IMPORTACAO = 'Interrompida'

type Admin = ReturnType<typeof createAdminClient>
const agora = () => new Date().toISOString()
const expiraEm = () => new Date(Date.now() + RETENCAO_MS).toISOString()

/** A passagem perdeu a vez: outra reivindicou a importação. Para sem gravar. */
class PerdeuAVez extends Error {}

interface Pedido {
  id: string; tenant_id: string; branch_id: string | null; destino: Destino
  mapeamento: (ChaveDeCampo | null)[]
  oportunidade: { etapaId: string; responsavelId: string | null } | null
  processadas: number; novas: number; completadas: number; sem_mudanca: number
  com_erro: number; oportunidades: number; erros: { linha: number; motivo: string }[]
}

type Resultado = 'nova' | 'completada' | 'sem_mudanca'

/**
 * A manutenção (o cron de hora em hora, e quem abre a tela): sem sinal há 15
 * min a passagem morreu (deploy no meio) — vira falha, retomável; o relatório
 * de erros guarda o valor errado (dado pessoal) e some depois de 7 dias; e as
 * linhas de uma importação que nunca terminou também. Sem `tenantId`, todas as
 * redes (o cron).
 */
export async function manterImportacoes(tenantId?: string): Promise<void> {
  const admin = createAdminClient()

  let interrompidas = admin.from('importacoes').update({
    status: 'falhou', concluida_em: agora(), erros_expiram_em: expiraEm(),
    erro: `${INTERROMPIDA_IMPORTACAO}: a importação parou no meio (o servidor reiniciou). Tente de novo — continua de onde parou.`,
  }).in('status', ['pendente', 'importando']).lt('atualizada_em', new Date(Date.now() - SEM_SINAL_MS).toISOString())
  if (tenantId) interrompidas = interrompidas.eq('tenant_id', tenantId)
  await gravar(interrompidas, 'liberar as importações interrompidas')

  let expiradas = admin.from('importacoes').update({ erros: [] }).lt('erros_expiram_em', agora()).neq('erros', '[]')
  if (tenantId) expiradas = expiradas.eq('tenant_id', tenantId)
  await gravar(expiradas, 'expirar os relatórios de erro')

  let consulta = admin.from('importacoes').select('id')
    .eq('status', 'falhou').lt('concluida_em', new Date(Date.now() - RETENCAO_MS).toISOString()).limit(500)
  if (tenantId) consulta = consulta.eq('tenant_id', tenantId)
  const velhas = await ler(consulta, 'achar as importações velhas') as { id: string }[] | null
  if (velhas?.length) {
    await gravar(admin.from('importacao_linhas').delete().in('importacao_id', velhas.map(v => v.id)), 'apagar as linhas das importações velhas')
  }
}

export async function processarImportacao(importacaoId: string, ctx: TenantContext): Promise<void> {
  const admin = createAdminClient()
  const execucao = randomUUID()
  const { data: p, error: erroDaVez } = await admin.from('importacoes')
    .update({ status: 'importando', execucao, iniciada_em: agora(), atualizada_em: agora(), erro: null })
    .eq('id', importacaoId).eq('status', 'pendente').eq('tenant_id', ctx.tenantId!)
    .select('id, tenant_id, branch_id, destino, mapeamento, oportunidade, processadas, novas, completadas, sem_mudanca, com_erro, oportunidades, erros')
    .maybeSingle<Pedido>()
  if (erroDaVez) { console.error('[importacao] reivindicar:', erroDaVez.message); return }
  if (!p) return   // outra passagem já pegou

  const placar = {
    processadas: p.processadas, novas: p.novas, completadas: p.completadas, sem_mudanca: p.sem_mudanca,
    com_erro: p.com_erro, oportunidades: p.oportunidades,
  }
  const erros = [...(p.erros ?? [])]
  const vistas = new Map<string, number>()
  /** Grava o andamento — só se esta passagem ainda é a dona da importação. */
  const sinal = async (extra: Record<string, unknown> = {}) => {
    const { data, error } = await admin.from('importacoes')
      .update({ ...placar, erros, ...extra, atualizada_em: agora() })
      .eq('id', importacaoId).eq('execucao', execucao).select('id')
    if (error) throw new Error(`Gravar o andamento da importação: ${error.message}`)
    if (!data?.length) throw new PerdeuAVez()
  }

  try {
    const usa = (c: ChaveDeCampo) => p.mapeamento.includes(c)
    const refs = await referenciasDaRede(admin, p.tenant_id, {
      // A unidade da importação também entra: é dela a tag do cliente novo.
      unidades:      p.destino === 'clientes',
      etapaId:       usa('op_etapa') ? p.oportunidade?.etapaId : null,
      membros:       usa('op_responsavel'),
      procedimentos: usa('op_procedimentos'),
    })
    // A tag de cada unidade (é por ela que a lista de clientes filtra).
    const nomesDasUnidades = new Map((refs.unidades ?? []).map(u => [u.id, u.nome]))
    if (p.branch_id && !nomesDasUnidades.has(p.branch_id)) {
      const u = await ler(admin.from('branches').select('name').eq('id', p.branch_id).eq('tenant_id', p.tenant_id).maybeSingle(), 'buscar a unidade')
      if (u) nomesDasUnidades.set(p.branch_id, u.name as string)
    }
    const tagDaUnidade = (id: string | null) => (id && nomesDasUnidades.has(id) ? unitTag(nomesDasUnidades.get(id)!) : null)

    for (;;) {
      const linhas = await ler(admin.from('importacao_linhas').select('numero, valores')
        .eq('importacao_id', importacaoId).order('numero').limit(PEDACO), 'ler as linhas da importação') as
        { numero: number; valores: string[] }[] | null
      if (!linhas?.length) break

      for (const l of linhas) {
        const { dados, erros: problemas } = validarLinha(p.destino, p.mapeamento, l.valores, refs)
        if (!problemas.length) {
          const chave = chaveDaPessoa(p.destino, dados)
          const primeira = vistas.get(chave)
          if (primeira !== undefined) problemas.push(`Repetida na planilha (igual à linha ${primeira}).`)
          else vistas.set(chave, l.numero)
        }
        if (problemas.length) {
          placar.com_erro++
          if (erros.length < MAX_ERROS) erros.push({ linha: l.numero, motivo: problemas.join(' ') })
        } else {
          try {
            const r = await gravarLinha(admin, p, ctx, dados, tagDaUnidade)
            placar[r.resultado === 'nova' ? 'novas' : r.resultado === 'completada' ? 'completadas' : 'sem_mudanca']++
            if (r.oportunidade) placar.oportunidades++
          } catch (e) {
            placar.com_erro++
            if (erros.length < MAX_ERROS) erros.push({ linha: l.numero, motivo: e instanceof Error ? e.message : 'Erro ao gravar.' })
          }
        }
        placar.processadas++
      }
      // O andamento primeiro, as linhas depois: se cair entre os dois, o pedaço
      // é gravado de novo na retomada — e gravar de novo é seguro (o repetido só
      // completa o vazio); perder as contagens não seria.
      await sinal()
      await gravar(admin.from('importacao_linhas').delete().eq('importacao_id', importacaoId)
        .in('numero', linhas.map(l => l.numero)), 'tirar as linhas gravadas')
    }
    await sinal({ status: 'concluida', concluida_em: agora(), erros_expiram_em: expiraEm() })
  } catch (e) {
    if (e instanceof PerdeuAVez) return
    console.error('[importacao]', importacaoId, e)
    try {
      await sinal({
        status: 'falhou', concluida_em: agora(), erros_expiram_em: expiraEm(),
        erro: e instanceof Error ? e.message.slice(0, 500) : 'erro',
      })
    } catch (e2) {
      if (!(e2 instanceof PerdeuAVez)) console.error('[importacao] marcar a falha:', e2)
    }
  }
}

/** A pessoa do CRM com este telefone — com ou sem o nono dígito. */
async function pessoaDoTelefone(admin: Admin, tenantId: string, fone: string): Promise<{
  id: string; name: string | null; phone: string | null; email: string | null; social_media: string | null; tags: string[] | null
} | null> {
  return await ler(admin.from('contacts').select('id, name, phone, email, social_media, tags')
    .eq('tenant_id', tenantId).overlaps('identifiers', variantesDoTelefone(fone))
    .order('created_at').limit(1).maybeSingle(), 'buscar a pessoa pelo telefone') as never
}

/** Uma linha válida: a pessoa (nova, completada ou igual) e a oportunidade, se pedida. */
async function gravarLinha(
  admin: Admin, p: Pedido, ctx: TenantContext, dados: DadosDaLinha, tagDaUnidade: (id: string | null) => string | null,
): Promise<{ resultado: Resultado; oportunidade: boolean }> {
  const fone = dados.phone as string
  let resultado: Resultado
  let clientId: string | null = null
  if (p.destino === 'clientes') {
    const r = await gravarCliente(admin, p, dados, tagDaUnidade)
    resultado = r.resultado
    clientId = r.clientId
  } else {
    resultado = await gravarContato(admin, p.tenant_id, ctx, dados)
  }

  if (!p.oportunidade) return { resultado, oportunidade: false }
  // A oportunidade vai para a pessoa que JÁ existe (o gatilho a acha pelo
  // telefone EXATO): com o número dela, e não o da planilha, que pode ser a
  // outra forma (com o nono dígito).
  const pessoa = await pessoaDoTelefone(admin, p.tenant_id, fone)
  if (pessoa && await temOportunidadeAberta(admin, p.tenant_id, pessoa.id, p.oportunidade.etapaId)) {
    return { resultado, oportunidade: false }
  }
  const nome = (dados.name as string | undefined) ?? fone
  const texto = (c: ChaveDeCampo) => (dados[c] as string | undefined) ?? null
  // A etapa e o responsável da LINHA vencem os da tela (vazio = os da tela).
  // O responsável da linha já passou pela trava do cargo (a action recusa a
  // coluna para quem não troca responsável) e é da equipe ativa (refs).
  const criada = await criarOportunidadeCore(admin, ctx, {
    nome, telefone: pessoa?.phone || fone, email: texto('email'), social: texto('social_media'),
    origem: texto('op_origem'), observacoes: texto('op_observacoes'),
    valor: dados.op_valor ? Number(dados.op_valor) : null,
    crmStageId: texto('op_etapa') ?? p.oportunidade.etapaId,
    procedureIds: (dados.op_procedimentos as string[] | undefined) ?? [],
    tags: (dados.op_tags as string[] | undefined) ?? [],
    utmSource: texto('op_utm_source'), utmMedium: texto('op_utm_medium'), utmCampaign: texto('op_utm_campaign'),
  }, { semEventos: true, responsavelId: texto('op_responsavel') ?? p.oportunidade.responsavelId, clientId })
  if ('error' in criada) throw new Error(`Oportunidade: ${criada.error}`)
  return { resultado, oportunidade: true }
}

/** Só o que está VAZIO no cadastro entra; as tags se juntam. */
function soOVazio(atual: Record<string, unknown>, dados: DadosDaLinha, campos: ChaveDeCampo[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const c of campos) {
    if (c === 'tags') continue
    const v = dados[c]
    const a = atual[c]
    if (v && (a === null || a === undefined || a === '')) patch[c] = v
  }
  const novas = (dados.tags as string[] | undefined) ?? []
  const tags = (atual.tags as string[] | null) ?? []
  const juntas = [...new Set([...tags, ...novas])]
  if (juntas.length !== tags.length) patch.tags = juntas
  return patch
}

/** O que vai para a ficha (unidade e situação são tratadas à parte). */
const CAMPOS_DO_CLIENTE: ChaveDeCampo[] = [
  'name', 'phone', 'document', 'email', 'birth_date', 'gender', 'zip_code', 'address', 'address_number',
  'address_complement', 'neighborhood', 'city', 'state', 'referred_by', 'notes', 'tags',
]

async function gravarCliente(
  admin: Admin, p: Pedido, dados: DadosDaLinha, tagDaUnidade: (id: string | null) => string | null,
): Promise<{ resultado: Resultado; clientId: string }> {
  // Quem já existe: pelo CPF; sem achar, a ficha SEM CPF do mesmo telefone (o
  // cadastro rápido de quem marcou às pressas) — a regra do cadastro manual.
  // Telefone de uma ficha COM CPF pode ser de outra pessoa (mãe e filha).
  let existente: Record<string, unknown> | null = null
  if (dados.document) {
    existente = await ler(admin.from('clients').select('*')
      .eq('tenant_id', p.tenant_id).eq('document', dados.document as string).maybeSingle(), 'buscar o cliente pelo CPF')
  }
  if (!existente) {
    const { data: id, error } = await admin.rpc('cliente_por_telefone', {
      p_tenant: p.tenant_id, p_digitos: dados.phone as string, p_sem_cpf: true,
    })
    if (error) throw new Error(`Procurar o cliente pelo telefone: ${error.message}`)
    if (id) existente = await ler(admin.from('clients').select('*').eq('id', id as string).maybeSingle(), 'buscar o cliente')
  }

  if (existente) {
    const patch = soOVazio(existente, dados, CAMPOS_DO_CLIENTE)
    if (!Object.keys(patch).length) return { resultado: 'sem_mudanca', clientId: existente.id as string }
    await gravar(admin.from('clients').update({ ...patch, updated_at: agora() })
      .eq('id', existente.id as string).eq('tenant_id', p.tenant_id), 'completar o cliente')
    return { resultado: 'completada', clientId: existente.id as string }
  }

  // A unidade da LINHA (só a rede importa assim) ou a escolhida na tela; a
  // situação vale só para quem nasce — quem já existe mantém a da clínica.
  const branchId = (dados.unidade as string | undefined) ?? p.branch_id
  const tag = tagDaUnidade(branchId)
  const tags = [...new Set([...((dados.tags as string[] | undefined) ?? []), ...(tag ? [tag] : [])])]
  const linha: Record<string, unknown> = { tenant_id: p.tenant_id, branch_id: branchId, is_active: dados.ativo !== 'false', tags }
  for (const c of CAMPOS_DO_CLIENTE) if (c !== 'tags' && dados[c]) linha[c] = dados[c]
  const { data: novo, error } = await admin.from('clients').insert(linha).select('id').single<{ id: string }>()
  if (error) {
    if (error.code === '23505') throw new Error('Já existe um cliente com este CPF nesta rede.')
    throw new Error(`Cadastrar o cliente: ${error.message}`)
  }
  // A conta de pontos nasce com o cliente, como no cadastro da tela.
  await gravar(admin.rpc('fidelidade_conta', { p_cliente: novo.id }), 'abrir a conta de fidelidade')
  return { resultado: 'nova', clientId: novo.id }
}

/** O contato do CRM pelo telefone — com ou sem o nono dígito, como o WhatsApp o guarda. */
async function gravarContato(admin: Admin, tenantId: string, ctx: TenantContext, dados: DadosDaLinha): Promise<Resultado> {
  const fone = dados.phone as string
  const pessoa = await pessoaDoTelefone(admin, tenantId, fone)
  if (pessoa) {
    const atual = pessoa.name?.trim() ?? ''
    // Sem nome = vazio, ou só o número (o que a conversa põe quando o WhatsApp não manda nome).
    const semNome = !atual || /^[\d\s+().-]+$/.test(atual)
    const patch = soOVazio({ ...pessoa, name: semNome ? null : atual }, dados, ['name', 'email', 'social_media', 'tags'])
    if (!Object.keys(patch).length) return 'sem_mudanca'
    // O nome é da PESSOA, e as cópias acompanham (conversas, oportunidades) —
    // a mesma porta da edição pela tela.
    const { name, ...resto } = patch
    if (name) await propagarDadosDaPessoa(admin, ctx, pessoa.id, { nome: name as string })
    if (Object.keys(resto).length) {
      await gravar(admin.from('contacts').update({ ...resto, updated_at: agora() })
        .eq('id', pessoa.id).eq('tenant_id', tenantId), 'completar o contato')
    }
    return 'completada'
  }
  await gravar(admin.from('contacts').insert({
    tenant_id: tenantId, name: (dados.name as string | undefined) ?? null, phone: fone,
    email: (dados.email as string | undefined) ?? null, social_media: (dados.social_media as string | undefined) ?? null,
    identifiers: [fone], tags: (dados.tags as string[] | undefined) ?? [],
  }), 'criar o contato')
  return 'nova'
}

/** Importar de novo não duplica a oportunidade: a pessoa já tem uma aberta no mesmo funil? */
async function temOportunidadeAberta(admin: Admin, tenantId: string, contatoId: string, etapaId: string): Promise<boolean> {
  const etapa = await ler(admin.from('crm_stages').select('funnel_id').eq('id', etapaId).eq('tenant_id', tenantId).maybeSingle(), 'buscar a etapa')
  if (!etapa) return false
  const doFunil = await ler(admin.from('crm_stages').select('id, outcome')
    .eq('funnel_id', etapa.funnel_id as string), 'ler as etapas do funil') as { id: string; outcome: string | null }[] | null
  const abertas = (doFunil ?? []).filter(e => !e.outcome || e.outcome === 'OPEN').map(e => e.id)
  if (!abertas.length) return false
  const { count, error } = await admin.from('leads').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('contato_id', contatoId).in('crm_stage_id', abertas)
  if (error) throw new Error(`Conferir a oportunidade aberta: ${error.message}`)
  return (count ?? 0) > 0
}

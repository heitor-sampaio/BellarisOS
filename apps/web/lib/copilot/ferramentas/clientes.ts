import 'server-only'
import { z } from 'zod/v4'
import { unitTag } from '@estetica-os/utils'
import { can, ownerFilter, podeReceber, temRecurso } from '@/lib/auth'
import { ler } from '@/lib/db'
import { creditosDoCliente } from '@/lib/creditos/credito'
import { configDaRede, saldoDoCliente } from '@/lib/fidelidade/leitura'
import { getClientesParaReativar } from '@/lib/metrics/unidade'
import { addDaysTZ } from '@/lib/datetime'
import type { FerramentaDeLeitura } from '@/lib/copilot/ferramentas/tipos'
import {
  BUSINESS_TZ, STATUS_DO_AGENDAMENTO, dinheiro, hojeEmBrasilia, nomesPorId, quandoLegivel, resolverCliente, resolverUnidade, rota, unidadesDaRede,
} from '@/lib/copilot/ferramentas/comum'

/**
 * As leituras de CLIENTES. O cadastro é da rede (como na busca universal).
 *
 * Fica de fora o que pode ser clínico ou é sensível sem necessidade: as
 * observações livres do cadastro (costumam ter saúde no meio) e o CPF inteiro
 * (vai mascarado — o modelo não precisa dele para nada).
 */

function cpfMascarado(doc: string | null): string | null {
  const d = (doc ?? '').replace(/\D/g, '')
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : null
}

/** A idade hoje, no dia de Brasília (o nascimento é gravado como meia-noite UTC). */
function idade(nascimento: string | null): number | null {
  if (!nascimento) return null
  const [na, nm, nd] = nascimento.slice(0, 10).split('-').map(Number)
  const [ha, hm, hd] = hojeEmBrasilia().split('-').map(Number)
  let a = ha! - na!
  if (hm! < nm! || (hm === nm && hd! < nd!)) a--
  return a
}

export const cliente: FerramentaDeLeitura<{ cliente: string }> = {
  nome: 'cliente',
  tipo: 'leitura',
  modulo: 'clients', nivel: 'VIEW',
  descricao: 'A ficha de UM cliente (por id, nome ou telefone): contato, nascimento, tags, próximos e últimos atendimentos, pacotes e pré-pagos com sessões restantes, crédito em R$ e pontos de fidelidade (conforme o cargo). Nada clínico.',
  parametros: z.object({ cliente: z.string().min(2).max(120).describe('Id, nome ou telefone do cliente.') }),
  async executar(c, { cliente: pedido }) {
    const achado = await resolverCliente(c, pedido)
    if ('erro' in achado) return { dados: { erro: achado.erro } }
    const ficha = await ler(c.admin.from('clients')
      .select('id, name, phone, email, document, birth_date, gender, city, tags, is_active, created_at, app_account_created_at')
      .eq('id', achado.id).eq('tenant_id', c.ctx.tenantId!).single(), 'ler o cliente') as {
        id: string; name: string; phone: string | null; email: string | null; document: string | null; birth_date: string | null
        gender: string | null; city: string | null; tags: string[] | null; is_active: boolean; created_at: string; app_account_created_at: string | null
      }

    const agora = new Date().toISOString()
    const verAgenda = can(c.ctx, 'agenda', 'VIEW')
    const dono = ownerFilter(c.ctx, 'agenda')
    const [unidades, proximos, ultimos, creditos, internos, pontos] = await Promise.all([
      unidadesDaRede(c),
      verAgenda ? (() => {
        let q = c.admin.from('appointments').select('id, scheduled_at, status, procedure_id, professional_id, branch_id')
          .eq('client_id', ficha.id).gte('scheduled_at', agora).in('status', ['SCHEDULED', 'CONFIRMED']).order('scheduled_at').limit(5)
        if (dono) q = q.eq('professional_id', dono)
        if (c.ctx.branchId) q = q.eq('branch_id', c.ctx.branchId)
        return ler(q, 'ler os próximos atendimentos')
      })() : Promise.resolve([]),
      verAgenda ? (() => {
        let q = c.admin.from('appointments').select('id, scheduled_at, status, procedure_id, professional_id, branch_id')
          .eq('client_id', ficha.id).lt('scheduled_at', agora).order('scheduled_at', { ascending: false }).limit(5)
        if (dono) q = q.eq('professional_id', dono)
        if (c.ctx.branchId) q = q.eq('branch_id', c.ctx.branchId)
        return ler(q, 'ler os últimos atendimentos')
      })() : Promise.resolve([]),
      creditosDoCliente(c.admin, c.ctx.tenantId!, ficha.id),
      podeReceber(c.ctx) || can(c.ctx, 'financial', 'VIEW')
        ? ler(c.admin.from('internal_credits').select('amount, branch_id').eq('client_id', ficha.id), 'ler o crédito interno')
        : Promise.resolve(null),
      // Pontos por unidade quando a rede configurou assim (a mesma regra da agenda).
      can(c.ctx, 'loyalty', 'VIEW') && temRecurso(c.ctx, 'fidelidade')
        ? configDaRede(c.ctx.tenantId!, c.admin).then(cfg => saldoDoCliente(ficha.id, cfg.scope_per_branch ? (c.ctx.branchId ?? null) : null, c.admin))
        : Promise.resolve(null),
    ])
    type Ag = { id: string; scheduled_at: string; status: string; procedure_id: string; professional_id: string | null; branch_id: string }
    const ags = [...((proximos ?? []) as Ag[]), ...((ultimos ?? []) as Ag[])]
    const [procs, profs] = await Promise.all([
      nomesPorId(c, 'procedures', ags.map(a => a.procedure_id)),
      nomesPorId(c, 'users', ags.map(a => a.professional_id)),
    ])
    const fmt = (a: Ag) => ({
      id: a.id, quando: quandoLegivel(a.scheduled_at), procedimento: procs.get(a.procedure_id) ?? '—',
      profissional: a.professional_id ? (profs.get(a.professional_id) ?? '—') : '—',
      status: STATUS_DO_AGENDAMENTO[a.status] ?? a.status, href: rota(c, `/agenda/${a.id}`),
    })
    const nomesDeUnidade = new Set(unidades.map(u => unitTag(u.name)))
    const href = rota(c, `/clients/${ficha.id}`)
    // O crédito interno é da REDE (o gatilho do uso soma por cliente, e a ficha não recorta).
    const creditoInterno = internos === null ? undefined
      : ((internos ?? []) as { amount: number }[]).reduce((s, i) => s + Number(i.amount), 0)

    return {
      dados: {
        id: ficha.id, nome: ficha.name, telefone: ficha.phone, email: ficha.email,
        cpf: cpfMascarado(ficha.document), nascimento: ficha.birth_date?.slice(0, 10) ?? null, idade: idade(ficha.birth_date),
        genero: ficha.gender, cidade: ficha.city, ativo: ficha.is_active,
        unidades: (ficha.tags ?? []).filter(t => nomesDeUnidade.has(t)),
        tags: (ficha.tags ?? []).filter(t => !nomesDeUnidade.has(t)),
        clienteDesde: ficha.created_at.slice(0, 10),
        temAcessoAoApp: !!ficha.app_account_created_at,
        href,
        ...(verAgenda ? { proximosAtendimentos: ((proximos ?? []) as Ag[]).map(fmt), ultimosAtendimentos: ((ultimos ?? []) as Ag[]).map(fmt) } : {}),
        pacotesEPrePagos: creditos.map(k => ({ procedimento: k.procedimento, origem: k.origem, sessoesRestantes: k.restantes, venceEm: k.venceEm?.slice(0, 10) ?? null })),
        ...(creditoInterno !== undefined ? { creditoInterno: dinheiro(creditoInterno) } : {}),
        ...(pontos !== null ? { pontosDeFidelidade: pontos } : {}),
      },
      cartao: { tipo: 'links', itens: [{ texto: ficha.name, detalhe: [ficha.phone, ficha.email].filter(Boolean).join(' · ') || undefined, href }] },
    }
  },
}

export const clientes: FerramentaDeLeitura<{
  filtro: 'aniversariantes' | 'sem_visita' | 'novos' | 'tag'; mes?: number; dias?: number; tag?: string; unidade?: string
}> = {
  nome: 'clientes',
  tipo: 'leitura',
  modulo: 'clients', nivel: 'VIEW',
  descricao: 'Listas de clientes: "aniversariantes" (de um mês; padrão o atual), "sem_visita" (sem atendimento concluído há N dias; padrão 90), "novos" (cadastrados nos últimos N dias; padrão 30) ou "tag" (com uma tag). Até 50.',
  parametros: z.object({
    filtro: z.enum(['aniversariantes', 'sem_visita', 'novos', 'tag']),
    mes: z.number().int().min(1).max(12).optional(),
    dias: z.number().int().min(1).max(730).optional(),
    tag: z.string().max(60).optional(),
    unidade: z.string().max(80).optional(),
  }),
  async executar(c, args) {
    const tenant = c.ctx.tenantId!
    type Lin = { id: string; name: string; phone: string | null; detalhe?: string }
    let lista: Lin[] = []
    let total: number | null = null

    // A unidade (a da pessoa, se fixa): as listas da unidade recortam pela tag dela.
    const u = await resolverUnidade(c, args.unidade)
    if ('erro' in u) return { dados: { erro: u.erro } }
    const tagDaUnidade = u.unidade ? unitTag(u.unidade.name) : null

    if (args.filtro === 'sem_visita') {
      const alvo = u.unidade ? [u.unidade] : await unidadesDaRede(c)
      const desde = addDaysTZ(new Date(), -(args.dias ?? 90))
      const partes = await Promise.all(alvo.map(un => getClientesParaReativar({ tenantId: tenant, branchId: un.id, tag: unitTag(un.name), desde, limite: 50 })))
      // Na rede: quem está em duas unidades aparece uma vez, há mais tempo sem vir primeiro.
      const unicos = new Map<string, (typeof partes)[number]['lista'][number]>()
      for (const x of partes.flatMap(p => p.lista)) {
        const ja = unicos.get(x.id)
        if (!ja || (x.ultimaVisita ?? '') > (ja.ultimaVisita ?? '')) unicos.set(x.id, x)
      }
      total = alvo.length === 1 ? partes[0]!.total : null
      lista = [...unicos.values()].sort((a, b) => (a.ultimaVisita ?? '') < (b.ultimaVisita ?? '') ? -1 : 1).slice(0, 50).map(x => ({ id: x.id, name: x.name, phone: x.phone, detalhe: x.ultimaVisita ? `última visita ${x.ultimaVisita.slice(0, 10)}` : 'nunca veio' }))
    } else if (args.filtro === 'novos') {
      const desde = addDaysTZ(new Date(), -(args.dias ?? 30)).toISOString()
      let q = c.admin.from('clients').select('id, name, phone, created_at').eq('tenant_id', tenant).eq('is_active', true)
        .gte('created_at', desde).order('created_at', { ascending: false }).limit(50)
      if (tagDaUnidade) q = q.contains('tags', [tagDaUnidade])
      lista = ((await ler(q, 'ler os clientes novos')) as (Lin & { created_at: string })[] | null ?? [])
        .map(x => ({ ...x, detalhe: `desde ${x.created_at.slice(0, 10)}` }))
    } else if (args.filtro === 'tag') {
      if (!args.tag) return { dados: { erro: 'Qual tag?' } }
      lista = (await ler(c.admin.from('clients').select('id, name, phone').eq('tenant_id', tenant).eq('is_active', true)
        .contains('tags', tagDaUnidade ? [args.tag, tagDaUnidade] : [args.tag]).order('name').limit(50), 'ler os clientes da tag') as Lin[] | null) ?? []
    } else {
      const mes = args.mes ?? Number(new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, month: '2-digit' }).format(new Date()))
      // No banco (copilot_aniversariantes): ler a rede toda cortaria em mil linhas.
      const achados = (await ler(c.admin.rpc('copilot_aniversariantes', { p_tenant: tenant, p_mes: mes, p_limite: 50, p_tag: tagDaUnidade }), 'ler os aniversariantes') as
        { id: string; name: string; phone: string | null; dia: number }[] | null) ?? []
      lista = achados.map(x => ({ id: x.id, name: x.name, phone: x.phone, detalhe: `dia ${String(x.dia).padStart(2, '0')}` }))
    }

    const itens = lista.map(x => ({ id: x.id, nome: x.name, telefone: x.phone, detalhe: x.detalhe ?? null, href: rota(c, `/clients/${x.id}`) }))
    return {
      dados: { filtro: args.filtro, unidade: u.unidade?.name ?? 'todas as unidades', ...(total !== null ? { total } : {}), clientes: itens },
      cartao: itens.length ? { tipo: 'links', itens: itens.slice(0, 12).map(i => ({ texto: i.nome, detalhe: [i.detalhe, i.telefone].filter(Boolean).join(' · ') || undefined, href: i.href })) } : undefined,
    }
  },
}

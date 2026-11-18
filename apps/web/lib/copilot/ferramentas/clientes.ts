import 'server-only'
import { z } from 'zod/v4'
import { can, ownerFilter, podeReceber, temRecurso, unidadesDoContexto } from '@/lib/auth'
import { ler } from '@/lib/db'
import { creditosDoCliente } from '@/lib/creditos/credito'
import { configDaRede, saldoDoCliente } from '@/lib/fidelidade/leitura'
import { getClientesParaReativarDoRecorte, getCreditoInternoDoCliente } from '@/lib/metrics/unidade'
import { recorteDosModulos } from '@/lib/metrics/escopo'
import { addDaysTZ } from '@/lib/datetime'
import { tagsAtivasDaRede } from '@/lib/tags/vocabulario'
import { temTag } from '@/lib/tags/escolha'
import { filtroDosClientesNovos } from '@/lib/copilot/clientes-novos'
import { diaDeClienteDesde } from '@/lib/clientes/cliente-desde'
import type { FerramentaDeLeitura } from '@/lib/copilot/ferramentas/tipos'
import { getEmAbertoDasVendas } from '@/lib/metrics/pacote-em-aberto'
import { mostraOValor, planosDaCliente } from '@/lib/copilot/ferramentas/vendas'
import {
  STATUS_DO_AGENDAMENTO, dinheiro, fusoDe, fusosPorUnidade, hojeNoFuso, nomesPorId, quandoLegivel, resolverCliente, resolverUnidade, rota,
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

/** A idade hoje, no dia do fuso (F62b; o nascimento é um DIA, gravado como meia-noite UTC). */
function idade(nascimento: string | null, fuso: string): number | null {
  if (!nascimento) return null
  const [na, nm, nd] = nascimento.slice(0, 10).split('-').map(Number)
  const [ha, hm, hd] = hojeNoFuso(fuso).split('-').map(Number)
  let a = ha! - na!
  if (hm! < nm! || (hm === nm && hd! < nd!)) a--
  return a
}

export const cliente: FerramentaDeLeitura<{ cliente: string }> = {
  nome: 'cliente',
  tipo: 'leitura',
  modulo: 'clients', nivel: 'VIEW',
  descricao: 'A ficha de UM cliente (por id, nome ou telefone): contato, nascimento, tags, próximos e últimos atendimentos, pacotes e pré-pagos com sessões restantes, os planos de tratamento (situação e sessões), o em aberto de cada venda (pacote, pré-pago, plano), crédito interno em R$ e pontos de fidelidade (conforme as permissões da pessoa). Nada clínico (a Ficha de saúde e o prontuário ficam na tela). O detalhe das sessões de um plano: ferramenta plano.',
  parametros: z.object({ cliente: z.string().min(2).max(120).describe('Id, nome ou telefone do cliente.') }),
  async executar(c, { cliente: pedido }) {
    const achado = await resolverCliente(c, pedido)
    if ('erro' in achado) return { dados: { erro: achado.erro } }
    const ficha = await ler(c.admin.from('clients')
      .select('id, name, phone, email, document, birth_date, gender, city, tags, is_active, created_at, cliente_desde, app_account_created_at')
      .eq('id', achado.id).eq('tenant_id', c.ctx.tenantId!).single(), 'ler o cliente') as {
        id: string; name: string; phone: string | null; email: string | null; document: string | null; birth_date: string | null
        gender: string | null; city: string | null; tags: string[] | null; is_active: boolean; created_at: string; cliente_desde: string | null; app_account_created_at: string | null
      }

    const agora = new Date().toISOString()
    const verAgenda = can(c.ctx, 'agenda', 'VIEW')
    // Os atendimentos nas unidades DELA (EQ1a: uma ou várias); da rede, todos (CP1).
    const minhas = unidadesDoContexto(c.ctx)
    const dono = ownerFilter(c.ctx, 'agenda')
    const [proximos, ultimos, creditos, internos, pontos] = await Promise.all([
      verAgenda ? (() => {
        let q = c.admin.from('appointments').select('id, scheduled_at, status, procedure_id, professional_id, branch_id')
          .eq('client_id', ficha.id).gte('scheduled_at', agora).in('status', ['SCHEDULED', 'CONFIRMED', 'ARRIVED']).order('scheduled_at').limit(5)
        if (dono) q = q.eq('professional_id', dono)
        if (minhas) q = q.in('branch_id', minhas)
        return ler(q, 'ler os próximos atendimentos')
      })() : Promise.resolve([]),
      verAgenda ? (() => {
        let q = c.admin.from('appointments').select('id, scheduled_at, status, procedure_id, professional_id, branch_id')
          .eq('client_id', ficha.id).lt('scheduled_at', agora).order('scheduled_at', { ascending: false }).limit(5)
        if (dono) q = q.eq('professional_id', dono)
        if (minhas) q = q.in('branch_id', minhas)
        return ler(q, 'ler os últimos atendimentos')
      })() : Promise.resolve([]),
      creditosDoCliente(c.admin, c.ctx.tenantId!, ficha.id),
      // O saldo do crédito interno da ficha, do banco (IND-07; indicadores.md:
      // nada se soma na tela) — o crédito é da REDE.
      podeReceber(c.ctx) || can(c.ctx, 'financial', 'VIEW')
        ? getCreditoInternoDoCliente(c.ctx.tenantId!, ficha.id)
        : Promise.resolve(null),
      // Os pontos da rede: o saldo é um só, em qualquer unidade (FD3).
      can(c.ctx, 'loyalty', 'VIEW') && temRecurso(c.ctx, 'fidelidade')
        // C5: com o programa desligado, nenhum sinal de pontos (fidelidade.md).
        ? configDaRede(c.ctx.tenantId!, c.admin).then(cfg => cfg.enabled
            ? saldoDoCliente(ficha.id, c.admin) : null)
        : Promise.resolve(null),
    ])
    // CP1 (2026-11-17): os planos de tratamento e o em aberto das vendas — o
    // valor só a quem vê o valor (`mostraOValor`). Só leitura.
    const verPlanos = can(c.ctx, 'atendimento', 'VIEW') && temRecurso(c.ctx, 'planos_de_tratamento')
    const verValor = mostraOValor(c.ctx)
    const [planosDeTratamento, vendasDaCliente] = await Promise.all([
      verPlanos ? planosDaCliente(c, ficha.id, false) : Promise.resolve(null),
      verValor ? Promise.all([
        ler(c.admin.from('client_packages').select('id, service_packages(name), branches!inner(tenant_id)')
          .eq('client_id', ficha.id).eq('branches.tenant_id', c.ctx.tenantId!), 'ler os pacotes da cliente'),
        ler(c.admin.from('procedure_sales').select('id, procedures(name)')
          .eq('client_id', ficha.id).eq('tenant_id', c.ctx.tenantId!), 'ler os pré-pagos da cliente'),
      ]) : Promise.resolve(null),
    ])
    let emAbertoDasVendas: { venda: string; emAberto: string; parcelas: number }[] | undefined
    if (vendasDaCliente) {
      const [pacs, pres] = vendasDaCliente as [
        { id: string; service_packages: { name: string } | null }[] | null, { id: string; procedures: { name: string } | null }[] | null,
      ]
      const nomes = new Map<string, string>([
        ...(pacs ?? []).map(p => [p.id, `Pacote ${p.service_packages?.name ?? ''}`.trim()] as [string, string]),
        ...(pres ?? []).map(p => [p.id, `Pré-pago ${p.procedures?.name ?? ''}`.trim()] as [string, string]),
      ])
      const aberto = await getEmAbertoDasVendas(c.ctx.tenantId!, [...nomes.keys()])
      emAbertoDasVendas = Object.entries(aberto).filter(([, v]) => v.valor > 0)
        .map(([id, v]) => ({ venda: nomes.get(id) ?? 'Venda', emAberto: dinheiro(v.valor), parcelas: v.parcelas }))
    }

    type Ag = { id: string; scheduled_at: string; status: string; procedure_id: string; professional_id: string | null; branch_id: string }
    const ags = [...((proximos ?? []) as Ag[]), ...((ultimos ?? []) as Ag[])]
    const [procs, profs, fusos, fusoDoPortal] = await Promise.all([
      nomesPorId(c, 'procedures', ags.map(a => a.procedure_id)),
      nomesPorId(c, 'users', ags.map(a => a.professional_id)),
      fusosPorUnidade(c, ags.map(a => a.branch_id)),
      fusoDe(c),
    ])
    // Cada agendamento na hora da unidade dele (F62b).
    const fmt = (a: Ag) => ({
      id: a.id, quando: quandoLegivel(a.scheduled_at, fusos.get(a.branch_id) ?? fusoDoPortal), procedimento: procs.get(a.procedure_id) ?? '—',
      profissional: a.professional_id ? (profs.get(a.professional_id) ?? '—') : '—',
      status: STATUS_DO_AGENDAMENTO[a.status] ?? a.status, href: rota(c, `/agenda/${a.id}`),
    })
    const href = rota(c, `/clients/${ficha.id}`)
    const creditoInterno = internos === null ? undefined : internos

    return {
      dados: {
        id: ficha.id, nome: ficha.name, telefone: ficha.phone, email: ficha.email,
        cpf: cpfMascarado(ficha.document), nascimento: ficha.birth_date?.slice(0, 10) ?? null, idade: idade(ficha.birth_date, fusoDoPortal),
        genero: ficha.gender, cidade: ficha.city, ativo: ficha.is_active,
        tags: ficha.tags ?? [],
        // "Cliente desde" como a ficha e o dashboard: o informado (a importada de 2021), senão o cadastro.
        clienteDesde: diaDeClienteDesde({ clienteDesde: ficha.cliente_desde, createdAt: ficha.created_at }, fusoDoPortal),
        temAcessoAoApp: !!ficha.app_account_created_at,
        href,
        ...(verAgenda ? { proximosAtendimentos: ((proximos ?? []) as Ag[]).map(fmt), ultimosAtendimentos: ((ultimos ?? []) as Ag[]).map(fmt) } : {}),
        pacotesEPrePagos: creditos.map(k => ({ procedimento: k.procedimento, origem: k.origem, sessoesRestantes: k.restantes, venceEm: k.venceEm?.slice(0, 10) ?? null })),
        ...(planosDeTratamento ? { planosDeTratamento } : {}),
        // O em aberto dos planos vem em cada plano; aqui, o dos pacotes e pré-pagos.
        ...(emAbertoDasVendas ? { emAbertoDasVendas } : {}),
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
  descricao: 'Listas de clientes: "aniversariantes" (de um mês; padrão o atual), "sem_visita" (sem atendimento concluído há N dias; padrão 90), "novos" (cadastrados nos últimos N dias; padrão 30) ou "tag" (com uma tag do vocabulário da rede, sem diferença de maiúsculas). Até 50.',
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

    // A unidade pedida só decide o fuso do "hoje": TODAS as listas são da rede
    // — a cliente é da rede (24ª simulação; o "sem_visita" também, COP-03).
    const u = await resolverUnidade(c, args.unidade)
    if ('erro' in u) return { dados: { erro: u.erro } }
    // O "hoje" das listas (o mês do aniversário, os N dias): o da unidade, senão o do portal (F62b).
    const fuso = await fusoDe(c, u.unidade?.id)

    if (args.filtro === 'sem_visita') {
      // A MESMA regra do "Reativar clientes" do dashboard (r3-f13-10, o Heitor:
      // "os dois têm de dar a mesma resposta"): sempre a rede inteira — sem
      // visita em NENHUMA unidade —, também com a unidade pedida (copilot.md).
      // E, como lá, com a agenda "só os meus", as dela.
      const desde = addDaysTZ(new Date(), -(args.dias ?? 90), fuso)
      const r = await getClientesParaReativarDoRecorte({
        tenantId: tenant, unidade: u.unidade ? { id: u.unidade.id, name: u.unidade.name } : null,
        desde, limite: 50, professionalId: recorteDosModulos(c.ctx).agenda,
      })
      total = r.total
      lista = r.lista.map(x => ({
        id: x.id, name: x.name, phone: x.phone,
        detalhe: [x.ultimaVisita ? `última visita ${x.ultimaVisita.slice(0, 10)}` : 'nunca veio', x.unidade].filter(Boolean).join(' · '),
      }))
    } else if (args.filtro === 'novos') {
      // Sobra da F49 (10ª): pela regra do dashboard — coalesce(cliente_desde,
      // created_at) —, não pelo cadastro: a importada de 2021 não é nova.
      const desde = addDaysTZ(new Date(), -(args.dias ?? 30), fuso)
      const q = c.admin.from('clients').select('id, name, phone, created_at, cliente_desde').eq('tenant_id', tenant).eq('is_active', true)
        .or(filtroDosClientesNovos(desde, fuso)).order('created_at', { ascending: false }).limit(50)
      lista = ((await ler(q, 'ler os clientes novos')) as (Lin & { created_at: string; cliente_desde: string | null })[] | null ?? [])
        .map(x => ({ id: x.id, name: x.name, phone: x.phone, detalhe: `desde ${diaDeClienteDesde({ clienteDesde: x.cliente_desde, createdAt: x.created_at }, fuso)}` }))
    } else if (args.filtro === 'tag') {
      if (!args.tag) return { dados: { erro: 'Qual tag?' } }
      // O vocabulário da rede (Configurações → Tags): "VIP" e "vip" são a
      // mesma; a que não está nele (nem em cliente nenhum) vira a lista certa.
      const vocabulario = await tagsAtivasDaRede(tenant)
      lista = (await ler(c.admin.rpc('copilot_clientes_da_tag', { p_tenant: tenant, p_tag: args.tag, p_limite: 50 }),
        'ler os clientes da tag') as Lin[] | null) ?? []
      if (!lista.length && !temTag(vocabulario, args.tag)) {
        return { dados: { erro: `A tag "${args.tag}" não existe na rede. Tags: ${vocabulario.join(', ') || 'nenhuma'}.` } }
      }
    } else {
      const mes = args.mes ?? Number(hojeNoFuso(fuso).slice(5, 7))
      // No banco (copilot_aniversariantes): ler a rede toda cortaria em mil linhas.
      const achados = (await ler(c.admin.rpc('copilot_aniversariantes', { p_tenant: tenant, p_mes: mes, p_limite: 50, p_tag: null }), 'ler os aniversariantes') as
        { id: string; name: string; phone: string | null; dia: number }[] | null) ?? []
      lista = achados.map(x => ({ id: x.id, name: x.name, phone: x.phone, detalhe: `dia ${String(x.dia).padStart(2, '0')}` }))
    }

    const itens = lista.map(x => ({ id: x.id, nome: x.name, telefone: x.phone, detalhe: x.detalhe ?? null, href: rota(c, `/clients/${x.id}`) }))
    return {
      // O recorte se diz (COP-03): o "sem visita" é da rede, mesmo com a
      // unidade pedida — o modelo não responde como se fosse dela.
      dados: { filtro: args.filtro, ...(args.filtro === 'sem_visita' ? { recorte: 'a rede inteira: sem visita em nenhuma unidade (a cliente é da rede)' } : {}), ...(total !== null ? { total } : {}), clientes: itens },
      cartao: itens.length ? { tipo: 'links', itens: itens.slice(0, 12).map(i => ({ texto: i.nome, detalhe: [i.detalhe, i.telefone].filter(Boolean).join(' · ') || undefined, href: i.href })) } : undefined,
    }
  },
}

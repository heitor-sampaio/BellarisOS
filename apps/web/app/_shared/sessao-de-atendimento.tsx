import { combinadoDoPlano } from '@/lib/plano-de-tratamento/desconto-combinado'
import { nomesDasMaquininhas } from '@/lib/financeiro/vezes-da-rede'
import { maquininhaDoRotulo } from '@/lib/financeiro/formas'
import { notFound } from 'next/navigation'
import { idOu404 } from '@/lib/id-da-rota'
import { getTenantContext, can, podeReceber, podeVerClinico, temRecurso } from '@/lib/auth'
import { linhasDoHistoricoParaQuemVe } from '@/lib/clients/historico-do-agendamento'
import { semAcesso } from '@/lib/sem-acesso'
import { montaPlano } from '@/lib/plano-de-tratamento/quem-monta'
import { quemDesfazNoCaixa, quemMarcaAChegada, quemRecebeNaUnidade, quemConcluiOAtendimento, quemRespondeAFichaDeSaude } from '@/lib/equipe/quem-desfaz'
import { colheOsDocumentos, dispensaDocumentos } from '@/lib/documentos/acesso'
import { documentosDoAgendamento } from '@/lib/documentos/leitura'
import { envioPelaConversaLigado } from '@/lib/documentos/link-pela-conversa'
import { createAdminClient } from '@/lib/supabase/admin'
import { notasDosProcedimentos } from '@/lib/avaliacao/leitura'
import { notasDaAvaliacao } from '@/lib/avaliacao/notas'
import { getCachedProductsReference, getCachedBranchProfessionals } from '@/lib/cached-queries'
import { ehInsumo } from '@/lib/estoque/uso'
import { AppointmentSession } from '@/components/branch/appointment-session'
import type { SessionAppointment, SessionClient, SessionProduct, AvailableProduct, SessionProfessional, HistoryEntry, LotesDosInsumos } from '@/components/branch/appointment-session'
import type { LoteParaBaixa, ParteDaBaixa } from '@/lib/estoque/fefo'
import { normalizeFormSchema, type AnamnesisRow } from '@/lib/anamnesis'
import { emAbertoDoPlano } from '@/lib/checkout/em-aberto-do-plano'
import { andamentoDosPlanos } from '@/lib/plano-de-tratamento/andamento-do-plano'
import { unidadesDosInsumos, procedimentosParaPlano } from '@/lib/checkout/procedimentos-do-plano'
import { unidadeDoInsumo } from '@/lib/estoque/unidade-de-consumo'
import { paraAnamneseGeral, anamneseRespondida } from '@/lib/anamnese-geral'
import { fichaDeSaudeVencida } from '@/lib/pre-atendimento/validade'
import { responsavelDaFicha } from '@/lib/clients/menor'
import { fichaDePreAtendimento } from '@/lib/pre-atendimento/ficha'
import { oQueFaltaSemOClinico } from '@/lib/atendimento/obrigatorias-no-servidor'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { ler, lerTodas } from '@/lib/db'
import { registrarAcessoAoProntuario } from '@/lib/prontuario/acessos'
import { anotacoesEVersoes } from '@/lib/prontuario/anotacoes-e-versoes'
import { CLIENT_DOCS_BUCKET, getSignedUrls } from '@/lib/storage'
import { nomeDaSessao } from '@/lib/plano-de-tratamento/nome'
import { bloqueiosQueBatem } from '@/lib/agenda/bloqueios'
import { avisoDoBloqueioNoAtendimento } from '@/lib/agenda/bloqueio'
import { fusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'
import { FusoProvider } from '@/components/shared/fuso'
import { comPrecoDaUnidade } from '@/lib/procedimentos/preco-na-unidade'
import { podeEstornar } from '@/lib/financeiro/so-os-meus'
import { getEmAbertoDosPacotes, getEmAbertoDasVendas } from '@/lib/metrics/pacote-em-aberto'

/**
 * Tela de um atendimento — a mesma nos dois portais.
 *
 * Mora em `app/_shared` (pasta privada: o `_` a mantém fora do roteamento)
 * porque quem opera a rede precisa abrir o atendimento sem ser jogado para o
 * portal da unidade. As duas páginas só diferem em como chegam à unidade: pelo
 * slug da URL na unidade, pelo próprio agendamento no admin.
 *
 * `branchId` continua sendo exigido e conferido contra o agendamento — quem
 * chama resolve a unidade, mas a consulta não abre mão do recorte.
 */
export async function SessaoDeAtendimento({
  branchId, slug, id,
}: {
  branchId: string
  slug:     string
  id:       string
}) {
  const ctx = await getTenantContext()
  // A tela do atendimento abre com o Atendimento em Ver (UM1, o Heitor,
  // 2026-11-23) — ou, como vista pessoal (SM2), a quem atende e não tem o
  // módulo, só no agendamento DELA, e só para ver: o que se faz aqui continua
  // pedindo a permissão de cada passo.
  const veOAtendimento = can(ctx, 'atendimento', 'VIEW')
  // Como a vistaPessoal: fora do plano da rede (sem a Agenda), nem a vista.
  const pessoal = !veOAtendimento && !ctx.isClient && ctx.providesServices && temRecurso(ctx, 'agenda') ? ctx.internalUserId ?? null : null
  if (!veOAtendimento && !pessoal) throw semAcesso()
  // O id vai a uma coluna uuid: o que não é uuid é 404, não 22P02 (D15).
  idOu404(id)

  const admin = createAdminClient()


  // 1ª rodada: appointment + MRE em paralelo.
  //
  // `maybeSingle` + `ler`: "não existe" continua sendo 404, e uma FALHA da
  // consulta deixa de se disfarçar de 404 — antes as duas davam na mesma tela.
  const [apptRaw, mreRaw] = await Promise.all([
    ler(admin
      .from('appointments')
      .select(`
        id, status, scheduled_at, started_at, completed_at, cancelled_at,
        cancellation_reason, price, duration_min, client_notes, notes, procedure_id, professional_id,
        treatment_plan_id,
        client_confirmed_at, client_rating, procedure_rating, client_feedback,
        procedures(id, name, category, duration_min, form_id),
        professional:users!professional_id(id, name),
        room:rooms(id, name),
        client:clients(id, name, phone, birth_date, created_at, cliente_desde, tags, notes, document, auth_id, responsavel_nome, responsavel_cpf, responsavel_parentesco, responsavel_telefone)
      `)
      .eq('id', id)
      .eq('branch_id', branchId)
      .maybeSingle(), 'carregar o atendimento'),

    ler(admin
      .from('medical_record_entries')
      .select('notes, intercurrences, form_data, queixas')
      .eq('appointment_id', id)
      .maybeSingle(), 'carregar a ficha do atendimento'),
  ])

  if (!apptRaw) notFound()
  if (pessoal && apptRaw.professional_id !== pessoal) throw semAcesso()

  type RawProc   = { id: string; name: string; category: string; duration_min: number }
  type RawProf   = { id: string; name: string }
  type RawRoom   = { id: string; name: string } | null
  type RawClient = { id: string; name: string; phone: string | null; birth_date: string | null; created_at: string | null; cliente_desde?: string | null; tags: string[] | null; notes: string | null; document: string | null }

  const proc = apptRaw.procedures   as unknown as RawProc   | null
  const prof = apptRaw.professional as unknown as RawProf   | null
  const room = apptRaw.room         as unknown as RawRoom
  const cli  = apptRaw.client       as unknown as RawClient | null
  if (!cli) notFound()

  const procedureId = apptRaw.procedure_id as string | null

  // 2ª rodada: anamnese + insumos + produtos + profissionais + histórico + pagamento + plano de tratamento
  const treatmentPlanId = apptRaw.treatment_plan_id as string | null
  // Era `&& !apptRaw.is_evaluation`: a avaliação nunca contava como sessão do
  // plano. Com ela virando procedimento comum (2026-09-25), quem decide se o
  // atendimento é do plano é o proprio vinculo ao plano, e mais nada.
  const isPartOfPlan    = !!treatmentPlanId

  const [
    medRecord, procProductsRaw, branchProductsRaw,
    professionalsRaw, historyRaw, paymentRaw,
    allProceduresRaw, packagesRaw, planRaw,
    planSessionRaw, sessaoDePacote, unidadePrePaga,
  ] = await Promise.all([
    ler(admin
      .from('medical_records')
      .select('general_anamnesis')
      .eq('client_id', cli.id)
      .maybeSingle(), 'carregar a ficha de saúde do cliente'),

    procedureId
      ? ler(admin
          .from('procedure_products')
          .select('product_id, quantity, products(name, unit, consumption_unit, units_per_package)')
          .eq('procedure_id', procedureId), 'carregar os insumos do procedimento')
      : Promise.resolve([]),

    getCachedProductsReference(ctx.tenantId!),

    // `users.role` foi removida na migração de cargos dinâmicos: quem atende é
    // marcado por `provides_services`. A consulta antiga falhava com 42703 e,
    // com o erro descartado, a lista de profissionais para reatribuir ficava vazia.
    getCachedBranchProfessionals(branchId, ctx.tenantId!),

    ler(admin
      .from('appointment_history')
      .select('id, changed_by_name, action, description, created_at')
      .eq('appointment_id', id)
      .order('created_at', { ascending: false }), 'carregar o histórico do atendimento'),

    ler(admin
      .from('financial_transactions')
      // Todos os lançamentos do atendimento: o estornado fica no histórico e o
      // recebimento de depois é outro lançamento (D6 da simulação de 2026-10-28).
      .select('id, payment_method, amount, cartao_vezes, cartao_bandeira, maquininha_id, is_paid, notes, estorno_motivo, created_at')
      .eq('appointment_id', id)
      .eq('type', 'INCOME')
      .order('created_at', { ascending: false }), 'carregar o pagamento do atendimento'),

    // Todos os procedimentos ativos da rede (para o plano de tratamento) — com
    // insumos embutidos.
    //
    // Aqui havia `.eq('is_evaluation', false)`, coluna removida em 2026-09-25
    // (a avaliação virou procedimento comum). A consulta passou a responder
    // 42703, o erro era descartado, e o editor de plano da tela de atendimento
    // ficou SEM procedimento nenhum para escolher. Pelo `ler`, uma quebra
    // dessas aparece em vez de esvaziar a tela.
    ler(admin
      .from('procedures')
      .select('id, name, category, duration_min, price, procedure_products(product_id, quantity, products(id, name, unit, consumption_unit, units_per_package))')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true)
      .order('name'), 'carregar os procedimentos do plano'),

    // Pacotes disponíveis
    ler(admin
      .from('service_packages')
      .select('id, name, procedure_id, total_sessions, price')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true), 'carregar os pacotes'),

    // Plano de tratamento existente para este appointment
    ler(admin
      .from('treatment_plans')
      .select(`
        id, status, professional_notes, desconto_combinado_tipo, desconto_combinado_valor,
        treatment_plan_sessions(
          id, sort_order,
          treatment_plan_session_procedures(procedure_id, price, sort_order, products, procedures(name))
        )
      `)
      .eq('evaluation_appointment_id', id)
      .maybeSingle(), 'carregar o plano gerado nesta avaliação'),

    // Sessão do plano vinculada a este agendamento (para sessões de execução)
    isPartOfPlan
      ? ler(admin
          .from('treatment_plan_sessions')
          .select('treatment_plan_session_procedures(products, sort_order, procedures(name))')
          .eq('appointment_id', id)
          .maybeSingle(), 'carregar a sessão do plano')
      : Promise.resolve(null),

    // Sessão de pacote: já paga na venda do pacote, não se cobra de novo
    // (2026-09-27). O servidor recusa em `confirmPayment`; aqui é o botão.
    // O pacote trazido de fora (F35) não teve venda: a tela diz isso (A15 da 10ª).
    ler(admin.from('package_sessions').select('id, session_number, client_package_id, client_packages(de_fora, total_sessions, service_packages(name))').eq('appointment_id', id).maybeSingle(),
      'conferir se é sessão de pacote'),
    // Procedimento pré-pago: também pago na venda.
    // A3 da 37ª: o número da sessão e o total da venda, para a faixa "já paga".
    ler(admin.from('procedure_sale_units').select('id, numero, sale_id, procedure_sales(quantity)').eq('appointment_id', id).neq('status', 'CANCELADA').maybeSingle(),
      'conferir se é procedimento pré-pago'),

  ])

  type RawProcProduct = {
    product_id: string
    quantity:   number
    products:   { name: string; unit: string; consumption_unit: string | null; units_per_package: number | null } | null
  }

  // Dado clínico só para quem tem o Prontuário em Ver. A tela continua abrindo
  // sem ele — iniciar, concluir e o status não são de prontuário.
  const canViewRecords = podeVerClinico(ctx)
  // Quem viu o prontuário fica registrado (lib/prontuario/acessos.ts).
  if (canViewRecords && cli?.id) await registrarAcessoAoProntuario(ctx, cli.id, 'sessao', apptRaw.id as string)
  // A anamnese geral: as perguntas da ficha de pré-atendimento da rede (a
  // antiga, de campos fixos, convertida na hora).
  const fichaPreAtendimento = await fichaDePreAtendimento(admin, ctx.tenantId!)
  const anamnesis = canViewRecords ? paraAnamneseGeral(medRecord?.general_anamnesis ?? null, fichaPreAtendimento) : null
  // A ficha de saúde fora da validade da rede continua valendo, mas a tela
  // AVISA (atend-05, revisão do Heitor de 2026-11-02).
  const validadeMeses = anamneseRespondida(anamnesis)
    ? ((await ler(admin.from('tenants').select('pre_atendimento_validade_meses').eq('id', ctx.tenantId!).single(),
        'ler a validade da ficha de saúde')) as { pre_atendimento_validade_meses: number } | null)?.pre_atendimento_validade_meses ?? 6
    : 0
  const fichaDeSaudeVencidaEm = anamneseRespondida(anamnesis) && fichaDeSaudeVencida(anamnesis.respondidoEm, validadeMeses)
    ? anamnesis.respondidoEm : null

  // Produtos do procedimento (insumos padrão)
  const defaultProducts: SessionProduct[] = ((procProductsRaw ?? []) as unknown as RawProcProduct[])
    .filter(pp => pp.products !== null)
    .map(pp => {
      const p = pp.products!
      const displayUnit = unidadeDoInsumo(p)
      return {
        productId: pp.product_id,
        name:      p.name,
        unit:      displayUnit,
        quantity:  pp.quantity,
      }
    })

  // O plano GRAVADO guarda a unidade que a tela mandou — até 2026-10-29, a da
  // embalagem ("frasco") para quantidades em ml (D9). A unidade mostrada é a
  // de consumo do produto, lida agora.
  type ComProdutos = { products: { product_id: string }[] | null }
  const unidadesGravadas = await unidadesDosInsumos(ctx.tenantId!, [
    ...(((planSessionRaw as unknown as { treatment_plan_session_procedures: ComProdutos[] | null } | null)?.treatment_plan_session_procedures) ?? []),
    ...(((planRaw?.treatment_plan_sessions as unknown as { treatment_plan_session_procedures: ComProdutos[] | null }[] | null) ?? [])
      .flatMap(s => s.treatment_plan_session_procedures ?? [])),
  ].flatMap(sp => (sp.products ?? []).map(p => p.product_id)))

  // Produtos da sessão do plano de tratamento (sobrepõem os padrão quando presentes)
  type RawSessProduct = { product_id: string; name: string; unit: string; quantity: number }
  type RawSessProc    = { products: RawSessProduct[] | null }
  const planSessionProducts: SessionProduct[] = planSessionRaw
    ? ((planSessionRaw as unknown as { treatment_plan_session_procedures: RawSessProc[] | null }).treatment_plan_session_procedures ?? [])
        .flatMap(sp => (sp.products ?? []).map(p => ({
          productId: p.product_id,
          name:      p.name,
          unit:      unidadesGravadas.get(p.product_id) ?? p.unit,
          quantity:  Number(p.quantity),
        })))
    : []

  // CONCLUÍDO, os insumos são os da BAIXA feita (D9 da 6ª simulação): o
  // `PROCEDURE_USAGE` do atendimento, somado por produto, na unidade do
  // movimento (a de consumo). Era o cadastro do procedimento ou a sessão do
  // plano — o insumo acrescentado na hora sumia ("Nenhum insumo registrado"
  // com a baixa no banco), e o do cadastro que não foi usado aparecia.
  const insumosDaBaixa: SessionProduct[] | null = apptRaw.status === 'COMPLETED'
    ? await (async () => {
        type RawBaixa = { product_id: string; quantity: number | string; products: { name: string; unit: string; consumption_unit: string | null; units_per_package: number | null } | null }
        const baixas = (await ler(admin.from('stock_movements')
          .select('product_id, quantity, products(name, unit, consumption_unit, units_per_package)')
          .eq('appointment_id', apptRaw.id as string).eq('branch_id', branchId).eq('type', 'PROCEDURE_USAGE')
          .order('created_at'), 'ler a baixa do atendimento') ?? []) as unknown as RawBaixa[]
        const porProduto = new Map<string, SessionProduct>()
        for (const b of baixas) {
          if (!b.products) continue
          const atual = porProduto.get(b.product_id)
          const q = Math.abs(Number(b.quantity))
          if (atual) atual.quantity += q
          else porProduto.set(b.product_id, { productId: b.product_id, name: b.products.name, unit: unidadeDoInsumo(b.products), quantity: q })
        }
        return [...porProduto.values()].map(p => ({ ...p, quantity: Math.round(p.quantity * 10_000) / 10_000 }))
      })()
    : null

  const products = insumosDaBaixa ?? (planSessionProducts.length > 0 ? planSessionProducts : defaultProducts)

  // Os INSUMOS ativos da rede (para o profissional adicionar avulso) — o
  // produto só de revenda não é insumo (D-6).
  type RawBranchProduct = { id: string; name: string; sku?: string | null; unit: string; consumption_unit: string | null; units_per_package: number | null; uso?: string | null }
  const availableProducts: AvailableProduct[] = ((branchProductsRaw ?? []) as RawBranchProduct[]).filter(p => ehInsumo(p.uso)).map(p => ({
    id:   p.id,
    name: p.name,
    unit: unidadeDoInsumo(p),
    sku:  p.sku ?? null,
  }))

  // De qual lote sai cada insumo (A11 da 9ª simulação, 2026-11-07): o FEFO estava
  // certo, mas só o Estoque dizia de qual frasco saiu. Em aberto, os lotes com
  // saldo da unidade (a tela faz a conta do gatilho, `lotesDaBaixa`); concluído
  // (ou desistido no meio), a ligação da baixa que houve (`stock_movement_batches`).
  const fatorDe = (p: { consumption_unit: string | null; units_per_package: number | string | null } | null | undefined) =>
    p?.consumption_unit && Number(p.units_per_package) > 0 ? Number(p.units_per_package) : 1
  const fatores: Record<string, number> = Object.fromEntries(((branchProductsRaw ?? []) as RawBranchProduct[]).map(p => [p.id, fatorDe(p)]))
  // A9 da 18ª: a embalagem de cada produto, para a linha do insumo dizer "1 ml · 1 seringa".
  const embalagens = Object.fromEntries(((branchProductsRaw ?? []) as RawBranchProduct[])
    .map(p => [p.id, { unit: p.unit, consumption_unit: p.consumption_unit, units_per_package: p.units_per_package }]))
  const baixaFeita = apptRaw.status === 'COMPLETED' || apptRaw.status === 'CANCELLED'
  const lotesDosInsumos: LotesDosInsumos = baixaFeita
    ? await (async () => {
        type Lig = { quantity: number | string; product_batches: { id: string; batch_number: string | null; expires_at: string | null } | null
          stock_movements: { product_id: string; products: { consumption_unit: string | null; units_per_package: number | null } | null } | null }
        const ligs = (await ler(admin.from('stock_movement_batches')
          .select('quantity, product_batches(id, batch_number, expires_at), stock_movements!inner(product_id, appointment_id, branch_id, type, products(consumption_unit, units_per_package))')
          .eq('stock_movements.appointment_id', apptRaw.id as string).eq('stock_movements.branch_id', branchId)
          .eq('stock_movements.type', 'PROCEDURE_USAGE'), 'ler os lotes da baixa do atendimento') ?? []) as unknown as Lig[]
        const feita: Record<string, ParteDaBaixa[]> = {}
        for (const l of ligs) {
          if (!l.product_batches || !l.stock_movements) continue
          const q = Math.round(Number(l.quantity) * fatorDe(l.stock_movements.products) * 1000) / 1000
          ;(feita[l.stock_movements.product_id] ??= []).push({ id: l.product_batches.id, numero: l.product_batches.batch_number, validade: l.product_batches.expires_at, quantidade: q })
        }
        return { feita, prever: {}, fatores, embalagens }
      })()
    : await (async () => {
        type Lote = { id: string; product_id: string; batch_number: string | null; expires_at: string | null; received_at: string | null; quantity: number | string }
        const lotes = await lerTodas<Lote>((de, ate) => admin.from('product_batches')
          .select('id, product_id, batch_number, expires_at, received_at, quantity')
          .eq('branch_id', branchId).gt('quantity', 0)
          .order('expires_at', { ascending: true, nullsFirst: false }).order('id')
          .range(de, ate) as unknown as PromiseLike<{ data: Lote[] | null; error: { message: string } | null }>,
        'carregar os lotes dos insumos')
        const prever: Record<string, LoteParaBaixa[]> = {}
        for (const l of lotes) {
          (prever[l.product_id] ??= []).push({ id: l.id, numero: l.batch_number, validade: l.expires_at, recebidoEm: l.received_at, quantidade: Number(l.quantity) })
        }
        return { feita: null, prever, fatores, embalagens }
      })()

  const professionals: SessionProfessional[] = ((professionalsRaw ?? []) as { id: string; name: string }[]).map(p => ({
    id:   p.id,
    name: p.name,
  }))

  type RawHistory = { id: string; changed_by_name: string; action: string; description: string; created_at: string }
  // As linhas da foto clínica só com o Prontuário em Ver (o Heitor, 27/11: "Somem só as linhas clínicas").
  const history: HistoryEntry[] = linhasDoHistoricoParaQuemVe((historyRaw ?? []) as RawHistory[], canViewRecords).map(h => ({
    id:            h.id,
    changedByName: h.changed_by_name,
    action:        h.action,
    description:   h.description,
    createdAt:     h.created_at,
  }))

  // Procedimentos e pacotes para o editor de plano de tratamento
  type RawProcInsumo = {
    product_id: string
    quantity:   number
    products:   { id: string; name: string; unit: string; consumption_unit: string | null; units_per_package: number | null } | null
  }
  type RawAllProc = {
    id:                 string
    name:               string
    category:           string
    duration_min:       number
    price:              number
    procedure_products: RawProcInsumo[]
  }

  // O editor do plano propõe o preço DA UNIDADE do atendimento (D2 da 9ª).
  const allProcs = await comPrecoDaUnidade(admin, branchId, (allProceduresRaw ?? []) as unknown as RawAllProc[])

  // O catálogo do editor do plano é o da unidade do atendimento — a do plano
  // que nasce dele —, pela regra única (D4 da 14ª, F73): só o que ela FAZ, com
  // o preço dela. Antes a lista era o catálogo da rede inteira.
  const { procedures: treatmentProcedures } = await procedimentosParaPlano(ctx.tenantId!, branchId)

  // Mapa de insumos padrão por procedure_id
  const procedureProductsMap: Record<string, { productId: string; name: string; unit: string; quantity: number }[]> = {}
  for (const proc of allProcs) {
    procedureProductsMap[proc.id] = (proc.procedure_products ?? [])
      .filter(pp => pp.products !== null)
      .map(pp => {
        const p    = pp.products!
        const unit = unidadeDoInsumo(p)
        return { productId: pp.product_id, name: p.name, unit, quantity: Number(pp.quantity) }
      })
  }

  type RawPkg = { id: string; name: string; procedure_id: string; total_sessions: number; price: number }
  const treatmentPackages = ((packagesRaw ?? []) as RawPkg[]).map(p => ({
    id: p.id, name: p.name, procedureId: p.procedure_id, totalSessions: p.total_sessions, price: Number(p.price),
  }))

  // Plano de tratamento existente (se houver)
  type RawPlanProcProduct = { product_id: string; name: string; unit: string; quantity: number }
  type RawPlanSessProc = { procedure_id: string; price: number; sort_order: number; products: RawPlanProcProduct[]; procedures: { name: string } | null }
  type RawPlanSess = { id: string; sort_order: number; treatment_plan_session_procedures: RawPlanSessProc[] }
  // D8 da 28ª (princípio 3): o plano aceito e já recebido não diz "lá a cliente
  // paga" — a régua do recebido é a da situação do plano (um lançamento vivo dele).
  const planoAceitoRecebido = planRaw?.status === 'ACCEPTED'
    ? (await andamentoDosPlanos(ctx.tenantId!, [planRaw.id as string])).get(planRaw.id as string)?.recebido ?? false
    : false
  const existingPlan = planRaw ? {
    id:       planRaw.id as string,
    status:   planRaw.status as string,
    recebido: planoAceitoRecebido,
    notes:    canViewRecords ? ((planRaw.professional_notes as string | null) ?? null) : null,
    // 22ª A20: o desconto do plano combinado no editor (no rascunho e no proposto).
    descontoCombinado: ['DRAFT', 'PROPOSED'].includes(planRaw.status as string)
      ? combinadoDoPlano(planRaw as { desconto_combinado_tipo?: string | null; desconto_combinado_valor?: number | string | null })
      : null,
    sessions: ((planRaw.treatment_plan_sessions as unknown as RawPlanSess[]) ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(sess => ({
        procedures: (sess.treatment_plan_session_procedures ?? [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(p => ({
            procedureId: p.procedure_id,
            name:        (p.procedures as { name?: string } | null)?.name ?? '—',
            price:       Number(p.price),
            products:    (p.products ?? []).map((pr: RawPlanProcProduct) => ({
              productId: pr.product_id, name: pr.name, unit: unidadesGravadas.get(pr.product_id) ?? pr.unit, quantity: Number(pr.quantity),
            })),
          })),
      })),
  } : null

  // O bloqueio da agenda que bate com este horário (A31 da 8ª simulação): o da
  // profissional e o da sala. Só no que ainda não terminou — é aviso para quem
  // vai iniciar ou está atendendo.
  let bloqueioDoHorario: string | null = null
  if (['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS'].includes(apptRaw.status as string)) {
    const ini = new Date(apptRaw.scheduled_at as string)
    const fim = new Date(ini.getTime() + (Number(apptRaw.duration_min) || 60) * 60_000)
    const [daProf, daSala] = await Promise.all([
      prof?.id ? bloqueiosQueBatem(admin, { professionalId: prof.id, inicio: ini, fim }) : Promise.resolve([]),
      room?.id ? bloqueiosQueBatem(admin, { roomId: room.id, inicio: ini, fim }) : Promise.resolve([]),
    ])
    const doHorario = daProf[0] ?? daSala[0] ?? null
    if (doHorario) {
      // No relógio da unidade (F64, C4).
      bloqueioDoHorario = avisoDoBloqueioNoAtendimento(daProf[0] ? { profissional: prof?.name } : { sala: room?.name }, doHorario,
        await fusoDaUnidade(ctx.tenantId, branchId))
    }
  }

  const appointment: SessionAppointment = {
    bloqueioDoHorario,
    id:                  apptRaw.id,
    status:              apptRaw.status,
    scheduledAt:         apptRaw.scheduled_at,
    startedAt:           apptRaw.started_at ?? null,
    completedAt:         apptRaw.completed_at ?? null,
    cancelledAt:         apptRaw.cancelled_at ?? null,
    cancellationReason:  apptRaw.cancellation_reason ?? null,
    price:               parseFloat(String(apptRaw.price ?? 0)),
    // D5 da 7ª: a duração é a do AGENDAMENTO (a sessão de dois procedimentos tem
    // 110 min); a do procedimento só quando o agendamento não tem.
    durationMin:         Number(Number(apptRaw.duration_min) > 0 ? apptRaw.duration_min : (proc?.duration_min ?? 0)),
    clientNotes:         apptRaw.client_notes ?? null,
    // A sessão do plano com mais de um procedimento diz todos (A36): era só o do agendamento.
    procedureName:       (planSessionRaw && nomeDaSessao((planSessionRaw as unknown as { treatment_plan_session_procedures: { sort_order: number | null; procedures: { name: string | null } | null }[] | null }).treatment_plan_session_procedures)) || (proc?.name ?? '—'),
    procedureCategory:   proc?.category ?? '',
    professionalId:      prof?.id ?? '',
    professionalName:    prof?.name ?? '—',
    roomName:            room?.name ?? null,
    // A evolução é prontuário: sem o módulo, a tela não a recebe (2026-10-03).
    savedNotes:          canViewRecords ? (mreRaw?.notes ?? null) : null,
    savedIntercurrences: canViewRecords ? (mreRaw?.intercurrences ?? null) : null,
    // As dores são do prontuário do atendimento (D3 de 2026-10-28); a
    // observação do agendamento é outra coisa e vai à parte (A17).
    complaints:          canViewRecords ? (mreRaw?.queixas ?? null) : null,
    internalNotes:       apptRaw.notes ?? null,
    clientConfirmedAt:   apptRaw.client_confirmed_at ?? null,
    clientTemApp:        !!(apptRaw.client as { auth_id?: string | null } | null)?.auth_id,
    // F17-3: as notas que a cliente deu — o atendimento e cada procedimento.
    notasDaCliente:      notasDaAvaliacao({ client_rating: apptRaw.client_rating, procedure_rating: apptRaw.procedure_rating, procedureName: proc?.name ?? 'Procedimento' },
      apptRaw.client_confirmed_at ? ((await notasDosProcedimentos(admin, [apptRaw.id as string])).get(apptRaw.id as string) ?? []) : []),
    clientFeedback:      apptRaw.client_feedback ?? null,
  }

  const client: SessionClient = {
    id:        cli.id,
    name:      cli.name,
    phone:     cli.phone ?? null,
    birthDate: cli.birth_date ?? null,
    createdAt: cli.created_at ?? null,
    clienteDesde: cli.cliente_desde ?? null,
    tags:      (cli.tags as string[]) ?? [],
    notes:     cli.notes ?? null,
    document:  cli.document ?? null,
    // O responsável legal da menor (decisão 2 do Heitor, 2026-11-05).
    responsavel: responsavelDaFicha(cli as Parameters<typeof responsavelDaFicha>[0]),
  }

  // Saldo do plano ligado a este atendimento.
  //
  // Vale tanto para a sessão do plano (`treatment_plan_id` no agendamento)
  // quanto para a própria avaliação que gerou um plano já aceito: nos dois
  // casos, quem está com a pessoa na frente precisa ver o que falta receber.
  // Mas o saldo é DINHEIRO: aparece a quem recebe (`podeReceber`), não à
  // profissional sem o Financeiro (A39 da 7ª simulação, 2026-11-05 — ela via
  // "Plano · R$ 2.672 a vencer"; decidido pelo princípio 3).
  const planoDaCobranca = treatmentPlanId
    ?? (planRaw?.status === 'ACCEPTED' ? (planRaw.id as string) : null)

  const saldoDoPlano = planoDaCobranca && podeReceber(ctx) ? await emAbertoDoPlano(planoDaCobranca) : null
  // O que vai vencer aparece, mas só como informação: já está combinado.
  const planoEmAberto = saldoDoPlano && (saldoDoPlano.emAberto > 0 || saldoDoPlano.aVencer > 0)
    ? {
        planId:   saldoDoPlano.planId,
        nome:     saldoDoPlano.nome,
        emAberto: saldoDoPlano.emAberto,
        recebido: saldoDoPlano.recebido,
        aVencer:  saldoDoPlano.aVencer,
        proximoVencimento: saldoDoPlano.proximoVencimento,
      }
    : null

  const isAdmin   = ctx.permissions.agenda === 'MANAGE'
  const isResponsibleProfessional = ctx.providesServices && ctx.internalUserId === apptRaw.professional_id

  const canCheckin   = ctx.permissions.agenda === 'MANAGE'
  // Quem inicia e conclui é o Atendimento em Gerenciar, e só ele (o Heitor,
  // 2026-11-18: "Só inicia e conclui atendimento quem tem gerenciar no
  // atendimento"; UM2), em qualquer atendimento ao alcance (a página já
  // conferiu o alcance).
  const canManage    = can(ctx, 'atendimento', 'MANAGE')
  const canReassign  = isAdmin
  const canPayment   = ctx.permissions.cashier === 'MANAGE'
  // Editar o clínico (a evolução, as fotos, a ficha de saúde, a ficha) é do
  // Prontuário em Gerenciar, e só dele — sem precisar do Atendimento (UM4):
  // com `medical_records: Ver` a ficha aparecia preenchível e o salvamento era
  // recusado depois de a pessoa digitar tudo.
  const canEditRecords = can(ctx, 'medical_records', 'MANAGE')

  type RawPayment = { id: string; payment_method: string; amount: number; cartao_vezes: number | null; cartao_bandeira: string | null; maquininha_id: string | null; is_paid: boolean; notes: string | null; estorno_motivo: string | null }
  const lancamentos = (paymentRaw ?? []) as RawPayment[]
  // "Pagamento confirmado" é o recebimento PAGO e vivo. O estornado reabre a
  // cobrança (D6, 2026-10-28): a tela diz que foi estornado e oferece receber.
  const pago      = lancamentos.find(l => l.is_paid && l.notes !== 'Estornada') ?? null
  const estornado = pago ? null : (lancamentos.find(l => l.notes === 'Estornada') ?? null)
  // A18 da 14ª: com mais de uma maquininha na rede, o rótulo diz qual.
  const maquininhas = pago || estornado ? await nomesDasMaquininhas(ctx.tenantId!) : null
  const paymentTransaction = pago
    ? { id: pago.id, paymentMethod: pago.payment_method, amount: Number(pago.amount), cartaoVezes: pago.cartao_vezes, cartaoBandeira: pago.cartao_bandeira, maquininha: maquininhaDoRotulo(maquininhas, pago.maquininha_id) }
    : null
  const pagamentoEstornado = estornado
    ? { paymentMethod: estornado.payment_method, amount: Number(estornado.amount), cartaoVezes: estornado.cartao_vezes, cartaoBandeira: estornado.cartao_bandeira, maquininha: maquininhaDoRotulo(maquininhas, estornado.maquininha_id), motivo: estornado.estorno_motivo }
    : null

  // O recebimento é na COMANDA do atendimento no PDV (PDV7/CX3, a revisão do
  // Heitor de 2026-11-13): o "Abater do pacote", o desconto, o voucher, os
  // pontos e as formas moram no "Receber" de lá. Aqui, só o caminho até ela.
  const comandaId = podeReceber(ctx) && apptRaw.status === 'COMPLETED' && !pago
    ? ((await ler(admin.from('comandas').select('id').eq('appointment_id', appointment.id).eq('tenant_id', ctx.tenantId!)
        .is('cancelada_em', null).maybeSingle(), 'buscar a comanda do atendimento')) as { id: string } | null)?.id ?? null
    : null

  // A ficha do procedimento (construtor) + as respostas já salvas.
  // Eram DUAS consultas, para dois modelos que eram a mesma coisa com nomes
  // diferentes — "de anamnese" e "de atendimento" (2026-09-25).
  const procForm = apptRaw.procedures as unknown as { form_id?: string | null } | null
  const fichaId = canViewRecords ? (procForm?.form_id ?? null) : null

  let ficha: { name: string; rows: AnamnesisRow[] } | null = null
  let respostasDaFicha: Record<string, unknown> = {}
  if (fichaId) {
    const formRow = await ler(admin
      .from('forms')
      .select('name, schema')
      .eq('id', fichaId)
      .eq('tenant_id', ctx.tenantId!)
      .maybeSingle(), 'buscar a ficha de atendimento')
    if (formRow) {
      ficha = { name: formRow.name as string, rows: normalizeFormSchema(formRow.schema).rows }
      const salvas = (mreRaw?.form_data as { ficha?: { answers?: Record<string, unknown> } } | null)?.ficha
      if (salvas?.answers && typeof salvas.answers === 'object') respostasDaFicha = salvas.answers
    }
  }

  // As fotos clínicas deste atendimento (A30, 2026-10-27): anexo clínico,
  // então só para quem vê o prontuário dele — e o acesso já foi registrado
  // acima. Bucket privado: a tela recebe URL assinada.
  type RawFoto = { id: string; name: string; file_path: string; file_name: string; mime_type: string | null; created_at: string; enviado_em: string | null; momento: string | null }
  const fotosRaw = canViewRecords && cli
    ? ((await ler(admin.from('client_documents')
        .select('id, name, file_path, file_name, mime_type, created_at, enviado_em, momento')
        .eq('appointment_id', appointment.id).eq('client_id', cli.id).is('apagado_em', null)
        .order('created_at'), 'carregar as fotos do atendimento')) ?? []) as RawFoto[]
    : []
  const urlsDasFotos = await getSignedUrls(CLIENT_DOCS_BUCKET, fotosRaw.map(f => f.file_path))
  const fotosDoAtendimento = canViewRecords
    ? fotosRaw.map(f => ({ id: f.id, name: f.name, fileName: f.file_name, mimeType: f.mime_type, createdAt: f.created_at, url: urlsDasFotos[f.file_path] ?? '', enviadoEm: f.enviado_em, momento: f.momento }))
    : null
  // PR2 (bloco Prontuário): as anotações depois do atendimento e as versões de
  // antes do registro corrigido — dado clínico, só para quem vê o prontuário.
  const depoisDoAtendimento = canViewRecords ? await anotacoesEVersoes(admin, ctx.tenantId!, [appointment.id]) : null

  return (
    <>
      {/* O prontuário pelo SINAL da rede, não `medical_record_entries`: a
          evolução ia inteira pelo websocket a quem não tem o Prontuário
          (ATD-P01, 18/11). A tela recarrega pelo servidor. */}
      <RealtimeRefresher tables={['prontuario_sinais', 'financeiro_sinais']} topicos={['agenda']} />
      {/* F64 (D6): as horas da tela no relógio da unidade DO ATENDIMENTO — no
          /admin o provedor do layout é o da rede. */}
      <FusoProvider fuso={await fusoDaUnidade(ctx.tenantId, branchId)}>
      <AppointmentSession
        appointment={appointment}
        client={client}
        anamnesis={anamnesis}
        fichaDeSaudeVencidaEm={fichaDeSaudeVencidaEm}
        fichaPreAtendimento={fichaPreAtendimento}
        canEditRecords={canEditRecords}
        canViewRecords={canViewRecords}
        fotosDoAtendimento={fotosDoAtendimento}
        anotacoes={depoisDoAtendimento ? (depoisDoAtendimento.anotacoes[appointment.id] ?? []) : null}
        versoesDoRegistro={depoisDoAtendimento?.versoes[appointment.id] ?? []}
        podeAnotar={canViewRecords && can(ctx, 'medical_records', 'MANAGE')}
        portalNoPlano={temRecurso(ctx, 'portal')}
        ficha={ficha}
        respostasDaFicha={respostasDaFicha}
        products={products}
        availableProducts={availableProducts}
        lotesDosInsumos={lotesDosInsumos}
        professionals={professionals}
        history={history}
        branchId={branchId}
        slug={slug}
        canCheckin={canCheckin}
        canManage={canManage}
        ehDaProfissional={isResponsibleProfessional}
        canReassign={canReassign}
        canPayment={canPayment}
        paymentTransaction={paymentTransaction}
        pagamentoEstornado={pagamentoEstornado}
        comandaId={comandaId}
        treatmentProcedures={treatmentProcedures}
        treatmentPackages={treatmentPackages}
        existingPlan={existingPlan}
        procedureProductsMap={procedureProductsMap}
        isPartOfPlan={isPartOfPlan}
        podeMontarPlano={temRecurso(ctx, 'planos_de_tratamento')}
        // UM3: monta o plano quem tem o Atendimento em Gerenciar na unidade do
        // atendimento (generateEvaluationPlan confere).
        montaPlanoNaUnidade={montaPlano(ctx, branchId)}
        podeInjetaveis={temRecurso(ctx, 'injetaveis')}
        // D12 da 25ª: o plano da cliente é do Atendimento (os leitores pedem o
        // Atendimento em Ver) — sem ele, nada de "Planejamento" na sessão.
        podeVerPlanos={can(ctx, 'atendimento', 'VIEW')}
        // D9 da 26ª: o "Enviar o link" da ficha de saúde é da Agenda em Gerenciar.
        podeGerenciarAgenda={can(ctx, 'agenda', 'MANAGE')}
        isPackageSession={!!sessaoDePacote}
        pacoteDeFora={!!(sessaoDePacote as { client_packages?: { de_fora?: boolean | null } | null } | null)?.client_packages?.de_fora}
        // A7 da 18ª: a faixa "Sessão 1 de 6 do pacote …, já paga".
        // D4 da 21ª: o pacote no crediário com parcelas em aberto não é "já paga" — o valor, só a quem recebe.
        sessaoDoPacote={sessaoDePacote ? await (async () => {
          const sp = sessaoDePacote as unknown as { session_number: number; client_package_id: string | null; client_packages: { de_fora: boolean | null; total_sessions: number | null; service_packages: { name: string } | null } | null }
          const emAberto = sp.client_package_id ? (await getEmAbertoDosPacotes(ctx.tenantId!, [sp.client_package_id]))[sp.client_package_id]?.valor ?? 0 : 0
          return {
            numero: sp.session_number, total: sp.client_packages?.total_sessions ?? null, nome: sp.client_packages?.service_packages?.name ?? null,
            deFora: !!sp.client_packages?.de_fora, emAberto, mostraOValor: podeReceber(ctx),
          }
        })() : null}
        isPrePago={!!unidadePrePaga}
        // A3 da 37ª (AG-56): a faixa "Sessão 1 de 3 do pré-pago de X, já paga", como a do pacote.
        sessaoDoPrePago={unidadePrePaga ? await (async () => {
          const u = unidadePrePaga as unknown as { numero: number; sale_id: string; procedure_sales: { quantity: number | null } | null }
          const emAberto = (await getEmAbertoDasVendas(ctx.tenantId!, [u.sale_id]))[u.sale_id]?.valor ?? 0
          return { numero: u.numero, total: u.procedure_sales?.quantity ?? null, nome: proc?.name ?? null, emAberto, mostraOValor: podeReceber(ctx) }
        })() : null}
        podeReceber={podeReceber(ctx)}
        // A35 da 12ª: quem recebe e não estorna lê, no pagamento confirmado, a quem pedir.
        quemEstorna={podeReceber(ctx) && !can(ctx, 'financial', 'MANAGE') ? await quemDesfazNoCaixa(ctx.tenantId!, branchId) : null}
        // A11 da 19ª: o avulso concluído aguardando o PDV diz quem recebe, a quem não recebe.
        // A8 da 20ª: também na janela do "Finalizar" (em atendimento), e se só a rede recebe.
        quemRecebe={!podeReceber(ctx) && ['IN_PROGRESS', 'COMPLETED'].includes(apptRaw.status as string) && !pago ? await quemRecebeNaUnidade(ctx.tenantId!, branchId) : null}
        // A9 da 20ª: quem não inicia nem conclui (sem o Atendimento em Gerenciar) lê quem faz, pelo nome.
        quemConclui={!canManage && ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS'].includes(apptRaw.status as string)
          ? await quemConcluiOAtendimento(ctx.tenantId!, branchId) : null}
        // A17 da 31ª: quem lê o clínico e não o escreve lê, na ficha de saúde em branco, quem a responde.
        quemRespondeAFicha={canViewRecords && !canEditRecords && ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS'].includes(apptRaw.status as string)
          ? await quemRespondeAFichaDeSaude(ctx.tenantId!, branchId) : null}
        // AT-03/AT-05: quem conclui sem VER o clínico sabe, antes do "Confirmar
        // conclusão", o que falta (só o nome das perguntas) e quem responde.
        faltaSemVerOClinico={!canViewRecords && canManage && ['ARRIVED', 'IN_PROGRESS'].includes(apptRaw.status as string)
          ? await (async () => {
              const falta = await oQueFaltaSemOClinico(admin, {
                tenantId: ctx.tenantId!, appointmentId: appointment.id, procedureId, clientId: cli.id,
                semInjetaveis: !temRecurso(ctx, 'injetaveis'),
              })
              const quem = falta.saude.length || falta.ficha.length ? await quemRespondeAFichaDeSaude(ctx.tenantId!, branchId) : []
              return { ...falta, quem }
            })() : null}
        // A10 da 19ª: sem o check-in no cargo, o agendado diz QUEM marca a chegada.
        quemMarcaAChegada={!canCheckin && apptRaw.status === 'SCHEDULED' ? await quemMarcaAChegada(ctx.tenantId!, branchId) : null}
        // A19 da 14ª: quem estorna (o Financeiro em Gerenciar, de todos — a régua da ficha) estorna daqui, pela mesma janela.
        podeEstornar={podeEstornar(ctx)}
        planoEmAberto={planoEmAberto}
        // Quem está no atendimento vê e colhe os documentos dele (o Heitor,
        // 2026-11-16: colher não pede o módulo Documentos, que é o dos
        // MODELOS) — com os Documentos no plano da rede.
        documentos={colheOsDocumentos(ctx)
          ? { itens: await documentosDoAgendamento(ctx.tenantId!, appointment.id),
              podeDispensar: dispensaDocumentos(ctx),
            pelaConversa: await envioPelaConversaLigado(ctx.tenantId!),
            // "Pedir no portal" só para quem tem o app (A26 da 7ª simulação) —
            // e com o portal no plano da clínica (C57a, F69).
            temAcessoAoApp: temRecurso(ctx, 'portal') && !!(cli as { auth_id?: string | null } | null)?.auth_id }
          : null}
      />
      </FusoProvider>
    </>
  )
}

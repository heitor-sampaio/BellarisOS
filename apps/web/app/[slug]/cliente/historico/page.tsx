import { situacaoDoVencimento } from '@/lib/financeiro/vencimentos'
import { fusoValido } from '@/lib/unidades/fuso'
import { getTenantContext, assertClient } from '@/lib/auth'
import { getAtendimentosAReceber } from '@/lib/metrics/a-receber'
import { createAdminClient } from '@/lib/supabase/admin'
import { assinadosDoCliente } from '@/lib/documentos/leitura'
import { ler, contar } from '@/lib/db'
import { formaDoLancamento } from '@/lib/financeiro/formas'
import { CLIENT_DOCS_BUCKET, getSignedUrls } from '@/lib/storage'
import { HistoricoTabs } from '@/components/client-portal/historico-tabs'
import { notasDaAvaliacao, type NotaNaTela } from '@/lib/avaliacao/notas'
import { notasDosProcedimentos } from '@/lib/avaliacao/leitura'
import { ordemDosPagamentosDoApp } from '@/lib/clientes/ordem-dos-pagamentos'

// -- Types ----------------------------------------------------------
export type ProcedimentoItem = {
  id:                  string
  scheduled_at:        string
  procedure_name:      string
  professional_name:   string | null
  confirmed:           boolean
  /** F17-3: as notas que ela deu — "Atendimento" e cada procedimento pelo nome. */
  notas:               NotaNaTela[]
  /** O comentário que ela deixou ao avaliar (J-26: não voltava ao histórico). */
  feedback:            string | null
  /** A unidade do atendimento, quando a clínica tem mais de uma (A53 da 8ª). */
  unidade?:            string | null
}

/**
 * O que veio do sistema de ANTES (A42 da 10ª simulação): as sessões feitas nos
 * pacotes trazidos de fora e a última visita da planilha. Não vira atendimento
 * — sem data, profissional nem nota que não existiram (a migração, crm-inbox.md).
 */
export type DeAntesDoSistema = {
  sessoes:      { procedimento: string; quantas: number }[]
  /** AAAA-MM-DD (o dia gravado). */
  ultimaVisita: string | null
}

export type PagamentoItem = {
  id:             string
  description:    string
  amount:         number
  payment_method: string | null
  cartao_vezes:   number | null
  is_paid:        boolean
  paid_at:        string | null
  procedure_name: string | null
  /** O vencimento da parcela/conta a receber (A64), AAAA-MM-DD. */
  vencimento?:    string | null
  /** D13 da 9ª: em aberto com o vencimento antes de hoje. */
  vencida?:       boolean
  /** "Parcela 2 de 3" (A64). */
  parcela?:       string | null
  /** A forma pronta (`formaDoLancamento`): a parcela do crediário sem meio é "Com a clínica" (D6). */
  forma?:         string | null
  /** A46: o estorno devolvido à cliente (a contra-transação): dinheiro que SAIU, com o sinal. */
  estorno?:       boolean
  /** A46: o pagamento de um pacote cancelado — o dia do cancelamento. */
  pacoteCancelado?: string | null
  /** O atendimento avulso concluído e não pago (A64): não é um lançamento, é `atendimentos_a_receber`. */
  aPagarNaClinica?: boolean
  /** Estornado: o dinheiro voltou — não é "Pago" nem tem recibo (como o Financeiro do app). */
  estornado?:     boolean
  /** O dia de referência (o do pagamento; o vencimento no em aberto): a ordem da lista (D17). */
  referencia?:    string
}

export type DocumentoItem = {
  id:         string
  name:       string
  category:   string
  file_url:   string
  created_at: string
} | {
  id:         string
  title:      string
  signed_at:  string
  signed_via: string | null
  kind:       'consent'
}

// -- Linhas como os selects as pedem ------------------------------
type AtendimentoLido = {
  id: string; scheduled_at: string; client_confirmed_at: string | null
  procedure_rating: number | null; client_rating: number | null; client_feedback: string | null
  procedures: { name: string } | null; professionals: { name: string } | null
  branches?: { name: string; tenant_id: string } | null
}
type PagamentoLido = {
  id: string; description: string; amount: number | string; payment_method: string | null; cartao_vezes: number | null; cartao_bandeira: string | null
  is_paid: boolean; paid_at: string | null; notes: string | null; created_at: string
  due_date: string | null; data_de_referencia: string | null; parcela_numero: number | null; parcela_total: number | null
  type: string; category: string | null
  client_packages: { cancelado_em: string | null } | null
  appointments: { procedures: { name: string } | null } | null
}
type DocumentoLido = { id: string; name: string; category: string; file_path: string; created_at: string }
const CANAL_NO_PORTAL: Record<string, string> = { CLINICA: 'na clínica', PAPEL: 'no papel', PORTAL: 'pelo portal', LINK: 'por link' }

export default async function HistoricoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await getTenantContext()
  assertClient(ctx)

  const admin = createAdminClient()
  // O "hoje" do vencimento é o da unidade do endereço (F64, C4).
  const fuso = fusoValido((await ler(admin.from('branches').select('fuso').eq('slug', slug).maybeSingle(),
    'buscar o fuso da unidade') as { fuso: string | null } | null)?.fuso)

  const [procedimentosRes, pagamentosRes, docsRes, consentRes] = await Promise.all([
    // Procedimentos = appointments concluídos
    ler(admin.from('appointments')
      .select('id, scheduled_at, client_confirmed_at, procedure_rating, client_rating, client_feedback, procedures(name), professionals:users!professional_id(name), branches(name, tenant_id)')
      .eq('client_id', ctx.clientId!)
      .eq('status', 'COMPLETED')
      .order('scheduled_at', { ascending: false })
      .limit(50), 'carregar os atendimentos'),

    // Pagamentos = transações financeiras ligadas ao cliente
    ler(admin.from('financial_transactions')
      .select(`
        id, description, amount, payment_method, cartao_vezes, cartao_bandeira, is_paid, paid_at, notes, created_at,
        due_date, data_de_referencia, parcela_numero, parcela_total, type, category,
        client_packages(cancelado_em),
        appointments(procedures(name))
      `)
      // Pela ficha, não pelo agendamento: o pagamento de um plano não tem
      // agendamento, e ficava fora da lista do próprio cliente.
      .eq('client_id', ctx.clientId!)
      // A46: o estorno devolvido a ela também (era só a receita).
      .or('type.eq.INCOME,category.eq.Estorno')
      .order('created_at', { ascending: false })
      .limit(50), 'carregar os pagamentos'),

    // Documentos = só os arquivos que a clínica ENVIOU à cliente (decisão do
    // Heitor, 2026-10-30). A foto clínica, o exame e o laudo anexados ficam
    // com a equipe até alguém enviar pela ficha (`enviado_em`). A data é a
    // do envio.
    ler(admin.from('client_documents')
      .select('id, name, category, file_path, created_at:enviado_em')
      .eq('client_id', ctx.clientId!)
      .is('apagado_em', null)
      .not('enviado_em', 'is', null)
      .order('enviado_em', { ascending: false })
      .limit(30), 'carregar os documentos'),

    // Termos e contratos assinados (os de agora e o legado do checkout antigo).
    assinadosDoCliente(null, ctx.clientId!),
  ])

  // -- Procedimentos ----------------------------------------------
  const lidos = (procedimentosRes ?? []) as unknown as AtendimentoLido[]
  // F17-3: as notas que ela deu a cada procedimento.
  const notasDasAvaliacoes = await notasDosProcedimentos(admin, lidos.filter(r => r.client_confirmed_at).map(r => r.id))
  // A53 da 8ª: com mais de uma unidade, cada atendimento diz onde foi.
  const redeDosAtendimentos = lidos.find(r => r.branches?.tenant_id)?.branches?.tenant_id ?? null
  const variasUnidades = redeDosAtendimentos
    ? await contar(admin.from('branches').select('id', { count: 'exact', head: true }).eq('tenant_id', redeDosAtendimentos).eq('is_active', true), 'contar as unidades') > 1
    : false
  const procedimentos: ProcedimentoItem[] = lidos.map(r => ({
    id:                  r.id,
    scheduled_at:        r.scheduled_at,
    procedure_name:      r.procedures?.name ?? 'Procedimento',
    professional_name:   r.professionals?.name ?? null,
    confirmed:           r.client_confirmed_at != null,
    notas:               notasDaAvaliacao({ client_rating: r.client_rating, procedure_rating: r.procedure_rating, procedureName: r.procedures?.name ?? 'Procedimento' },
      notasDasAvaliacoes.get(r.id) ?? []),
    feedback:            r.client_feedback?.trim() || null,
    unidade:             variasUnidades ? r.branches?.name ?? null : null,
  }))

  // -- Pagamentos -------------------------------------------------
  const pagamentos: PagamentoItem[] = ((pagamentosRes ?? []) as unknown as PagamentoLido[]).map(r => ({
    id:             r.id,
    description:    r.description,
    amount:         Number(r.amount),
    payment_method: r.payment_method,
    cartao_vezes:   r.cartao_vezes,
    is_paid:        Boolean(r.is_paid),
    paid_at:        r.paid_at,
    procedure_name: r.appointments?.procedures?.name ?? null,
    estornado:      r.notes === 'Estornada',
    // A64: o vencimento e a parcela — "Pendente" sozinho não dizia quando.
    vencimento:     r.is_paid ? null : (r.due_date ?? r.data_de_referencia ?? null),
    // D13 da 9ª: "Vencida em 05/11" (o dia decidido aqui, no servidor).
    vencida:        !r.is_paid && r.notes !== 'Estornada' && situacaoDoVencimento(r.due_date, new Date(), fuso) === 'VENCIDA',
    parcela:        r.parcela_numero && r.parcela_total && r.parcela_total > 1 ? `Parcela ${r.parcela_numero} de ${r.parcela_total}` : null,
    forma:          formaDoLancamento({ metodo: r.payment_method, vezes: r.cartao_vezes, bandeira: r.cartao_bandeira, pago: Boolean(r.is_paid), parcela: r.parcela_numero }),
    estorno:        r.type === 'EXPENSE' && r.category === 'Estorno',
    pacoteCancelado: r.client_packages?.cancelado_em ?? null,
    // D17 da 8ª: a mesma ordem do Financeiro do app (era a da criação: 2/2 antes da 1/2).
    referencia:     r.data_de_referencia ?? r.paid_at ?? r.created_at,
  })).sort(ordemDosPagamentosDoApp)
  // A64: o atendimento avulso concluído e não pago (a conta de
  // `atendimentos_a_receber`, a mesma do Fechamento e da ficha) — não tinha
  // lançamento, e não aparecia para a cliente.
  const ficha = await ler(admin.from('clients').select('tenant_id, ultima_visita_antes').eq('id', ctx.clientId!).maybeSingle(), 'buscar a ficha') as { tenant_id: string; ultima_visita_antes: string | null } | null
  const aReceber = ficha ? await getAtendimentosAReceber({ tenantId: ficha.tenant_id, clienteId: ctx.clientId! }) : null
  pagamentos.unshift(...(aReceber?.itens ?? []).map(a => ({
    id:             `a-receber-${a.appointmentId}`,
    description:    a.procedureName ?? 'Atendimento',
    amount:         a.price,
    payment_method: null,
    cartao_vezes:   null,
    is_paid:        false,
    paid_at:        null,
    procedure_name: a.procedureName,
    aPagarNaClinica: true,
  })))

  // -- De antes do sistema (A42 da 10ª) ----------------------------
  // A Ana Clara, importada com 5 de 8 sessões feitas, via no Histórico só os
  // 2 atendimentos do sistema: as de antes moravam só no cartão da home.
  const pacotesDeFora = (await ler(admin.from('client_packages')
    .select('usadas_antes, service_packages(procedures(name))')
    .eq('client_id', ctx.clientId!).eq('de_fora', true).gt('usadas_antes', 0), 'carregar os pacotes de antes') ?? []) as unknown as
    { usadas_antes: number; service_packages: { procedures: { name: string } | null } | null }[]
  const deAntes: DeAntesDoSistema = {
    sessoes: pacotesDeFora.map(pc => ({ procedimento: pc.service_packages?.procedures?.name ?? 'Pacote de antes', quantas: Number(pc.usadas_antes) })),
    ultimaVisita: ficha?.ultima_visita_antes ? String(ficha.ultima_visita_antes).slice(0, 10) : null,
  }

  // -- Documentos -------------------------------------------------
  const rawDocs = (docsRes ?? []) as unknown as DocumentoLido[]
  const docUrlMap = await getSignedUrls(CLIENT_DOCS_BUCKET, rawDocs.map(r => r.file_path))
  const clientDocs = rawDocs.map(r => ({
    id:         r.id,
    name:       r.name,
    category:   r.category,
    file_url:   docUrlMap[r.file_path] ?? '',
    created_at: r.created_at,
  }))

  const consentDocs = consentRes.slice(0, 20).map(r => ({
    id:         r.id,
    title:      r.titulo,
    signed_at:  r.assinadoEm,
    signed_via: r.canal ? CANAL_NO_PORTAL[r.canal] ?? null : null,
    kind:       'consent' as const,
  }))

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-name)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 20 }}>
        Histórico
      </h1>
      <HistoricoTabs
        slug={slug}
        procedimentos={procedimentos}
        deAntes={deAntes}
        pagamentos={pagamentos}
        documentos={clientDocs}
        consentimentos={consentDocs}
      />
    </div>
  )
}

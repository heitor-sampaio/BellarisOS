import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { banco, tenantId, PREFIXO } from './apoio/banco'
import { membroComEscopoProprio, type MembroDeTeste } from './apoio/sessao'

/**
 * A RLS separa uma rede da outra — provado COMO um funcionário, não como o
 * cliente de serviço.
 *
 * Até 2026-09-27 nenhum teste falava com o banco com a sessão de um usuário:
 * todos usavam `service_role`, que passa por cima da RLS. E a RLS do prontuário
 * só conferia `role <> 'CLIENT'` — qualquer funcionário de QUALQUER rede lia e
 * escrevia o prontuário de todas, direto no PostgREST com a anon key (que está
 * no bundle do navegador). Com uma rede só no banco não havia vítima; seria
 * vazamento no dia da segunda clínica.
 *
 * O cenário: uma SEGUNDA rede `[e2e]`, com cliente, prontuário, atendimento,
 * ficha, foto, termo e conta de fidelidade. Um membro da rede REAL tenta ler,
 * alterar e apagar tudo isso com o próprio token.
 *
 * O controle é o mesmo membro lendo um prontuário `[e2e]` da PRÓPRIA rede: sem
 * ele, "não enxergou a outra" poderia ser só uma sessão que não enxerga nada.
 */

const marca = Date.now().toString(36)
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** O PostgREST com a sessão do membro — o que o navegador dele pode fazer. */
function comoMembro(membro: MembroDeTeste): SupabaseClient {
  return createClient(URL_, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${membro.accessToken}` } },
  })
}

/** Tudo que o prontuário de UM cliente precisa, numa rede. */
interface Prontuario {
  clientId: string; recordId: string; entryId: string; appointmentId: string
  photoId: string; anamnesisId: string; consentId: string; loyaltyId: string; pointsId: string
}

async function criarProntuario(
  db: SupabaseClient, tenant: string,
  onde: { branchId: string; professionalId: string; procedureId: string },
  rotulo: string,
): Promise<Prontuario> {
  const passo = async <T>(o_que: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>) => {
    const { data, error } = await q
    expect(error, `${rotulo}: ${o_que}`).toBeNull()
    return data as T
  }
  const cliente = await passo<{ id: string }>('cliente', db.from('clients')
    .insert({ tenant_id: tenant, branch_id: onde.branchId, name: `${PREFIXO} RLS ${rotulo} ${marca}`, phone: '5548' + String(Date.now()).slice(-9) })
    .select('id').single())
  const ag = await passo<{ id: string }>('agendamento', db.from('appointments')
    .insert({
      branch_id: onde.branchId, client_id: cliente.id, professional_id: onde.professionalId,
      procedure_id: onde.procedureId, scheduled_at: new Date(Date.now() - 86_400_000).toISOString(),
      duration_min: 30, price: 0, status: 'COMPLETED', source: 'INTERNAL',
    })
    .select('id').single())
  // Um por cliente (`unique client_id`), e pode ter nascido junto com o cliente.
  const rec = await passo<{ id: string }>('prontuário', db.from('medical_records')
    .upsert({ client_id: cliente.id }, { onConflict: 'client_id' }).select('id').single())
  const ent = await passo<{ id: string }>('entrada', db.from('medical_record_entries')
    .insert({ medical_record_id: rec.id, appointment_id: ag.id, professional_id: onde.professionalId })
    .select('id').single())
  const foto = await passo<{ id: string }>('foto', db.from('record_photos')
    .insert({ entry_id: ent.id, url: 'e2e/rls.jpg', type: 'before' }).select('id').single())
  const ana = await passo<{ id: string }>('ficha', db.from('anamnesis_data')
    .insert({ entry_id: ent.id, form_data: { e2e: true } }).select('id').single())
  const termo = await passo<{ id: string }>('termo', db.from('consent_terms')
    .insert({ medical_record_id: rec.id, title: `${PREFIXO} termo`, content: 'e2e' }).select('id').single())
  const fid = await passo<{ id: string }>('fidelidade', db.from('loyalty_accounts')
    .upsert({ client_id: cliente.id }, { onConflict: 'client_id' }).select('id').single())
  const pontos = await passo<{ id: string }>('pontos', db.from('loyalty_transactions')
    .insert({ loyalty_account_id: fid.id, branch_id: onde.branchId, kind: 'AJUSTE', points: 10, description: `${PREFIXO} e2e` }).select('id').single())
  return {
    clientId: cliente.id, recordId: rec.id, entryId: ent.id, appointmentId: ag.id,
    photoId: foto.id, anamnesisId: ana.id, consentId: termo.id, loyaltyId: fid.id, pointsId: pontos.id,
  }
}

async function apagarProntuario(db: SupabaseClient, p: Prontuario | null) {
  if (!p) return
  await db.from('record_photos').delete().eq('id', p.photoId)
  await db.from('anamnesis_data').delete().eq('id', p.anamnesisId)
  await db.from('consent_terms').delete().eq('id', p.consentId)
  await db.from('medical_record_entries').delete().eq('id', p.entryId)
  await db.from('medical_records').delete().eq('id', p.recordId)
  await db.from('loyalty_transactions').delete().eq('loyalty_account_id', p.loyaltyId)
  await db.from('loyalty_accounts').delete().eq('id', p.loyaltyId)
  await db.from('domain_events').delete().eq('entidade_id', p.appointmentId)
  await db.from('appointments').delete().eq('id', p.appointmentId)
  await db.from('clients').delete().eq('id', p.clientId)
}

/**
 * As sete tabelas, o id da linha e uma alteração VÁLIDA em cada uma — coluna que
 * existe, valor do tipo certo. Se a alteração fosse inválida, o erro deixaria o
 * resultado vazio e o teste passaria sem provar nada; por isso o teste também
 * exige `error` nulo na tentativa.
 */
function alvos(p: Prontuario): [string, string, Record<string, unknown>][] {
  return [
    ['medical_records',        p.recordId,    { general_anamnesis: { invadido: true } }],
    ['medical_record_entries', p.entryId,     { notes: 'invadido' }],
    ['record_photos',          p.photoId,     { source: 'invadido' }],
    ['anamnesis_data',         p.anamnesisId, { form_data: { invadido: true } }],
    ['consent_terms',          p.consentId,   { signed_via: 'invadido' }],
    ['loyalty_accounts',       p.loyaltyId,   { balance: 999_999 }],
    ['loyalty_transactions',   p.pointsId,    { points: 999_999 }],
  ]
}

test.describe.serial('RLS: uma rede não enxerga a outra', () => {
  let membro: MembroDeTeste | null = null
  let outraRede: { tenantId: string; branchId: string; procedureId: string; professionalId: string; authId: string } | null = null
  let alheio: Prontuario | null = null
  let proprio: Prontuario | null = null

  test.beforeAll(async () => {
    const db = banco()
    const minha = await tenantId()
    membro = await membroComEscopoProprio(`rls${marca}`)

    // -- A segunda rede, inteira, só para ser alvo --
    const { data: t, error: eT } = await db.from('tenants')
      .insert({ name: `${PREFIXO} Outra rede ${marca}`, slug: `e2e-outra-${marca}`, email: `e2e-outra-${marca}@bellaris.invalid` })
      .select('id').single<{ id: string }>()
    expect(eT, 'criar a outra rede').toBeNull()
    const { data: b } = await db.from('branches')
      .insert({ tenant_id: t!.id, name: `${PREFIXO} Unidade ${marca}`, slug: `e2e-un-${marca}` })
      .select('id').single<{ id: string }>()
    const { data: pr } = await db.from('procedures')
      .insert({ tenant_id: t!.id, name: `${PREFIXO} Proc ${marca}`, category: 'e2e', duration_min: 30, price: 0 })
      .select('id').single<{ id: string }>()
    const { data: auth } = await db.auth.admin.createUser({ email: `e2e-prof-${marca}@bellaris.invalid`, email_confirm: true })
    const { data: prof, error: eP } = await db.from('users')
      .insert({ tenant_id: t!.id, auth_id: auth.user!.id, name: `${PREFIXO} Prof ${marca}`, email: `e2e-prof-${marca}@bellaris.invalid` })
      .select('id').single<{ id: string }>()
    expect(eP, 'criar o profissional da outra rede').toBeNull()
    outraRede = { tenantId: t!.id, branchId: b!.id, procedureId: pr!.id, professionalId: prof!.id, authId: auth.user!.id }
    alheio = await criarProntuario(db, t!.id, outraRede, 'alheio')

    // -- O controle, na rede do membro, com o que já existe nela --
    const { data: br } = await db.from('branches').select('id').eq('tenant_id', minha).eq('is_active', true).limit(1).single<{ id: string }>()
    const { data: pc } = await db.from('procedures').select('id').eq('tenant_id', minha).limit(1).single<{ id: string }>()
    const { data: us } = await db.from('users').select('id').eq('tenant_id', minha).eq('is_active', true).limit(1).single<{ id: string }>()
    proprio = await criarProntuario(db, minha, { branchId: br!.id, procedureId: pc!.id, professionalId: us!.id }, 'proprio')
  })

  test.afterAll(async () => {
    const db = banco()
    await apagarProntuario(db, alheio)
    await apagarProntuario(db, proprio)
    if (outraRede) {
      await db.from('users').delete().eq('id', outraRede.professionalId)
      await db.auth.admin.deleteUser(outraRede.authId)
      await db.from('procedures').delete().eq('id', outraRede.procedureId)
      await db.from('branches').delete().eq('id', outraRede.branchId)
      await db.from('role_permissions').delete().eq('tenant_id', outraRede.tenantId)
      await db.from('tenant_roles').delete().eq('tenant_id', outraRede.tenantId)
      await db.from('domain_events').delete().eq('tenant_id', outraRede.tenantId)
      await db.from('tenants').delete().eq('id', outraRede.tenantId)
    }
    if (membro) await membro.limpar()
  })

  test('o controle: o membro lê o prontuário da PRÓPRIA rede', async () => {
    const api = comoMembro(membro!)
    for (const [tabela, id] of alvos(proprio!)) {
      const { data, error } = await api.from(tabela).select('id').eq('id', id)
      expect(error, `ler ${tabela} da própria rede`).toBeNull()
      expect(data?.length, `${tabela}: a própria rede tem de aparecer — senão a sessão não prova nada`).toBe(1)
    }
  })

  test('o prontuário de outra rede não aparece, não muda e não some', async () => {
    const api = comoMembro(membro!)
    for (const [tabela, id, mudanca] of alvos(alheio!)) {
      const { data: lido, error: eLer } = await api.from(tabela).select('id').eq('id', id)
      expect(eLer, `${tabela}: a leitura em si tem de ser válida`).toBeNull()
      expect(lido ?? [], `${tabela}: outra rede não pode aparecer`).toHaveLength(0)

      const { data: mudou, error: eMudar } = await api.from(tabela).update(mudanca).eq('id', id).select('id')
      expect(eMudar, `${tabela}: a alteração em si tem de ser válida`).toBeNull()
      expect(mudou ?? [], `${tabela}: outra rede não pode ser alterada`).toHaveLength(0)

      const { data: sumiu } = await api.from(tabela).delete().eq('id', id).select('id')
      expect(sumiu ?? [], `${tabela}: outra rede não pode ser apagada`).toHaveLength(0)
    }
    // E, pelo cliente de serviço, tudo continua lá — e sem a alteração.
    const db = banco()
    for (const [tabela, id, mudanca] of alvos(alheio!)) {
      const { data } = await db.from(tabela).select('*').eq('id', id)
      expect(data?.length, `${tabela}: a linha da outra rede tem de continuar existindo`).toBe(1)
      const [coluna, valor] = Object.entries(mudanca)[0]!
      expect(data![0]![coluna], `${tabela}.${coluna} não pode ter mudado`).not.toEqual(valor)
    }
  })

  test('não dá para PLANTAR prontuário num cliente de outra rede', async () => {
    const api = comoMembro(membro!)
    const { data, error } = await api.from('consent_terms')
      .insert({ medical_record_id: alheio!.recordId, title: `${PREFIXO} plantado`, content: 'x' })
      .select('id')
    if (data?.length) await banco().from('consent_terms').delete().in('id', data.map(d => d.id as string))
    expect(error, 'a RLS tem de recusar o insert no prontuário alheio').not.toBeNull()
  })

  test('RPCs de leitura por rede não atendem quem não entrou', async () => {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } })
    const rede = await tenantId()
    for (const [fn, args] of [
      ['lead_tags_da_rede', { p_tenant: rede }],
      ['eventos_resumo_do_catalogo', { p_tenant_id: rede }],
      ['mark_notification_read', { p_notification_id: '00000000-0000-0000-0000-000000000000' }],
    ] as const) {
      const { error } = await anon.rpc(fn, args)
      expect(error, `${fn} não pode atender a anon key`).not.toBeNull()
      // E nem um funcionário logado: quem as chama é o servidor, pelo cliente de serviço.
      const { error: erroMembro } = await comoMembro(membro!).rpc(fn, args)
      expect(erroMembro, `${fn} não pode atender a sessão de um membro`).not.toBeNull()
    }
  })
})

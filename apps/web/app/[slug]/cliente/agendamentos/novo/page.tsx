import { notFound } from 'next/navigation'
import { COLUNAS_DA_OFERTA, ofereceNaUnidade } from '@/lib/procedimentos/disponivel-na-unidade'
import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCachedBranchProfessionals } from '@/lib/cached-queries'
import { NewAppointmentWizard } from '@/components/client-portal/new-appointment-wizard'
import { ler } from '@/lib/db'
import { normalizarHorario, resumoDoHorario } from '@/lib/agenda/horario'
import { aClinicaDoEndereco } from '@/lib/clientes/a-clinica'
import { quemRealizaOsProcedimentos } from '@/lib/procedimentos/quem-realiza'
import { AgendarComAClinica } from '@/components/client-portal/agendar-com-a-clinica'
import { jaPagoNoApp } from '@/lib/creditos/pago-no-app'
import { comPrecoDaUnidade } from '@/lib/procedimentos/preco-na-unidade'

export default async function NewClientAppointmentPage({ params, searchParams }: {
  params: Promise<{ slug: string }>
  /** `?procedimento=`: o cartão do pacote leva ao agendamento do procedimento dele (A63). */
  searchParams: Promise<{ procedimento?: string; unidade?: string }>
}) {
  const { slug } = await params
  const { procedimento, unidade: unidadeDaUrl } = await searchParams
  const ctx = await getTenantContext()
  assertClient(ctx)

  const admin = createAdminClient()

  // A ficha é da CLÍNICA (H5, 2026-11-02: "A cliente é da clínica, pode
  // agendar em qualquer unidade da clínica"): a unidade do agendar é a do
  // ENDEREÇO, entre as ativas da rede da ficha — não mais a de cadastro, que
  // devolvia 404 na Zona Sul e prendia a cliente à Moinhos (A62).
  const clientRecord = await ler(admin
    .from('clients')
    .select('tenant_id, is_active')
    .eq('id', ctx.clientId!)
    .single(), 'buscar o cliente')
  if (!clientRecord) notFound()

  const unidades = ((await ler(admin
    .from('branches')
    .select('id, name, tenant_id, slug, horario')
    .eq('tenant_id', clientRecord.tenant_id as string)
    .eq('is_active', true)
    .order('name'), 'buscar as unidades da clínica')) ?? []) as { id: string; name: string; tenant_id: string; slug: string; horario: unknown }[]

  const branch = unidades.find(u => u.slug === slug)
  if (!branch) notFound()
  // A52 da 8ª: o prazo do app, para o Confirmar avisar antes.
  const rede = await ler(admin.from('tenants').select('portal_prazo_alteracao_horas').eq('id', clientRecord.tenant_id as string).single(),
    'ler o prazo do portal') as { portal_prazo_alteracao_horas: number | null } | null

  // A arquivada não agenda pelo app (o Heitor: "concordo"): fala com a clínica.
  if (clientRecord.is_active === false) {
    return <AgendarComAClinica slug={slug} clinica={await aClinicaDoEndereco(slug)} />
  }

  const branchTyped = branch as { id: string; name: string; tenant_id: string }

  const [rawProcedures, rawProfessionals] = await Promise.all([
    ler(admin
      .from('procedures')
      .select(`id, name, price, duration_min, ${COLUNAS_DA_OFERTA}`)
      .eq('tenant_id', branchTyped.tenant_id)
      .or(`branch_id.is.null,branch_id.eq.${branchTyped.id}`)
      .eq('is_active', true)
      .eq('visible_on_client_app', true)
      .order('name'), 'listar os procedimentos'),
    // Filtrava por `users.role`, coluna removida na migração de cargos: a lista
    // vinha vazia e o cliente não tinha profissional para escolher.
    getCachedBranchProfessionals(branchTyped.id, branchTyped.tenant_id as string),
  ])

  // Quem realiza cada um (por-01): o passo "Profissional" oferece só elas.
  // O preço DA UNIDADE do endereço, quando ela tem um (D2 da 9ª).
  // Só o que a unidade OFERECE (D7 da 13ª, F65).
  const lidos = await comPrecoDaUnidade(admin, branchTyped.id,
    ((rawProcedures ?? []) as { id: string; name: string; price: number; duration_min: number; branch_id: string | null; procedure_branch_availability: { branch_id: string }[] | null }[])
      .filter(p => ofereceNaUnidade(p, branchTyped.id))
      .map(({ id, name, price, duration_min }) => ({ id, name, price, duration_min })))
  const [realizam, jaPago] = await Promise.all([
    quemRealizaOsProcedimentos(admin, lidos.map(p => p.id)),
    // O que ela já pagou de cada um (D10 da 8ª): o Confirmar diz "Já pago pelo pacote X (sessão 2 de 3)".
    jaPagoNoApp(admin, branchTyped.tenant_id, ctx.clientId!, lidos.map(p => p.id)),
  ])
  const procedures = lidos.map(p => ({ ...p, realizam: realizam.get(p.id) ?? [], jaPago: jaPago[p.id] ?? null }))
  const equipe        = (rawProfessionals ?? []) as { id: string; name: string }[]

  // Quando cada uma atende (J-60): a unidade ∩ ela, em texto — a cliente vê
  // que a profissional só atende à noite antes de procurar de manhã.
  const horarios = equipe.length
    ? ((await ler(admin.from('users').select('id, horario').in('id', equipe.map(p => p.id)), 'buscar o horário das profissionais')) ?? []) as { id: string; horario: unknown }[]
    : []
  const daUnidade = normalizarHorario((branch as { horario?: unknown }).horario)
  const professionals = equipe.map(p => ({
    ...p,
    horario: resumoDoHorario(daUnidade, normalizarHorario(horarios.find(h => h.id === p.id)?.horario)),
  }))

  return (
    <NewAppointmentWizard
      slug={slug}
      branchId={branchTyped.id}
      unidade={branchTyped.name}
      // Mais de uma unidade: a cliente escolhe onde (A62).
      unidades={unidades.length > 1 ? unidades.map(u => ({ slug: u.slug, nome: u.name })) : []}
      procedures={procedures}
      procedimentoInicial={typeof procedimento === 'string' ? procedimento : null}
      unidadeEscolhida={unidadeDaUrl === 'escolhida'}
      professionals={professionals}
      prazoHoras={rede?.portal_prazo_alteracao_horas ?? 24}
    />
  )
}

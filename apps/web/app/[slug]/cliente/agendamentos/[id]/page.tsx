import Link from 'next/link'
import { unidadesParaCriar } from '@/lib/unidades/da-tela'
import { AvisoUnidadeDesativada } from '@/components/client-portal/unidade-desativada'
import { idOu404 } from '@/lib/id-da-rota'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarDays, Clock3, User, MapPin } from 'lucide-react'
import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { formatarTelefone } from '@/lib/documentos/valores'
import { aClinicaDoEndereco, comMensagem, linkDoWhatsapp } from '@/lib/clientes/a-clinica'
import { AlterarAgendamento } from '@/components/client-portal/alterar-agendamento'
import { FusoProvider } from '@/components/shared/fuso'
import { fusoValido } from '@/lib/unidades/fuso'
import { getCachedBranchProfessionals } from '@/lib/cached-queries'
import { quemRealizaOProcedimento, realiza } from '@/lib/procedimentos/quem-realiza'
import { documentosDoAgendamento, type ResumoDeDocumento } from '@/lib/documentos/leitura'
import { COLUNAS_DA_OFERTA, ofereceNaUnidade } from '@/lib/procedimentos/disponivel-na-unidade'
import { FileSignature } from 'lucide-react'

/**
 * O agendamento aberto no portal (2026-10-21): os cartões da agenda não
 * abriam. Até o prazo da rede, ela cancela ou remarca aqui; depois, o caminho
 * para falar com a clínica. Só a ficha DELA — de outra cliente, 404.
 */
const SITUACAO: Record<string, { texto: string; cor: string }> = {
  ASSINADO:   { texto: 'Assinado', cor: 'var(--success)' },
  PENDENTE:   { texto: 'Falta a sua assinatura', cor: 'var(--brand)' },
  A_GERAR:    { texto: 'Falta a sua assinatura', cor: 'var(--brand)' },
  INCOMPLETO: { texto: 'Em preparação pela clínica', cor: 'var(--text-muted)' },
  DISPENSADO: { texto: 'Dispensado pela clínica', cor: 'var(--text-muted)' },
}

function LinhaDoDocumento({ slug, doc, fuso }: { slug: string; doc: ResumoDeDocumento; fuso: string }) {
  const s = SITUACAO[doc.status] ?? { texto: 'Cancelado', cor: 'var(--text-muted)' }
  const assinar = doc.status === 'PENDENTE' || doc.status === 'A_GERAR'
  const texto = doc.status === 'ASSINADO' && doc.assinadoEm
    ? `Assinado em ${new Date(doc.assinadoEm).toLocaleDateString('pt-BR', { timeZone: fuso })}`
    : s.texto
  return (
    <div data-documento={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
      <FileSignature size={16} color="var(--brand)" aria-hidden="true" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--text-sm-sz)', overflowWrap: 'anywhere' }}>{doc.titulo}</p>
        <p style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 600, color: s.cor }}>{texto}</p>
      </div>
      {(assinar || doc.status === 'ASSINADO') && (
        <Link href={`/${slug}/cliente/documentos/${doc.id}`} className={assinar ? 'btn-primary' : 'btn-ghost'} style={{ flexShrink: 0 }}>
          {assinar ? 'Assinar' : 'Ver'}
        </Link>
      )}
    </div>
  )
}

export default async function AgendamentoDaClientePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params
  // O id vai a uma coluna uuid: o que não é uuid é 404, não 22P02 (D15).
  idOu404(id)
  const ctx = await getTenantContext()
  assertClient(ctx)
  if (!/^[0-9a-f-]{36}$/i.test(id) || !ctx.clientId) notFound()

  const admin = createAdminClient()
  const a = await ler(admin.from('appointments')
    .select('id, status, scheduled_at, duration_min, cancellation_reason, branch_id, procedure_id, professional_id, sem_preferencia, procedures(name), profissional:users!professional_id(name, atende_em), branches!inner(name, phone, tenant_id, fuso, is_active)')
    .eq('id', id).eq('client_id', ctx.clientId).maybeSingle(), 'buscar o agendamento') as {
      id: string; status: string; scheduled_at: string; duration_min: number; cancellation_reason: string | null
      branch_id: string; procedure_id: string | null; professional_id: string | null; sem_preferencia: boolean
      procedures: { name: string } | null; profissional: { name: string; atende_em: string[] | null } | null
      branches: { name: string; phone: string | null; tenant_id: string; fuso: string | null; is_active: boolean }
    } | null
  if (!a) notFound()
  const rede = await ler(admin.from('tenants').select('portal_prazo_alteracao_horas, phone').eq('id', a.branches.tenant_id).single(),
    'ler o prazo do portal') as { portal_prazo_alteracao_horas: number; phone: string | null } | null
  const prazoHoras = rede?.portal_prazo_alteracao_horas ?? 24
  // Os termos e contratos DESTE atendimento, com a situação (J-63). Só o
  // título e a situação: o que falta no cadastro e o motivo da dispensa são
  // da equipe.
  const documentos = await documentosDoAgendamento(a.branches.tenant_id, a.id)

  const aberto = ['SCHEDULED', 'CONFIRMED'].includes(a.status)
  // "Sem preferência" no remarcar (A59): com mais de uma que atende na unidade
  // e REALIZA o procedimento (por-01).
  const ofereceSemPreferencia = aberto && await (async () => {
    const [equipe, realizam] = await Promise.all([
      getCachedBranchProfessionals(a.branch_id, a.branches.tenant_id),
      a.procedure_id ? quemRealizaOProcedimento(admin, a.procedure_id) : Promise.resolve([] as string[]),
    ])
    return (equipe as { id: string }[]).filter(p => realiza(realizam, p.id)).length > 1
  })()
  // A15 (F65): com mais de uma unidade que FAZ o procedimento, o remarcar
  // pergunta "Em qual unidade?" (H5: a cliente é da clínica). Em cada uma, se a
  // mesma profissional atende lá.
  const unidadesDoRemarcar = aberto ? await (async () => {
    const [unidades, proc] = await Promise.all([
      // O horário novo só nasce numa unidade ATIVA (lib/unidades/da-tela).
      unidadesParaCriar<{ fuso: string | null }>(a.branches.tenant_id, 'fuso'),
      a.procedure_id
        ? ler(admin.from('procedures').select(COLUNAS_DA_OFERTA).eq('id', a.procedure_id).maybeSingle(), 'conferir onde o procedimento é feito') as
          Promise<{ branch_id: string | null; procedure_branch_availability: { branch_id: string }[] | null } | null>
        : Promise.resolve(null),
    ])
    const atendeEm = a.profissional?.atende_em ?? []
    return (unidades ?? [])
      .filter(u => u.id === a.branch_id || !proc || ofereceNaUnidade(proc, u.id))
      .map(u => ({ id: u.id, nome: u.name, fuso: fusoValido(u.fuso), comAMesma: !!a.professional_id && atendeEm.includes(u.id) }))
  })() : []
  const telefone = (a.branches.phone || rede?.phone || '').replace(/\D/g, '')
  const quando = new Date(a.scheduled_at)
  // O relógio da unidade do agendamento (F62).
  const fuso = fusoValido(a.branches.fuso)
  // O WhatsApp é o conectado da unidade (por-03), com a mensagem pronta sobre
  // ESTE agendamento (A66).
  const aClinica = await aClinicaDoEndereco(slug)
  // Fora do prazo do app (A53 da 7ª), a mensagem já diz o que ela quer.
  const quandoTexto = quando.toLocaleString('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const whatsappParaAlterar = comMensagem(aClinica?.whatsapp ?? linkDoWhatsapp(telefone),
    `Olá! Preciso cancelar ou remarcar o meu agendamento de ${a.procedures?.name ?? 'procedimento'} em ${quandoTexto} (o prazo do app já passou).`)
  const whatsapp = comMensagem(aClinica?.whatsapp ?? linkDoWhatsapp(telefone),
    `Olá! Quero falar sobre o meu agendamento de ${a.procedures?.name ?? 'procedimento'} em ${quando.toLocaleString('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`)

  const linha = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-base-sz)', color: 'var(--text-soft)' } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link href={`/${slug}/cliente/agendamentos`} className="btn-ghost" style={{ alignSelf: 'flex-start', padding: '4px 0', color: 'var(--text-muted)', display: 'inline-flex', gap: 6 }}>
        <ArrowLeft size={15} aria-hidden="true" /> Agenda
      </Link>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h1 style={{ fontSize: 'var(--text-name)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          {a.procedures?.name ?? 'Procedimento'}
        </h1>
        <span style={linha}><CalendarDays size={15} aria-hidden="true" />
          {quando.toLocaleDateString('pt-BR', { timeZone: fuso, weekday: 'long', day: '2-digit', month: 'long' })}
        </span>
        <span style={linha}><Clock3 size={15} aria-hidden="true" />
          {quando.toLocaleTimeString('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' })} · {a.duration_min} min
        </span>
        <span style={linha}><User size={15} aria-hidden="true" /> {a.profissional?.name ?? 'Profissional'}</span>
        <span style={linha}><MapPin size={15} aria-hidden="true" /> {a.branches.name}</span>
        {/* F72: a unidade foi desativada — o remarcar leva às ativas. */}
        {!a.branches.is_active && <AvisoUnidadeDesativada nome={a.branches.name} aberto={aberto} />}
        {a.status === 'CANCELLED' && (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>
            Cancelado{a.cancellation_reason ? ` — ${a.cancellation_reason}` : ''}
          </p>
        )}
      </div>

      {documentos.length > 0 && (
        <section data-documentos-do-agendamento aria-label="Documentos deste atendimento" className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontWeight: 800, color: 'var(--text)', fontSize: 'var(--text-base-sz)' }}>Documentos deste atendimento</p>
          {documentos.map(d => <LinhaDoDocumento key={d.id} slug={slug} doc={d} fuso={fuso} />)}
        </section>
      )}

      {aberto && (
        // A remarcação no relógio da unidade DO agendamento (F62).
        <FusoProvider fuso={fuso}>
        <AlterarAgendamento
          appointmentId={a.id}
          scheduledAt={a.scheduled_at}
          prazoHoras={prazoHoras}
          telefone={formatarTelefone(telefone)}
          profissional={a.profissional?.name ?? null}
          semPreferenciaInicial={a.sem_preferencia}
          ofereceSemPreferencia={ofereceSemPreferencia}
          unidade={a.branch_id}
          unidades={unidadesDoRemarcar.length > 1 || !a.branches.is_active ? unidadesDoRemarcar : []}
          unidadeInicial={a.branches.is_active ? undefined : unidadesDoRemarcar[0]?.id ?? ''}
          whatsapp={whatsapp}
          whatsappParaAlterar={whatsappParaAlterar}
          ligar={telefone ? `tel:+${telefone.startsWith('55') && telefone.length > 11 ? telefone : `55${telefone}`}` : null}
        />
        </FusoProvider>
      )}
    </div>
  )
}

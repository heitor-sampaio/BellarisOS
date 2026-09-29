import Link from 'next/link'
import { ChevronRight, FileSignature, FileText, ScrollText } from 'lucide-react'
import { getTenantContext, assertClient } from '@/lib/auth'
import { documentosNoPortal } from '@/lib/documentos/leitura'
import { formatDate } from '@estetica-os/utils'

/**
 * Portal do cliente → Documentos: os termos e contratos que pedem a assinatura
 * dele e os que ele já assinou (com o PDF).
 *
 * `?agendamento=` chega de quem acabou de agendar pelo portal e tem documento
 * daquele atendimento para assinar: a tela diz isso no topo.
 */
export default async function DocumentosDoClientePage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ agendamento?: string }>
}) {
  const [{ slug }, { agendamento }] = await Promise.all([params, searchParams])
  const ctx = await getTenantContext()
  assertClient(ctx)

  const docs = await documentosNoPortal(ctx.clientId!)
  const paraAssinar = docs.filter(d => d.status === 'PENDENTE' || d.status === 'A_GERAR' || d.status === 'INCOMPLETO')
  const assinados = docs.filter(d => d.status === 'ASSINADO')
  const doAgendamento = agendamento ? paraAssinar.filter(d => d.agendamentoId === agendamento) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.025em' }}>Documentos</h1>

      {doAgendamento.length > 0 && (
        <div className="card-brand" style={{ padding: '14px 18px', borderRadius: 'var(--radius-card-token)' }}>
          <p style={{ fontWeight: 'var(--weight-extrabold)' }}>Agendamento feito!</p>
          <p style={{ fontSize: 'var(--text-sm-sz)', marginTop: 2 }}>
            Para este atendimento, a clínica pede a sua assinatura {doAgendamento.length === 1 ? 'no documento abaixo' : 'nos documentos abaixo'}. Você pode assinar agora mesmo.
          </p>
        </div>
      )}

      <section aria-label="Para assinar" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="overline">Para assinar</p>
        {paraAssinar.length === 0 ? (
          <div className="card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Nenhum documento esperando a sua assinatura.</p>
          </div>
        ) : paraAssinar.map(d => <Cartao key={d.id} slug={slug} doc={d} />)}
      </section>

      {assinados.length > 0 && (
        <section aria-label="Assinados" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="overline">Assinados</p>
          {assinados.map(d => <Cartao key={d.id} slug={slug} doc={d} />)}
        </section>
      )}
    </div>
  )
}

function Cartao({ slug, doc }: { slug: string; doc: Awaited<ReturnType<typeof documentosNoPortal>>[number] }) {
  const Icone = doc.tipo === 'CONTRATO_PLANO' ? ScrollText : doc.tipo === 'CONTRATO' ? FileText : FileSignature
  const situacao = doc.status === 'ASSINADO'
    ? `Assinado em ${doc.assinadoEm ? formatDate(doc.assinadoEm) : '—'}`
    : doc.status === 'INCOMPLETO' ? 'Em preparação pela clínica' : 'Esperando a sua assinatura'
  return (
    <Link href={`/${slug}/cliente/documentos/${doc.id}`} data-documento={doc.id} className="card"
      style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
      <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-field-token)', background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icone size={17} color="var(--brand)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 'var(--weight-bold)', color: 'var(--text)', fontSize: 'var(--text-base-sz)', overflowWrap: 'anywhere' }}>{doc.titulo}</p>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: doc.status === 'PENDENTE' || doc.status === 'A_GERAR' ? 'var(--brand)' : 'var(--text-muted)', fontWeight: 'var(--weight-semibold)' }}>{situacao}</p>
      </div>
      <ChevronRight size={16} color="var(--text-faint)" />
    </Link>
  )
}

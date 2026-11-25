import Link from 'next/link'
import { ChevronRight, FileCheck, FileSignature, FileText, Images, ScrollText } from 'lucide-react'
import { getTenantContext, assertClient } from '@/lib/auth'
import { documentosNoPortal } from '@/lib/documentos/leitura'
import { formatDate } from '@estetica-os/utils'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { fusoValido } from '@/lib/unidades/fuso'
import { linkDoDocumentoNoApp, ROTULO_DOS_ARQUIVOS_NO_APP } from '@/lib/clientes/textos-do-app'
import { nomeDaRedeDoPortal } from '@/lib/clientes/nome-da-rede'

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
  // O dia da assinatura no relógio da unidade do endereço (F62b).
  const fuso = fusoValido((await ler(createAdminClient().from('branches').select('fuso').eq('slug', slug).maybeSingle(),
    'buscar o fuso da unidade') as { fuso: string | null } | null)?.fuso)
  const paraAssinar = docs.filter(d => d.status === 'PENDENTE' || d.status === 'A_GERAR' || d.status === 'INCOMPLETO')
  const assinados = docs.filter(d => d.status === 'ASSINADO')
  const doAgendamento = agendamento ? paraAssinar.filter(d => d.agendamentoId === agendamento) : []
  // CA4/DC3: com dois ou mais prontos, "Assinar todos" — uma assinatura para todos.
  const prontos = paraAssinar.filter(d => d.status === 'PENDENTE').length
  // D13 (CA1: "A clínica enviou um documento" passa a usar o NOME da rede): quem pede e quem enviou é a rede.
  const rede = (await nomeDaRedeDoPortal(slug)) ?? 'A rede'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.025em' }}>Documentos</h1>

      {doAgendamento.length > 0 && (
        <div className="card-brand" style={{ padding: '14px 18px', borderRadius: 'var(--radius-card-token)' }}>
          <p style={{ fontWeight: 'var(--weight-extrabold)' }}>Agendamento feito!</p>
          <p style={{ fontSize: 'var(--text-sm-sz)', marginTop: 2 }}>
            Para este atendimento, {rede} pede a sua assinatura {doAgendamento.length === 1 ? 'no documento abaixo' : 'nos documentos abaixo'}. Você pode assinar agora mesmo.
          </p>
        </div>
      )}

      <section aria-label="Para assinar" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <p className="overline">Para assinar</p>
          {prontos >= 2 && (
            <Link href={`/${slug}/cliente/documentos/assinar`} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FileSignature size={15} /> Assinar todos ({prontos})
            </Link>
          )}
        </div>
        {paraAssinar.length === 0 ? (
          <div className="card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Nenhum documento esperando a sua assinatura.</p>
          </div>
        ) : paraAssinar.map(d => <Cartao key={d.id} slug={slug} doc={d} fuso={fuso} />)}
      </section>

      {assinados.length > 0 && (
        <section aria-label="Assinados" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="overline">Assinados</p>
          {assinados.map(d => <Cartao key={d.id} slug={slug} doc={d} fuso={fuso} />)}
        </section>
      )}

      {/* A35 da 23ª (princípio 3): a foto enviada pela rede mora no Histórico
          ("Fotos e arquivos"); a cliente a procurava aqui, nos documentos. */}
      <Link href={linkDoDocumentoNoApp(slug)} data-fotos-e-arquivos className="card"
        style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
        <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-field-token)', background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Images size={17} color="var(--brand)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 'var(--weight-bold)', color: 'var(--text)', fontSize: 'var(--text-base-sz)' }}>{ROTULO_DOS_ARQUIVOS_NO_APP}</p>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>As fotos e os arquivos que {rede} enviou, no Histórico</p>
        </div>
        <ChevronRight size={16} color="var(--text-faint)" />
      </Link>
    </div>
  )
}

function Cartao({ slug, doc, fuso }: { slug: string; doc: Awaited<ReturnType<typeof documentosNoPortal>>[number]; fuso: string }) {
  const Icone = doc.tipo === 'CONTRATO_PLANO' || doc.tipo === 'CONTRATO_PACOTE' ? ScrollText : doc.tipo === 'CONTRATO' ? FileText : doc.tipo === 'DOCUMENTO' ? FileCheck : FileSignature
  const situacao = doc.status === 'ASSINADO'
    ? `Assinado em ${doc.assinadoEm ? formatDate(doc.assinadoEm, fuso) : '—'}`
    : doc.status === 'INCOMPLETO' ? 'Em preparação pela equipe' : 'Esperando a sua assinatura'
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

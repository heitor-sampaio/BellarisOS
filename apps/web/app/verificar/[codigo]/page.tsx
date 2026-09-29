import type { Metadata } from 'next'
import { BadgeCheck, CircleAlert } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { normalizarCodigo } from '@/lib/documentos/codigo'
import { iniciaisDoNome } from '@estetica-os/utils'
import { MolduraDaVerificacao, FormularioDoCodigo } from '../moldura'
import { ConferirArquivo } from '../conferir-arquivo'

/**
 * O resultado da verificação de um documento — PÚBLICA.
 *
 * Mostra o bastante para conferir a autenticidade e NADA que exponha o
 * titular (LGPD): nem CPF, nem nome completo, nem IP, nem o conteúdo. O nome
 * do documento pode dizer o procedimento — e isso quem tem o papel já sabe.
 * O código tem 60 bits: não se chega a um documento chutando.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Verificar documento — BellarisOS',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

const TIPO: Record<string, string> = { TERMO: 'Termo de consentimento', CONTRATO: 'Contrato', CONTRATO_PLANO: 'Contrato de plano' }
const CANAL: Record<string, string> = {
  CLINICA: 'presencialmente, na clínica', PAPEL: 'no papel, na clínica', PORTAL: 'pelo portal do cliente', LINK: 'por link enviado ao cliente',
}
const SITUACAO: Record<string, string> = {
  A_GERAR: 'Emitido, ainda não assinado', INCOMPLETO: 'Emitido, ainda não assinado', PENDENTE: 'Emitido, ainda não assinado',
  DISPENSADO: 'Dispensado pela clínica — não foi assinado', CANCELADO: 'Cancelado — não foi assinado',
  SUBSTITUIDO: 'Substituído por outro documento',
}

export default async function ResultadoDaVerificacao({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo: bruto } = await params
  const codigo = normalizarCodigo(decodeURIComponent(bruto))

  const admin = createAdminClient()
  const doc = codigo
    ? await ler(admin.from('issued_documents')
        .select('title, kind, status, signed_at, content_sha256, signed_pdf_sha256, tenant_id, branch_id, document_signatures(channel, signer_name)')
        .eq('verification_code', codigo).maybeSingle(), 'verificar o documento')
    : null

  if (!doc) {
    return (
      <MolduraDaVerificacao>
        <Resultado ok={false} titulo="Código não encontrado" texto="Nenhum documento tem este código. Confira se ele foi digitado como está no rodapé do documento." />
        <FormularioDoCodigo inicial={codigo ?? bruto} />
      </MolduraDaVerificacao>
    )
  }

  const [rede, unidade] = await Promise.all([
    ler(admin.from('tenants').select('name').eq('id', doc.tenant_id).single(), 'buscar a rede'),
    doc.branch_id ? ler(admin.from('branches').select('name').eq('id', doc.branch_id).maybeSingle(), 'buscar a unidade') : Promise.resolve(null),
  ])
  const assinatura = doc.document_signatures as unknown as { channel: string; signer_name: string } | null
  const assinado = doc.status === 'ASSINADO'

  return (
    <MolduraDaVerificacao>
      <Resultado
        ok={assinado}
        titulo={assinado ? 'Documento autêntico' : SITUACAO[doc.status as string] ?? 'Documento não assinado'}
        texto={assinado
          ? `Assinado eletronicamente em ${new Date(doc.signed_at as string).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}${assinatura ? `, ${CANAL[assinatura.channel] ?? ''}` : ''}.`
          : 'Este código existe, mas o documento não está valendo como assinado.'}
      />
      <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Linha rotulo="Documento" valor={doc.title as string} />
        <Linha rotulo="Tipo" valor={TIPO[doc.kind as string] ?? String(doc.kind)} />
        <Linha rotulo="Emitido por" valor={[rede?.name, unidade?.name].filter(Boolean).join(' — ')} />
        {assinado && assinatura && <Linha rotulo="Assinante (iniciais)" valor={iniciaisDoNome(assinatura.signer_name)} />}
        <Linha rotulo="Código" valor={codigo!} />
        {doc.content_sha256 && <Linha rotulo="SHA-256 do conteúdo" valor={doc.content_sha256 as string} mono />}
        {doc.signed_pdf_sha256 && <Linha rotulo="SHA-256 do PDF assinado" valor={doc.signed_pdf_sha256 as string} mono />}
      </div>
      {assinado && <ConferirArquivo pdfAssinado={(doc.signed_pdf_sha256 as string | null) ?? null} conteudo={(doc.content_sha256 as string | null) ?? null} />}
    </MolduraDaVerificacao>
  )
}

function Resultado({ ok, titulo, texto }: { ok: boolean; titulo: string; texto: string }) {
  const Icone = ok ? BadgeCheck : CircleAlert
  return (
    <div className="card" style={{ padding: 20, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: ok ? 'var(--success-bg)' : 'var(--warning-soft)' }}>
        <Icone size={22} color={ok ? 'var(--success)' : 'var(--warning)'} />
      </div>
      <div>
        <h1 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>{titulo}</h1>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: 4 }}>{texto}</p>
      </div>
    </div>
  )
}

function Linha({ rotulo, valor, mono }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{rotulo}</span>
      <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', overflowWrap: 'anywhere', letterSpacing: mono ? '0.02em' : undefined }}>{valor}</span>
    </div>
  )
}

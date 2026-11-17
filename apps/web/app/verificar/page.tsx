import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { normalizarCodigo } from '@/lib/documentos/codigo'
import { MolduraDaVerificacao, FormularioDoCodigo } from './moldura'
import { Dica } from '@/components/shared/dica'

/**
 * Verificar um documento assinado — PÚBLICA (declarada em
 * lib/supabase/middleware.ts). Quem recebe o papel ou o PDF digita o código.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Verificar documento — BellarisOS',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function Verificar({ searchParams }: { searchParams: Promise<{ codigo?: string }> }) {
  const { codigo } = await searchParams
  if (codigo) {
    const normalizado = normalizarCodigo(codigo)
    if (normalizado) redirect(`/verificar/${normalizado}`)
  }
  return (
    <MolduraDaVerificacao>
      {/* A apresentação mora na dica do título (2026-11-16). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>
          Verificar documento assinado
        </h1>
        <Dica rotulo="O que esta página confere">
          Confira se um termo ou contrato assinado eletronicamente é autêntico e se não foi alterado.
        </Dica>
      </div>
      <FormularioDoCodigo inicial={codigo} erro={codigo ? 'Este código não é válido. Confira as 12 letras e números.' : null} />
    </MolduraDaVerificacao>
  )
}

import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth'
import { getCachedFichasDoLogin } from '@/lib/cached-queries'
import AuthLayout from '@/app/(auth)/layout'
import { SeletorDeClinica } from '@/components/client-portal/seletor-de-clinica'
import { BotaoSairDoPortal } from '@/components/client-portal/botao-sair'
import { fichasQueAbrem } from '@/lib/clientes/disponibilidade'

export const dynamic = 'force-dynamic'

/**
 * O seletor de clínica da cliente (2026-10-19, decisão do Heitor): a mesma
 * pessoa cliente de várias clínicas que usam o BellarisOS, com uma conta só.
 * Aparece no primeiro login com mais de uma clínica (lib/clientes/entrada.ts)
 * e pelo nome da unidade no topo do portal. Mora em `/auth/…`, fora do espaço
 * dos slugs: nenhuma unidade o sombreia.
 */
export default async function SeletorDeClinicaPage() {
  const ctx = await getTenantContext()
  if (!ctx.isClient) redirect('/auth/redirect')

  const fichas = (await getCachedFichasDoLogin(ctx.userId)).filter(f => f.slug)
  if (!fichas.length) redirect('/login')
  if (fichas.length === 1) redirect(`/${fichas[0]!.slug}/cliente`)
  // A clínica fechada aparece, mas não entra: ela sabe por que não a vê.
  const abertas = new Set((await fichasQueAbrem(fichas)).map(f => f.clientId))

  return (
    <AuthLayout>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card-token)', padding: 24,
      }}>
        <h1 style={{
          fontSize: 'var(--text-name)', fontWeight: 'var(--weight-extrabold)',
          letterSpacing: 'var(--tracking-tight)', color: 'var(--text)', margin: 0,
        }}>
          Em qual clínica você quer entrar?
        </h1>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', margin: '6px 0 18px' }}>
          Sua conta está em mais de uma clínica. Dá para trocar depois, pelo nome da clínica no topo.
        </p>
        <SeletorDeClinica clinicas={fichas.map(f => ({
          clientId: f.clientId, unidade: f.unidade, rede: f.rede, disponivel: abertas.has(f.clientId),
        }))} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
        <BotaoSairDoPortal />
      </div>
    </AuthLayout>
  )
}

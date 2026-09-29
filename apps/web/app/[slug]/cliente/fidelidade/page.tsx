import { redirect } from 'next/navigation'
import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { configDaRede, saldoDoCliente, extratoDoCliente, vouchersDoCliente, recompensasDaRede } from '@/lib/fidelidade/leitura'
import { descricaoDoVoucher, situacaoDoVoucher } from '@/lib/fidelidade/voucher'
import { formatarPontos, rotuloDoLancamento } from '@/lib/fidelidade/formato'

/**
 * Portal do cliente → Meus pontos: saldo e extrato.
 *
 * Só com o programa ligado na rede do cliente — desligado, a página não existe
 * para ele (volta ao início). O cliente não resgata por aqui: o resgate é na
 * recepção (decisão do Heitor, 2026-09-28).
 */
export default async function FidelidadeDoClientePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await getTenantContext()
  assertClient(ctx)

  const admin = createAdminClient()
  const cliente = await ler(admin.from('clients').select('tenant_id').eq('id', ctx.clientId!).single(),
    'buscar o cliente') as { tenant_id: string | null } | null
  const cfg = cliente?.tenant_id ? await configDaRede(cliente.tenant_id, admin) : null
  if (!cfg?.enabled) redirect(`/${slug}/cliente/home`)

  const [saldo, extrato, vouchers, recompensas] = await Promise.all([
    saldoDoCliente(ctx.clientId!, null, admin),
    extratoDoCliente(ctx.clientId!, { limite: 100 }, admin),
    vouchersDoCliente(ctx.clientId!, admin),
    recompensasDaRede(cliente!.tenant_id!, true, admin),
  ])
  const ativos = vouchers.filter(v => situacaoDoVoucher(v) === 'ATIVO')
  const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.025em', marginBottom: 4 }}>
          Meus pontos
        </h1>
        <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)' }}>
          Você ganha pontos a cada pagamento. Para usar ou trocar por uma recompensa, fale com a recepção.
        </p>
      </div>

      <div style={{
        background: 'var(--gradient-brand)', borderRadius: 14, padding: '18px 20px', color: 'var(--on-brand)',
      }}>
        <p style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, opacity: 0.8, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
          Saldo
        </p>
        <p data-testid="saldo-do-portal" style={{ fontSize: 'var(--text-kpi)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {formatarPontos(saldo)}
        </p>
      </div>

      {ativos.length > 0 && (
        <section className="card" style={{ padding: '14px 18px' }} aria-label="Meus vouchers" data-testid="meus-vouchers">
          <p className="overline" style={{ marginBottom: 8 }}>Meus vouchers</p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ativos.map(v => (
              <li key={v.id}>
                <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>{descricaoDoVoucher(v)}</p>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                  Válido até {data(v.expires_at)}. Mostre na recepção.
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recompensas.length > 0 && (
        <section className="card" style={{ padding: '14px 18px' }} aria-label="Recompensas">
          <p className="overline" style={{ marginBottom: 8 }}>Troque seus pontos</p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recompensas.map(r => (
              <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{r.name}</span>
                <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, whiteSpace: 'nowrap', color: saldo >= r.points_cost ? 'var(--brand)' : 'var(--text-faint)' }}>
                  {formatarPontos(r.points_cost)}
                </span>
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 8 }}>A troca é feita na recepção.</p>
        </section>
      )}

      <section className="card" style={{ padding: '6px 18px' }} aria-label="Extrato de pontos">
        {extrato.linhas.length === 0 ? (
          <p style={{ padding: '14px 0', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
            Nenhum ponto ainda.
          </p>
        ) : (
          <ul style={{ listStyle: 'none' }}>
            {extrato.linhas.map((l, i) => (
              <li key={l.id} style={{
                display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', padding: '12px 0',
                borderBottom: i === extrato.linhas.length - 1 ? 'none' : '1px solid var(--hairline)',
              }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>
                    {rotuloDoLancamento(l.kind)}
                  </p>
                  <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                    {new Date(l.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    {l.branch_name && ` · ${l.branch_name}`}
                  </p>
                </div>
                <span style={{
                  fontSize: 'var(--text-sm-sz)', fontWeight: 800, whiteSpace: 'nowrap',
                  color: l.points > 0 ? 'var(--success)' : 'var(--danger)',
                }}>
                  {l.points > 0 ? '+' : ''}{formatarPontos(l.points)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

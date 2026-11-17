import Link from 'next/link'
import { Download, ScrollText } from 'lucide-react'
import { unidadesDoContexto } from '@/lib/auth'
import type { TenantContext } from '@estetica-os/types'
import { unidadesParaLer, nomeNaTela } from '@/lib/unidades/da-tela'
import { lerAuditoria, pessoasDaAuditoria } from '@/lib/auditoria/leitura'
import { gruposDaAuditoria } from '@/lib/auditoria/frase'
import { OPERACOES, type FiltrosDaAuditoria } from '@/lib/auditoria/tipos'
import { PeriodSelector, type Period } from '@/components/admin/period-selector'
import { Dica } from '@/components/shared/dica'

/**
 * A tela da Auditoria (CF3a, docs/revisao.md — o Heitor, 2026-11-13: "queria
 * um lugar para auditoria [...] onde o admin pudesse ver tudo o que
 * aconteceu"; "Pode ser no menu"). Só leitura: quando, quem (com o "via
 * suporte"), o quê em português, o link e a unidade.
 *
 * O corpo é um só para os dois portais (`/admin/auditoria` e
 * `/[slug]/auditoria`): as páginas conferem a permissão e o portal, e esta
 * lê com a abrangência do membro (`lib/auditoria/leitura.ts`).
 */
export async function TelaDaAuditoria({
  ctx, basePath, slug, filtros,
}: {
  ctx:      TenantContext
  /** `/admin/auditoria` ou `/[slug]/auditoria` — o endereço dos filtros e dos links. */
  basePath: string
  slug:     string | null
  filtros:  FiltrosDaAuditoria
}) {
  const minhas = unidadesDoContexto(ctx)
  const [pagina, pessoas, todasAsUnidades] = await Promise.all([
    lerAuditoria(ctx, filtros, { porGravacao: true }),
    pessoasDaAuditoria(ctx),
    unidadesParaLer(ctx.tenantId!),
  ])
  const unidades = todasAsUnidades.filter(u => minhas === null || minhas.includes(u.id))
  // Uma linha por GRAVAÇÃO (A27 da 15ª): o que a pessoa fez; os registros dela ficam guardados na linha.
  const linhas = gruposDaAuditoria(pagina.registros, pagina.nomes, basePath, slug)

  // Os filtros que ficam (o período mora no seletor; a página volta à primeira).
  const params = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams()
    const base: Record<string, string | undefined> = {
      period: filtros.period, from: filtros.from, to: filtros.to, pessoa: filtros.pessoa,
      tipo: filtros.tipo, unidade: pagina.unidade ?? undefined, cliente: filtros.cliente,
    }
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v) p.set(k, v)
    const s = p.toString()
    return s ? `?${s}` : ''
  }
  const periodoAtual = (['today', '7d', '15d', 'month', 'all', 'custom'] as const).includes(filtros.period as Period)
    ? filtros.period as Period : 'month'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        {/* A apresentação mora na dica do título (2026-11-16). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>
            Auditoria
          </h1>
          <Dica rotulo="Sobre a auditoria" largura={320}>
            O que mudou no sistema, quem mudou e quando — e quem abriu o prontuário de quem.
            O texto clínico nunca aparece aqui.
            {minhas !== null && ' Você vê o que aconteceu nas suas unidades.'}
          </Dica>
        </div>
        <a href={`/api/auditoria/csv${params({})}`} className="btn-ghost" data-auditoria-csv
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 'var(--altura-controle)' }}>
          <Download size={15} aria-hidden /> Baixar CSV
        </a>
      </div>

      <div className="filtros-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <PeriodSelector current={periodoAtual} fromDate={filtros.from} toDate={filtros.to} />
      </div>
      <form method="get" action={basePath} data-filtros-da-auditoria
        style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 20 }}>
        {filtros.period && <input type="hidden" name="period" value={filtros.period} />}
        {filtros.from && <input type="hidden" name="from" value={filtros.from} />}
        {filtros.to && <input type="hidden" name="to" value={filtros.to} />}
        <select name="pessoa" defaultValue={filtros.pessoa ?? ''} className="filtro-select" aria-label="Quem">
          <option value="">Qualquer pessoa</option>
          <option value="copilot">Só o que foi pelo Copilot</option>
          {pessoas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select name="tipo" defaultValue={filtros.tipo ?? ''} className="filtro-select" aria-label="O que foi feito">
          <option value="">Qualquer ação</option>
          {OPERACOES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        {unidades.length > 1 && (
          <select name="unidade" defaultValue={pagina.unidade ?? ''} className="filtro-select" aria-label="Unidade">
            <option value="">{minhas === null ? 'Todas as unidades' : 'As minhas unidades'}</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{nomeNaTela(u)}</option>)}
          </select>
        )}
        <input type="search" name="cliente" defaultValue={filtros.cliente ?? ''} placeholder="Cliente" aria-label="Cliente"
          className="field filtro-largo" style={{ width: 200 }} />
        <button type="submit" className="btn-primary" style={{ height: 'var(--altura-controle)' }}>Filtrar</button>
      </form>

      {linhas.length === 0 ? (
        <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '18px 20px' }}>
          <ScrollText size={16} aria-hidden style={{ color: 'var(--text-faint)' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
            Nada registrado com esses filtros{pagina.antes ? ' nesta página' : ''}.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="auditoria-cabecalho overline" aria-hidden>
            <span>Quando</span><span>Quem</span><span>O quê</span><span>Unidade</span>
          </div>
          {linhas.map(l => (
            <div key={l.id} data-linha-da-auditoria className="auditoria-linha">
              <span className="auditoria-quando">{l.quando}</span>
              <span className="auditoria-quem" data-tipo-de-ator={l.tipoDeAtor}>{l.quem}</span>
              <div className="auditoria-o-que">
                <span data-frase-da-auditoria>{l.href
                  ? <Link href={l.href} style={{ color: 'var(--text)', fontWeight: 'var(--weight-semibold)' }}>{l.oQue}</Link>
                  : l.oQue}</span>
                {l.detalhes.length > 1 && (
                  <details className="auditoria-detalhes">
                    <summary>Ver as {l.detalhes.length} mudanças desta gravação</summary>
                    <ul>
                      {l.detalhes.map(d => (
                        <li key={d.id} data-detalhe-da-auditoria>
                          {d.href ? <Link href={d.href} style={{ color: 'var(--text)' }}>{d.oQue}</Link> : d.oQue}
                          {d.unidade && d.unidade !== l.unidade ? ` · ${d.unidade}` : ''}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              <span className="auditoria-unidade">{l.unidade ?? '—'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Por gravação, a página segue por cursor (`?antes=`): "Mais recentes" volta ao começo. */}
      {(pagina.antes || pagina.temMais) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 14 }}>
          {pagina.antes
            ? <Link href={`${basePath}${params({})}`} className="btn-ghost">Mais recentes</Link>
            : <span />}
          {pagina.temMais && pagina.proximo && (
            <Link href={`${basePath}${params({ antes: pagina.proximo })}`} className="btn-ghost" data-auditoria-mais>
              Mais antigas
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

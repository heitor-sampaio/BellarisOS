import { Check, ChevronDown, Minus } from 'lucide-react'
import { comparativoDosPlanos } from '@estetica-os/nucleo/lib/planos/comparativo'
import { cartaoDoPlano, type PlanoDoSite } from '@/lib/planos'

/**
 * Os preços (2026-10-17): os planos ATIVOS do sistema, um cartão cada, e o
 * comparativo inteiro — o mesmo do sistema (`comparativoDosPlanos`, no
 * núcleo) — a um clique. Destaque (preenchido em rosé) é o plano com o
 * Copilot incluído: é o que ele tem a mais, dito sem inventar "o mais vendido".
 */
export function Precos({ planos, comecar }: { planos: PlanoDoSite[] | null; comecar: string }) {
  return (
    <section id="precos" className="site-secao" aria-labelledby="precos-titulo">
      <div className="site-container">
        <div className="site-cabeca site-cabeca-centro" data-revelar>
          <span className="site-overline">✦ Preços</span>
          <h2 id="precos-titulo" className="site-h2">Um preço por mês, do tamanho da sua clínica.</h2>
          <p className="site-lead">Comece com 14 dias grátis, com tudo liberado. Sem cartão de crédito.</p>
        </div>
        {planos && planos.length ? <Planos planos={planos} comecar={comecar} /> : (
          <div className="site-plano" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', alignItems: 'center' }}>
            <p className="site-lead">Os planos aparecem aqui em instantes. Enquanto isso, o teste grátis já está aberto.</p>
            <a className="site-botao site-botao-primario" href={comecar}>Começar grátis</a>
          </div>
        )}
      </div>
    </section>
  )
}

function Planos({ planos, comecar }: { planos: PlanoDoSite[]; comecar: string }) {
  const cartoes = planos.map(cartaoDoPlano)
  const destaque = cartoes.findIndex(c => c.comCopilot)
  const comparativo = comparativoDosPlanos(planos.map((p, i) => ({
    id: String(i), nome: p.nome, valorCentavos: p.valorCentavos, ativo: true, recursos: p.recursos,
  })))

  return (
    <>
      <div className="site-planos" style={{ '--colunas': String(Math.min(cartoes.length, 4)) } as React.CSSProperties}>
        {cartoes.map((c, i) => {
          const realce = i === destaque
          return (
            <article key={c.nome} className={`site-plano${realce ? ' site-plano-destaque' : ''}`}
              data-revelar style={{ '--ordem': i } as React.CSSProperties}>
              {realce && <span className="site-plano-selo">Copilot incluído</span>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <h3 className="site-h3">{c.nome}</h3>
                {c.descricao && <p className="site-muted" style={{ fontSize: 'var(--site-pequeno)' }}>{c.descricao}</p>}
              </div>
              <p className="site-plano-preco">{c.preco}<small>/mês</small></p>
              <ul className="site-plano-lista">
                {c.todasAsFuncionalidades && <li><Check size={16} aria-hidden="true" /><span>Todas as funcionalidades{c.comCopilot ? '' : ', fora o Copilot'}</span></li>}
                {c.destaques.map(d => <li key={d}><Check size={16} aria-hidden="true" /><span>{d}</span></li>)}
              </ul>
              {c.adicionais.length > 0 && (
                <div className="site-plano-extras">
                  <span style={{ fontWeight: 'var(--weight-bold)' }}>À parte, se quiser:</span>
                  {c.adicionais.map(a => <span key={a}>{a}</span>)}
                </div>
              )}
              <a className={`site-botao ${realce ? 'site-botao-claro' : 'site-botao-primario'}`} href={comecar}>
                Começar grátis
              </a>
            </article>
          )
        })}
      </div>
      <p className="site-precos-nota">
        As conversas do WhatsApp oficial têm a tarifa da Meta, cobrada pela Meta direto na conta da clínica.
      </p>

      <details className="site-comparar" data-revelar>
        <summary>Comparar tudo o que cada plano inclui <ChevronDown size={18} aria-hidden="true" /></summary>
        <div className="site-tabela-rolagem">
          <table className="site-tabela">
            <thead>
              <tr><th scope="col"><span className="sr-only">Item</span></th>{comparativo.planos.map(p => <th key={p.id} scope="col">{p.nome}</th>)}</tr>
            </thead>
            <tbody>
              {comparativo.secoes.map(s => (
                <Secao key={s.titulo} titulo={s.titulo} colunas={comparativo.planos.length} linhas={s.linhas} />
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  )
}

function Secao({ titulo, colunas, linhas }: {
  titulo: string
  colunas: number
  linhas: ReturnType<typeof comparativoDosPlanos>['secoes'][number]['linhas']
}) {
  return (
    <>
      <tr className="site-tabela-secao"><th colSpan={colunas + 1} scope="colgroup">{titulo}</th></tr>
      {linhas.map(l => (
        <tr key={l.rotulo}>
          <th scope="row" style={{ fontWeight: 'var(--weight-semibold)' }}>{l.rotulo}</th>
          {l.celulas.map((c, i) => (
            <td key={i}>
              {c.tipo === 'sim' ? <Check size={16} className="sim" aria-label="Incluído" />
                : c.tipo === 'nao' ? <Minus size={16} className="nao" aria-label="Não incluído" />
                : c.texto}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

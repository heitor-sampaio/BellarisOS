import Link from 'next/link'
import { getPlatformContext } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { createAdminClient } from '@estetica-os/nucleo/lib/supabase/admin'
import {
  mesDeBrasilia, mesesAte, nomeDoMes, usoDoCopilotDasRedes, historicoDoCopilot, type UsoDaRede,
} from '@estetica-os/nucleo/lib/planos/uso-do-copilot'
import { cotacaoDoDolar, dolares, reaisEstimados } from '@estetica-os/nucleo/lib/planos/custo-do-copilot'
import { FiltroNaUrl } from '@/components/sistema/filtro-na-url'

/**
 * O USO DO COPILOT de todas as redes (pedido do Heitor, 2026-10-08): no mês
 * escolhido, da rede que mais gasta para a que menos — pedidos, tokens, a cota
 * e o custo ESTIMADO (o preço do modelo, em dólar, que a clínica soma a cada
 * chamada; em reais pela cotação de `COTACAO_DOLAR`). E os últimos meses.
 * As redes de teste ([e2e]) só com `?teste=1`. O ADMIN e o GERENTE veem.
 */

const MESES_NO_SELETOR = 12
const MESES_NO_HISTORICO = 6

const numero = (n: number) => n.toLocaleString('pt-BR')
const tokensCurtos = (n: number) => n >= 1_000_000
  ? `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  : numero(n)

export default async function UsoDoCopilotPage({ searchParams }: {
  searchParams: Promise<{ mes?: string; teste?: string }>
}) {
  await getPlatformContext({ verSistema: true })
  const { mes: mesPedido, teste } = await searchParams
  const atual = mesDeBrasilia()
  const meses = mesesAte(atual, MESES_NO_SELETOR)
  const mes = meses.includes(mesPedido ?? '') ? mesPedido! : atual
  const comTeste = teste === '1'
  const cotacao = cotacaoDoDolar(process.env.COTACAO_DOLAR)

  const admin = createAdminClient()
  const todas = await usoDoCopilotDasRedes(admin, mes)
  const deTeste = new Set(todas.filter(r => r.nome.startsWith('[e2e]')).map(r => r.tenantId))
  const redes = todas.filter(r => comTeste || !deTeste.has(r.tenantId))
  // O histórico conta as redes que a tela conta (sem as de teste, salvo o filtro).
  const nomeDe = new Map(todas.map(r => [r.tenantId, r.nome]))
  const historico = await historicoDoCopilot(admin, atual, MESES_NO_HISTORICO,
    id => comTeste || !(nomeDe.get(id) ?? '').startsWith('[e2e]'))

  const usaram = redes.filter(r => r.pedidos > 0)
  const tokens = redes.reduce((s, r) => s + r.tokens, 0)
  const pedidos = redes.reduce((s, r) => s + r.pedidos, 0)
  const comCusto = redes.filter(r => r.custoUsd !== null)
  const custo = comCusto.length ? comCusto.reduce((s, r) => s + r.custoUsd!, 0) : null
  const noPlano = redes.filter(r => r.noPlano).length

  return (
    <div className="suporte-pilha-larga">
      <div className="suporte-cabecalho">
        <div>
          <h1 className="suporte-titulo">Uso do Copilot</h1>
          <p className="suporte-sub">{nomeDoMes(mes)} · {usaram.length} {usaram.length === 1 ? 'rede usou' : 'redes usaram'}</p>
        </div>
        <div className="suporte-filtros">
          <FiltroNaUrl nome="mes" valor={mes === atual ? '' : mes} rotulo="Mês"
            opcoes={meses.map(m => ({ valor: m === atual ? '' : m, rotulo: m === atual ? `Este mês (${nomeDoMes(m)})` : nomeDoMes(m) }))} />
          <Link href={comTeste ? `/copilot${mes === atual ? '' : `?mes=${mes}`}` : `/copilot?teste=1${mes === atual ? '' : `&mes=${mes}`}`}
            className="filtro-toggle" aria-pressed={comTeste}>
            Redes de teste
          </Link>
        </div>
      </div>

      <div className="sistema-kpis">
        {/* O custo é o que importa aqui: ele é o preenchido (§13). */}
        <div className="card-brand sistema-kpi">
          <p className="overline">Custo estimado no mês</p>
          <p className="sistema-kpi-valor">{custo === null ? '—' : dolares(custo)}</p>
          <p className="sistema-kpi-nota">
            {custo === null ? 'sem custo registrado' : `≈ ${reaisEstimados(custo, cotacao)} (dólar a ${reaisEstimados(1, cotacao)})`}
          </p>
        </div>
        <div className="card sistema-kpi">
          <p className="overline">Tokens no mês</p>
          <p className="sistema-kpi-valor">{tokensCurtos(tokens)}</p>
          <p className="sistema-kpi-nota">{numero(pedidos)} {pedidos === 1 ? 'pedido' : 'pedidos'}</p>
        </div>
        <div className="card sistema-kpi">
          <p className="overline">Redes que usaram</p>
          <p className="sistema-kpi-valor">{usaram.length}</p>
          <p className="sistema-kpi-nota">de {noPlano} com o Copilot no plano</p>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }} data-uso-por-rede>
        {redes.length === 0 ? <p className="suporte-vazio">Nenhuma rede com o Copilot neste mês.</p> : (
          <table className="cards-mobile suporte-tabela">
            <thead>
              <tr><th>Rede</th><th>Plano</th><th>Pedidos</th><th>Tokens</th><th>Cota</th><th>Custo estimado</th></tr>
            </thead>
            <tbody>
              {redes.map(r => (
                <tr key={r.tenantId}>
                  <td data-label="">
                    <Link href={`/redes/${r.tenantId}`} className="suporte-link-forte">{r.nome}</Link>
                    {!r.noPlano && <span className="suporte-texto-fraco"> · fora do plano agora</span>}
                  </td>
                  <td data-label="Plano" data-par>{r.plano ?? '—'}</td>
                  <td data-label="Pedidos" data-par>{numero(r.pedidos)}</td>
                  <td data-label="Tokens" data-par>{numero(r.tokens)}</td>
                  <td data-label="Cota" data-par><CotaDaRede r={r} /></td>
                  <td data-label="Custo estimado" data-par>
                    {r.custoUsd === null ? '—' : <>{dolares(r.custoUsd)}<span className="suporte-texto-fraco"> · ≈ {reaisEstimados(r.custoUsd, cotacao)}</span></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <section className="card" style={{ padding: 0, overflow: 'hidden' }} data-historico-do-copilot>
        <div style={{ padding: '14px 16px 4px' }}>
          <p className="overline">Últimos {MESES_NO_HISTORICO} meses</p>
        </div>
        <table className="cards-mobile suporte-tabela">
          <thead>
            <tr><th>Mês</th><th>Redes que usaram</th><th>Pedidos</th><th>Tokens</th><th>Custo estimado</th></tr>
          </thead>
          <tbody>
            {historico.map(h => (
              <tr key={h.mes} aria-current={h.mes === mes ? 'true' : undefined}>
                <td data-label="">
                  <Link href={`/copilot?${new URLSearchParams({ ...(h.mes === atual ? {} : { mes: h.mes }), ...(comTeste ? { teste: '1' } : {}) })}`}
                    className="suporte-link-forte">{nomeDoMes(h.mes)}</Link>
                </td>
                <td data-label="Redes que usaram" data-par>{h.redes}</td>
                <td data-label="Pedidos" data-par>{numero(h.pedidos)}</td>
                <td data-label="Tokens" data-par>{numero(h.tokens)}</td>
                <td data-label="Custo estimado" data-par>{h.custoUsd === null ? '—' : dolares(h.custoUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="suporte-texto-fraco">
        Custo estimado pelo preço público de cada modelo da OpenAI (entrada e saída), somado a cada chamada.
        A cobrança real é a da conta da OpenAI. Meses antes de 08/10/2026 não têm custo registrado.
      </p>
    </div>
  )
}

function CotaDaRede({ r }: { r: UsoDaRede }) {
  if (r.cota === null) return <span className="suporte-texto-fraco">sem limite</span>
  return (
    <span className="uso-da-cota">
      <span>{r.percentual}% de {tokensCurtos(r.cota)}</span>
      <span className="uso-barra" data-cheia={r.percentual !== null && r.percentual >= 100 ? '' : undefined} aria-hidden>
        <span style={{ width: `${r.percentual ?? 0}%` }} />
      </span>
    </span>
  )
}

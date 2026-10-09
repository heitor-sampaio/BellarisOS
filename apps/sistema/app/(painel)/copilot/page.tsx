import Link from 'next/link'
import { getPlatformContext } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { createAdminClient } from '@estetica-os/nucleo/lib/supabase/admin'
import {
  mesDeBrasilia, mesesAte, nomeDoMes, usoDoCopilotDasRedes, historicoDoCopilot, type UsoDaRede,
} from '@estetica-os/nucleo/lib/planos/uso-do-copilot'
import { cotacaoDoDolar, dolares, ratearCusto, reaisEstimados } from '@estetica-os/nucleo/lib/planos/custo-do-copilot'
import { custoRealDaOpenai, custoRealDoProjeto } from '@estetica-os/nucleo/lib/planos/custo-real-da-openai'
import { FiltroNaUrl } from '@/components/sistema/filtro-na-url'

/**
 * O USO DO COPILOT de todas as redes (pedido do Heitor, 2026-10-08): no mês
 * escolhido, da rede que mais gasta para a que menos — pedidos, tokens, a cota
 * e o custo ESTIMADO (o preço do modelo, em dólar, que a clínica soma a cada
 * chamada; em reais pela cotação de `COTACAO_DOLAR`). E os últimos meses.
 *
 * Com a chave de administração da OpenAI (`OPENAI_ADMIN_KEY`), também o custo
 * REAL (a Costs API, o número da fatura) — no destaque, com o estimado ao lado
 * e a diferença — e o RATEIO dele por rede, na proporção do estimado de cada
 * uma (`ratearCusto`): a OpenAI não sabe quais são as redes.
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
  const [todas, real] = await Promise.all([
    usoDoCopilotDasRedes(admin, mes),
    // Desde o mês mais antigo do seletor: uma leitura serve a tela inteira.
    custoRealDaOpenai(meses[meses.length - 1]!),
  ])
  const realPorMes = real && 'porMes' in real ? real.porMes : null
  const realDoMes = realPorMes ? realPorMes[mes] ?? 0 : null
  // O rateio é sobre TODAS as redes que usaram (as de teste também gastaram),
  // não só as que a tela mostra.
  const rateio = realDoMes !== null ? ratearCusto(realDoMes, todas) : null
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
  // A estimativa de TODAS as redes (a base do rateio), para comparar com o real.
  const estimadoTotal = todas.reduce((s, r) => s + (r.custoUsd ?? 0), 0)
  const diferenca = realDoMes !== null && estimadoTotal > 0
    ? Math.round(((realDoMes - estimadoTotal) / estimadoTotal) * 100) : null
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
        {/* O custo é o que importa aqui: ele é o preenchido (§13) — o REAL,
            quando a OpenAI o dá; senão, o estimado. */}
        {realDoMes !== null ? (
          <>
            <div className="card-brand sistema-kpi" data-custo-real>
              <p className="overline">Custo real no mês (OpenAI)</p>
              <p className="sistema-kpi-valor">{dolares(realDoMes)}</p>
              <p className="sistema-kpi-nota">≈ {reaisEstimados(realDoMes, cotacao)} (dólar a {reaisEstimados(1, cotacao)}), sem impostos nem IOF</p>
            </div>
            <div className="card sistema-kpi">
              <p className="overline">Custo estimado no mês</p>
              <p className="sistema-kpi-valor">{dolares(estimadoTotal)}</p>
              <p className="sistema-kpi-nota">
                {diferenca === null ? 'todas as redes' : `todas as redes · o real é ${diferenca >= 0 ? '+' : ''}${diferenca}% do estimado`}
              </p>
            </div>
          </>
        ) : (
          <div className="card-brand sistema-kpi">
            <p className="overline">Custo estimado no mês</p>
            <p className="sistema-kpi-valor">{custo === null ? '—' : dolares(custo)}</p>
            <p className="sistema-kpi-nota">
              {custo === null ? 'sem custo registrado' : `≈ ${reaisEstimados(custo, cotacao)} (dólar a ${reaisEstimados(1, cotacao)})`}
            </p>
          </div>
        )}
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
              <tr><th>Rede</th><th>Plano</th><th>Pedidos</th><th>Tokens</th><th>Cota</th><th>Custo estimado</th>{rateio && <th>Custo real (rateio)</th>}</tr>
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
                  {rateio && (
                    <td data-label="Custo real (rateio)" data-par>
                      {rateio.has(r.tenantId) ? <>
                        <span data-custo-rateado={rateio.get(r.tenantId)!.toFixed(6)}>{dolares(rateio.get(r.tenantId)!)}</span>
                        <span className="suporte-texto-fraco"> · ≈ {reaisEstimados(rateio.get(r.tenantId)!, cotacao)}</span>
                      </> : '—'}
                    </td>
                  )}
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
            <tr><th>Mês</th><th>Redes que usaram</th><th>Pedidos</th><th>Tokens</th><th>Custo estimado</th>{realPorMes && <th>Custo real (OpenAI)</th>}</tr>
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
                {realPorMes && <td data-label="Custo real (OpenAI)" data-par>{dolares(realPorMes[h.mes] ?? 0)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {real && 'erro' in real && <p className="suporte-texto-fraco" role="status">Custo real indisponível: {real.erro} Mostrando só a estimativa.</p>}
      {realPorMes && !custoRealDoProjeto() && (
        <p className="suporte-texto-fraco" role="status" data-custo-da-organizacao>
          O custo real soma TODOS os projetos da conta da OpenAI. Defina OPENAI_PROJECT_ID no serviço Sistema
          (o id proj_… do projeto do BellarisOS) para contar só o dele.
        </p>
      )}
      <p className="suporte-texto-fraco">
        Custo estimado pelo preço público de cada modelo da OpenAI (entrada e saída), somado a cada chamada.
        {realPorMes
          ? ' O real vem da OpenAI (atualizado a cada hora, por dia em UTC) e é rateado entre as redes na proporção do estimado de cada uma — o histórico real conta toda a conta da OpenAI, as redes de teste também.'
          : ' Com a chave de administração da OpenAI (OPENAI_ADMIN_KEY no serviço Sistema), aparece também o custo real da fatura, rateado por rede.'}
        {' '}Meses antes de 08/10/2026 não têm custo estimado registrado.
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

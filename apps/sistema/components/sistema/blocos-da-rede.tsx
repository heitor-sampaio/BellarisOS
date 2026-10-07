'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import {
  definirAssinatura, estenderTeste, marcarEmDia, cancelarAssinatura, reabrirAssinatura,
  ativarCobrancaNoAsaas, sincronizarComOAsaas, aplicarPlanoAtual,
} from '@/actions/sistema'
import { JanelaModal } from '@estetica-os/nucleo/components/shared/janela-modal'
import { resumirRecursos, type OfertaDosAdicionais, type RecursosDoPlano } from '@estetica-os/nucleo/lib/planos/recursos'
import { totalDosAdicionais, type AdicionaisContratados } from '@estetica-os/nucleo/lib/planos/adicionais'
import { descreverCondicao, ITENS_DA_ASSINATURA, type Condicoes } from '@estetica-os/nucleo/lib/planos/condicoes'
import { centavosDe, campoDeReais, reaisDe } from '@estetica-os/nucleo/lib/redes/valor'
import { AdicionaisDaRede } from '@/components/sistema/adicionais-da-rede'
import { CondicoesDaRede } from '@/components/sistema/condicoes-da-rede'
import { DadosDaRede } from '@/components/sistema/dados-da-rede'
import { AcessoDaRede } from '@/components/sistema/acesso-da-rede'

/**
 * A tela da rede no sistema, em BLOCOS DE LEITURA (2026-10-07, pedido do
 * Heitor: a tela empilhava todos os formulários abertos e confundia). Cada
 * bloco resume uma parte — assinatura, adicionais, cortesia e desconto,
 * situação, cobrança, faturas, dados, acesso — e tem o botão que abre o
 * modal só com aquele formulário. Cada ação passa pela action, que confere
 * ADMIN e registra; o Gerente vê os botões travados (fieldset da página).
 */
type Res = { ok: true } | { ok: false; error: string }
type Cobranca = 'sem_cobranca' | 'ativa' | 'cancelada' | 'cortesia'

export interface AssinaturaParaBlocos {
  planoId: string | null; valorCentavos: number; cobranca: Cobranca; asaasSubscriptionId: string | null
  proximoVencimento: string | null; recursos: RecursosDoPlano | null; oferta: OfertaDosAdicionais
  adicionais: AdicionaisContratados; condicoes: Condicoes; totalCentavos: number
}
export interface Fatura { id: string; valorCentavos: number; vencimento: string; situacao: string; pagoEm: string | null; url: string | null; removida: boolean }

const ROTULO_DA_FATURA: Record<string, string> = {
  PENDING: 'Em aberto', OVERDUE: 'Vencida', CONFIRMED: 'Paga (confirmando)', RECEIVED: 'Paga',
  RECEIVED_IN_CASH: 'Paga por fora', REFUNDED: 'Estornada', REFUND_REQUESTED: 'Estorno pedido',
  CHARGEBACK_REQUESTED: 'Contestada', CHARGEBACK_DISPUTE: 'Em disputa',
}
const ROTULO_DO_ITEM = { plano: 'Plano', whatsapp: 'Conexões de WhatsApp', copilot: 'Copilot avulso' } as const
const dia = (ymd: string | null) => ymd
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(`${ymd.slice(0, 10)}T12:00:00`))
  : '—'
const hojeMais = (dias: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + dias * 86_400_000))
/** O primeiro vencimento sugerido: o fim do teste, se ainda não passou; senão daqui a 3 dias. */
const vencimentoSugerido = (fimDoTeste: string | null) =>
  fimDoTeste && Date.parse(fimDoTeste) > Date.now() ? fimDoTeste.slice(0, 10) : hojeMais(3)

/** Um bloco: título, ações à direita e o resumo. É uma região com nome (o título). */
function Bloco({ titulo, acoes, largo, perigo, children }: {
  titulo: string; acoes?: ReactNode; largo?: boolean; perigo?: boolean; children: ReactNode
}) {
  return (
    <section className={`card rede-bloco${largo ? ' rede-bloco-largo' : ''}${perigo ? ' sistema-perigo' : ''}`} aria-label={titulo}>
      <div className="rede-bloco-topo">
        <h2 className="overline">{titulo}</h2>
        {acoes && <div className="rede-bloco-acoes">{acoes}</div>}
      </div>
      {children}
    </section>
  )
}

/** O modal de um bloco: o título (nome acessível) e o formulário. */
function Janela({ titulo, onFechar, travado, children, largura = 520 }: {
  titulo: string; onFechar: () => void; travado?: boolean; children: ReactNode; largura?: number
}) {
  return (
    <JanelaModal onFechar={onFechar} rotulo={titulo} largura={largura} travado={travado} fechaNoFundo={false}>
      <div className="sistema-janela">
        <div className="sistema-janela-topo">
          <h2>{titulo}</h2>
          <button type="button" className="btn-ghost" onClick={onFechar} disabled={travado} aria-label="Fechar"><X size={15} /></button>
        </div>
        {children}
      </div>
    </JanelaModal>
  )
}

type Aberta = null | 'plano' | 'adicionais' | 'condicoes' | 'teste' | 'em-dia' | 'cancelar' | 'cobranca' | 'dados'

export function BlocosDaRede({ tenantId, rede, dados, assinatura, nomeDoPlano, faturas, planos, asaasPronto }: {
  tenantId: string
  rede: { planStatus: string | null; trialEndsAt: string | null; emAtrasoDesde: string | null; temDocumento: boolean; ativa: boolean; desligadaMotivo: string | null }
  dados: { nome: string; documento: string; email: string; telefone: string }
  assinatura: AssinaturaParaBlocos | null
  nomeDoPlano: string | null
  faturas: Fatura[]
  planos: { id: string; nome: string; valorCentavos: number; ativo: boolean }[]
  asaasPronto: boolean
}) {
  const router = useRouter()
  const [aberta, setAberta] = useState<Aberta>(null)
  const [planoId, setPlanoId] = useState(assinatura?.planoId ?? '')
  const [valor, setValor] = useState(assinatura ? campoDeReais(assinatura.valorCentavos) : '')
  const [teste, setTeste] = useState(rede.trialEndsAt ? rede.trialEndsAt.slice(0, 10) : hojeMais(14))
  const [vencimento, setVencimento] = useState(() => vencimentoSugerido(rede.trialEndsAt))
  const [motivo, setMotivo] = useState('')
  const [pendente, iniciar] = useTransition()

  const fechar = () => { setAberta(null); setMotivo('') }
  function rodar(f: () => Promise<Res>, ok: string, fecharAoTerminar = true) {
    iniciar(async () => {
      const r = await f()
      if (!r.ok) { toast.error(r.error); return }
      toast.success(ok)
      if (fecharAoTerminar) fechar()
      router.refresh()
    })
  }
  function salvarPlano() {
    const centavos = centavosDe(valor)
    if (centavos == null) { toast.error('Valor inválido.'); return }
    rodar(() => definirAssinatura(tenantId, { planoId: planoId || null, valorCentavos: centavos }), 'Plano e valor salvos.')
  }

  const cancelada = rede.planStatus === 'canceled'
  const temPlano = !!assinatura?.planoId
  const bruto = assinatura ? assinatura.valorCentavos + totalDosAdicionais(assinatura.adicionais) : 0
  const condicoes = assinatura ? ITENS_DA_ASSINATURA.filter(i => assinatura.condicoes[i]) : []
  const w = assinatura?.adicionais.whatsapp
  const c = assinatura?.adicionais.copilot

  return (
    <div className="rede-blocos">
      {/* ── Assinatura ───────────────────────────────────────────── */}
      <Bloco titulo="Assinatura" largo acoes={<>
        {temPlano && (
          <button type="button" className="btn-ghost" disabled={pendente}
            onClick={() => rodar(() => aplicarPlanoAtual(tenantId), 'Plano aplicado à rede.', false)}>
            Aplicar a versão atual do plano
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={() => setAberta('plano')}>Mudar plano ou valor</button>
      </>}>
        <div className="rede-resumo">
          <div>
            <p className="rede-resumo-rotulo">Plano</p>
            <p className="rede-resumo-valor">{nomeDoPlano ?? 'Sem plano'}{assinatura && <span className="suporte-texto-fraco"> · {reaisDe(assinatura.valorCentavos)} por mês</span>}</p>
          </div>
          <div>
            <p className="rede-resumo-rotulo">Mensalidade</p>
            <p className="rede-resumo-valor">
              Total por mês: <strong>{reaisDe(assinatura?.totalCentavos ?? 0)}</strong>
              {assinatura && bruto !== assinatura.totalCentavos && <span className="suporte-texto-fraco"> (preço cheio: {reaisDe(bruto)})</span>}
            </p>
          </div>
        </div>
        <p className="suporte-texto-fraco">O que pode usar: {resumirRecursos(assinatura?.recursos ?? null)}</p>
        {temPlano && <p className="suporte-texto-fraco">A rede guarda o plano como era quando o recebeu; mudou o plano no catálogo, use &ldquo;Aplicar a versão atual do plano&rdquo;.</p>}
      </Bloco>

      {/* ── Adicionais ───────────────────────────────────────────── */}
      <Bloco titulo="Adicionais" acoes={temPlano && (
        <button type="button" className="btn-secondary" onClick={() => setAberta('adicionais')}>Editar adicionais</button>
      )}>
        {!temPlano ? <p className="suporte-texto-fraco">Sem plano, não há adicional a contratar.</p> : (
          <ul className="rede-lista">
            <li>Conexões de WhatsApp: {w ? <strong>{w.quantidade} × {reaisDe(w.valor_centavos)}</strong> : 'nenhuma'}</li>
            <li>Copilot avulso: {c ? <strong>contratado · {reaisDe(c.valor_centavos)}</strong> : 'não contratado'}</li>
          </ul>
        )}
      </Bloco>

      {/* ── Cortesia e desconto ──────────────────────────────────── */}
      <Bloco titulo="Cortesia e desconto" acoes={temPlano && (
        <button type="button" className="btn-secondary" onClick={() => setAberta('condicoes')}>Dar cortesia ou desconto</button>
      )}>
        {!temPlano ? <p className="suporte-texto-fraco">Defina o plano antes de dar cortesia ou desconto.</p>
          : condicoes.length === 0 ? <p className="suporte-texto-fraco">Nenhuma: tudo no preço normal.</p> : (
            <ul className="rede-lista">
              {condicoes.map(i => <li key={i}>{ROTULO_DO_ITEM[i]}: <strong>{descreverCondicao(assinatura!.condicoes[i]!)}</strong></li>)}
            </ul>
          )}
      </Bloco>

      {/* ── Situação ─────────────────────────────────────────────── */}
      <Bloco titulo="Situação" acoes={<>
        {!cancelada && <button type="button" className="btn-ghost" onClick={() => setAberta('teste')}>Estender teste</button>}
        {!cancelada && rede.planStatus !== 'active' && <button type="button" className="btn-secondary" onClick={() => setAberta('em-dia')}>Marcar como em dia</button>}
        {!cancelada
          ? <button type="button" className="btn-ghost" onClick={() => setAberta('cancelar')}>Cancelar assinatura</button>
          : <button type="button" className="btn-secondary" disabled={pendente} onClick={() => rodar(() => reabrirAssinatura(tenantId), 'Assinatura reaberta.', false)}>Reabrir assinatura</button>}
      </>}>
        <p className="suporte-texto">
          {rede.planStatus === 'trial' && <>Em teste até <strong>{dia(rede.trialEndsAt)}</strong>.</>}
          {rede.planStatus === 'active' && (assinatura?.cobranca === 'cortesia' || (temPlano && assinatura?.totalCentavos === 0)
            ? <>Em dia — <strong>rede de cortesia</strong>, sem mensalidade.</>
            : <>Em dia{assinatura?.proximoVencimento ? <> · próximo vencimento <strong>{dia(assinatura.proximoVencimento)}</strong></> : null}.</>)}
          {rede.planStatus === 'past_due' && <>Em atraso desde <strong>{dia(rede.emAtrasoDesde)}</strong> — suspende sozinha ao fim da carência.</>}
          {rede.planStatus === 'suspended' && <>Suspensa por atraso desde <strong>{dia(rede.emAtrasoDesde)}</strong>. Volta sozinha quando pagar.</>}
          {cancelada && <>Cancelada.</>}
        </p>
      </Bloco>

      {/* ── Cobrança no Asaas ────────────────────────────────────── */}
      <Bloco titulo="Cobrança no Asaas" acoes={
        asaasPronto && assinatura?.cobranca === 'ativa' ? (
          <button type="button" className="btn-ghost" disabled={pendente}
            onClick={() => rodar(async () => { const r = await sincronizarComOAsaas(tenantId); return r.ok ? { ok: true } : r }, 'Faturas sincronizadas.', false)}>
            Sincronizar faturas
          </button>
        ) : asaasPronto && assinatura && assinatura.totalCentavos > 0 && rede.temDocumento && !cancelada && assinatura.cobranca !== 'cortesia' ? (
          <button type="button" className="btn-primary" onClick={() => setAberta('cobranca')}>Ligar cobrança</button>
        ) : null
      }>
        <p className="suporte-texto">
          {!asaasPronto ? 'O Asaas ainda não está configurado (Configurações → Integração com o Asaas).'
            : assinatura?.cobranca === 'ativa' ? 'Ligada — mensal; a clínica escolhe Pix, boleto ou cartão.'
            : temPlano && assinatura?.totalCentavos === 0 ? 'Rede de cortesia: nada a cobrar. A cobrança volta sozinha quando houver valor.'
            : !assinatura || assinatura.totalCentavos <= 0 ? 'Defina o plano e o valor para ligar a cobrança.'
            : !rede.temDocumento ? 'A rede precisa de CPF ou CNPJ (Dados da rede) para ser cobrada.'
            : cancelada ? 'Reabra a assinatura para ligar a cobrança de novo.'
            : 'Desligada: a rede não está sendo cobrada.'}
        </p>
      </Bloco>

      {/* ── Faturas ──────────────────────────────────────────────── */}
      {faturas.length > 0 && (
        <section className="card rede-bloco rede-bloco-largo" aria-label="Faturas" style={{ padding: 0, overflow: 'hidden' }}>
          <h2 className="overline suporte-secao-titulo">Faturas</h2>
          <table className="cards-mobile suporte-tabela">
            <thead><tr><th>Vencimento</th><th>Valor</th><th>Situação</th><th>Pago em</th><th></th></tr></thead>
            <tbody>
              {faturas.map(f => (
                <tr key={f.id}>
                  <td data-label="Vencimento" data-par>{dia(f.vencimento)}</td>
                  <td data-label="Valor" data-par>{reaisDe(f.valorCentavos)}</td>
                  <td data-label="Situação" data-par>{f.removida ? 'Removida' : ROTULO_DA_FATURA[f.situacao] ?? f.situacao}</td>
                  <td data-label="Pago em" data-par>{f.pagoEm ? dia(f.pagoEm) : '—'}</td>
                  <td data-label="">{f.url && <a href={f.url} target="_blank" rel="noreferrer" className="suporte-voltar">Fatura ↗</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ── Dados da rede ────────────────────────────────────────── */}
      <Bloco titulo="Dados da rede" acoes={<button type="button" className="btn-secondary" onClick={() => setAberta('dados')}>Editar dados</button>}>
        <dl className="rede-dados">
          <dt>Nome</dt><dd>{dados.nome}</dd>
          <dt>CPF ou CNPJ</dt><dd>{dados.documento || '—'}</dd>
          <dt>E-mail</dt><dd>{dados.email}</dd>
          <dt>Telefone</dt><dd>{dados.telefone || '—'}</dd>
        </dl>
      </Bloco>

      {/* ── Acesso ───────────────────────────────────────────────── */}
      <Bloco titulo="Acesso" perigo>
        <AcessoDaRede tenantId={tenantId} ativa={rede.ativa} motivo={rede.desligadaMotivo} />
      </Bloco>

      {/* ── Os modais ────────────────────────────────────────────── */}
      {aberta === 'plano' && (
        <Janela titulo="Plano e valor" onFechar={fechar} travado={pendente}>
          <label className="suporte-campo"><span className="field-label">Plano</span>
            <select className="filtro-select" value={planoId} onChange={e => {
              setPlanoId(e.target.value)
              const p = planos.find(x => x.id === e.target.value)
              if (p) setValor(campoDeReais(p.valorCentavos))
            }}>
              <option value="">Sem plano</option>
              {planos.filter(p => p.ativo || p.id === assinatura?.planoId).map(p => (
                <option key={p.id} value={p.id}>{p.nome} · {reaisDe(p.valorCentavos)}{p.ativo ? '' : ' (desativado)'}</option>
              ))}
            </select>
          </label>
          <label className="suporte-campo"><span className="field-label">Valor mensal desta rede (R$)</span>
            <input className="field" value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" />
          </label>
          <p className="suporte-texto-fraco">O valor pode ser especial (diferente do plano). Trocar de plano traz o que ele inclui e tira a condição do plano antigo.</p>
          <div className="sistema-janela-acoes">
            <button type="button" className="btn-ghost" onClick={fechar} disabled={pendente}>Cancelar</button>
            <button type="button" className="btn-primary" disabled={pendente} onClick={salvarPlano}>{pendente ? 'Salvando…' : 'Salvar plano e valor'}</button>
          </div>
        </Janela>
      )}
      {aberta === 'adicionais' && assinatura && (
        <Janela titulo="Adicionais" onFechar={fechar} largura={640}>
          <AdicionaisDaRede tenantId={tenantId} recursos={assinatura.recursos} oferta={assinatura.oferta} adicionais={assinatura.adicionais}
            valorCentavos={assinatura.valorCentavos} totalCentavos={assinatura.totalCentavos} />
        </Janela>
      )}
      {aberta === 'condicoes' && assinatura && (
        <Janela titulo="Cortesia e desconto" onFechar={fechar} largura={680}>
          <CondicoesDaRede tenantId={tenantId} valorCentavos={assinatura.valorCentavos} adicionais={assinatura.adicionais} condicoes={assinatura.condicoes} />
        </Janela>
      )}
      {aberta === 'teste' && (
        <Janela titulo="Estender teste" onFechar={fechar} travado={pendente}>
          <label className="suporte-campo"><span className="field-label">Teste até</span>
            <input className="field" type="date" value={teste} onChange={e => setTeste(e.target.value)} />
          </label>
          <p className="suporte-texto-fraco">A rede volta a &ldquo;em teste&rdquo; até a data.</p>
          <div className="sistema-janela-acoes">
            <button type="button" className="btn-ghost" onClick={fechar} disabled={pendente}>Cancelar</button>
            <button type="button" className="btn-primary" disabled={pendente} onClick={() => rodar(() => estenderTeste(tenantId, teste), 'Teste estendido.')}>Estender teste até a data</button>
          </div>
        </Janela>
      )}
      {(aberta === 'em-dia' || aberta === 'cancelar') && (
        <Janela titulo={aberta === 'em-dia' ? 'Marcar como em dia' : 'Cancelar assinatura'} onFechar={fechar} travado={pendente}>
          <label className="suporte-campo"><span className="field-label">Motivo (fica registrado)</span>
            <input className="field" value={motivo} onChange={e => setMotivo(e.target.value)} aria-label="Motivo" />
          </label>
          {aberta === 'cancelar' && <p className="suporte-texto-fraco">Cancelar encerra a cobrança no Asaas e bloqueia a rede (a clínica vê &ldquo;Assinatura cancelada&rdquo;).</p>}
          <div className="sistema-janela-acoes">
            <button type="button" className="btn-ghost" onClick={fechar} disabled={pendente}>Voltar</button>
            <button type="button" className="btn-primary" disabled={pendente || motivo.trim().length < 3}
              onClick={() => aberta === 'em-dia'
                ? rodar(() => marcarEmDia(tenantId, motivo), 'Assinatura em dia.')
                : rodar(() => cancelarAssinatura(tenantId, motivo), 'Assinatura cancelada.')}>
              {aberta === 'em-dia' ? 'Marcar como em dia' : 'Cancelar assinatura'}
            </button>
          </div>
        </Janela>
      )}
      {aberta === 'cobranca' && (
        <Janela titulo="Ligar cobrança" onFechar={fechar} travado={pendente}>
          <label className="suporte-campo"><span className="field-label">Primeiro vencimento</span>
            <input className="field" type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} />
          </label>
          <p className="suporte-texto-fraco">Mensal, de {reaisDe(assinatura?.totalCentavos ?? 0)}; a clínica escolhe Pix, boleto ou cartão.</p>
          <div className="sistema-janela-acoes">
            <button type="button" className="btn-ghost" onClick={fechar} disabled={pendente}>Cancelar</button>
            <button type="button" className="btn-primary" disabled={pendente} onClick={() => rodar(() => ativarCobrancaNoAsaas(tenantId, vencimento), 'Cobrança ligada no Asaas.')}>Ligar cobrança</button>
          </div>
        </Janela>
      )}
      {aberta === 'dados' && (
        <Janela titulo="Dados da rede" onFechar={fechar}>
          <DadosDaRede tenantId={tenantId} inicial={dados} onSalvo={fechar} />
        </Janela>
      )}
    </div>
  )
}

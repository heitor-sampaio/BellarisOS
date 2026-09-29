'use client'

import { useState, useTransition } from 'react'
import { Loader2, Star } from 'lucide-react'
import { SegSelect } from '@/components/shared/seg-select'
import { ajustarPontos, extratoDoCliente } from '@/actions/fidelidade'
import { erroParaTela } from '@/lib/erro-na-tela'
import { formatarPontos, rotuloDoLancamento } from '@/lib/fidelidade/formato'
import type { FidelidadeDoPerfil, LinhaDoExtrato } from '@/lib/fidelidade/leitura'
import { VouchersDoCliente } from '@/components/branch/vouchers-do-cliente'

/**
 * Fidelidade na ficha do cliente: saldo, extrato e ajuste manual.
 *
 * Só aparece com o programa ligado na rede e o módulo no cargo (quem decide é
 * `fidelidadeDoPerfil`, no servidor). O saldo é a soma do extrato; quem dá ponto
 * é o pagamento (gatilho) e o ajuste da equipe, sempre com motivo.
 */
export function FidelidadeDoCliente({
  clientId, fidelidade, branches, unidadePadrao,
}: {
  clientId:      string
  fidelidade:    FidelidadeDoPerfil
  branches:      { id: string; name: string }[]
  unidadePadrao: string
}) {
  const [saldo,   setSaldo]   = useState(fidelidade.saldo)
  const [linhas,  setLinhas]  = useState<LinhaDoExtrato[]>(fidelidade.extrato.linhas)
  const [temMais, setTemMais] = useState(fidelidade.extrato.temMais)
  const [carregando, iniciarCarga] = useTransition()
  const [ajustando, setAjustando] = useState(false)
  const [erroDaLista, setErroDaLista] = useState<string | null>(null)

  function recarregar() {
    iniciarCarga(async () => {
      try {
        const r = await extratoDoCliente(clientId)
        if (!r) return
        setSaldo(r.saldo); setLinhas(r.linhas); setTemMais(r.temMais); setErroDaLista(null)
      } catch (e) {
        setErroDaLista(erroParaTela(e, 'Não foi possível atualizar o extrato.'))
      }
    })
  }

  function carregarMais() {
    const ultima = linhas[linhas.length - 1]
    if (!ultima) return
    iniciarCarga(async () => {
      try {
        const r = await extratoDoCliente(clientId, ultima.created_at)
        if (!r) return
        setLinhas(prev => [...prev, ...r.linhas.filter(l => !prev.some(p => p.id === l.id))])
        setTemMais(r.temMais)
      } catch (e) {
        setErroDaLista(erroParaTela(e, 'Não foi possível carregar o extrato.'))
      }
    })
  }

  return (
    <section className="card" data-testid="fidelidade-do-cliente"
      style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Star size={16} style={{ color: 'var(--brand)', flexShrink: 0 }} />
          <div>
            <p className="overline">Fidelidade</p>
            <p data-testid="saldo-de-pontos" style={{
              fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', letterSpacing: '-0.02em',
              color: saldo < 0 ? 'var(--danger)' : 'var(--text)',
            }}>
              {formatarPontos(saldo)}
            </p>
            {fidelidade.vencendo > 0 && (
              <p data-testid="pontos-vencendo" style={{ fontSize: 'var(--text-2xs)', color: 'var(--warning)', fontWeight: 700 }}>
                {formatarPontos(fidelidade.vencendo)} vencem nos próximos 30 dias
              </p>
            )}
            {fidelidade.porUnidade && fidelidade.porUnidade.length > 0 && (
              <p data-testid="saldo-por-unidade" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                {fidelidade.porUnidade.map(u => `${u.nome}: ${formatarPontos(u.saldo)}`).join(' · ')}
              </p>
            )}
            {saldo < 0 && (
              <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--danger)' }}>
                Saldo negativo: um pagamento que gerou pontos foi estornado depois de os pontos serem usados.
              </p>
            )}
          </div>
        </div>
        {fidelidade.podeAjustar && !ajustando && (
          <button type="button" className="btn-ghost" onClick={() => setAjustando(true)}>
            Ajustar pontos
          </button>
        )}
      </div>

      {ajustando && (
        <FormularioDeAjuste
          clientId={clientId}
          branches={branches}
          unidadePadrao={unidadePadrao}
          onCancelar={() => setAjustando(false)}
          onFeito={() => { setAjustando(false); recarregar() }}
        />
      )}

      <VouchersDoCliente
        clientId={clientId}
        saldo={saldo}
        recompensas={fidelidade.recompensas}
        inicial={fidelidade.vouchers}
        podeGerenciar={fidelidade.podeAjustar}
        unidade={unidadePadrao}
        onMudouSaldo={recarregar}
      />

      <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
        {linhas.length === 0 ? (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
            Nenhum ponto ainda. Os pontos entram quando um pagamento do cliente é recebido.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column' }} aria-label="Extrato de pontos">
            {linhas.map(l => (
              <li key={l.id} data-testid="linha-do-extrato" style={{
                display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start',
                padding: '9px 0', borderBottom: '1px solid var(--hairline)',
              }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>
                    {rotuloDoLancamento(l.kind, l.description)}
                  </p>
                  <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
                    {l.description}
                  </p>
                  <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                    {new Date(l.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    {l.branch_name && ` · ${l.branch_name}`}
                    {l.autor && ` · por ${l.autor}`}
                    {l.expires_at && l.points > 0 && ` · vence em ${new Date(l.expires_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`}
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
        {erroDaLista && (
          <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', marginTop: 8 }}>{erroDaLista}</p>
        )}
        {temMais && (
          <button type="button" className="btn-ghost" onClick={carregarMais} disabled={carregando} style={{ marginTop: 10 }}>
            {carregando ? <><Loader2 size={14} className="animate-spin" /> Carregando…</> : 'Carregar mais'}
          </button>
        )}
      </div>
    </section>
  )
}

function FormularioDeAjuste({
  clientId, branches, unidadePadrao, onCancelar, onFeito,
}: {
  clientId:      string
  branches:      { id: string; name: string }[]
  unidadePadrao: string
  onCancelar:    () => void
  onFeito:       () => void
}) {
  const [sentido, setSentido] = useState<'CREDITO' | 'DEBITO'>('CREDITO')
  const [pontos,  setPontos]  = useState('')
  const [motivo,  setMotivo]  = useState('')
  const [unidade, setUnidade] = useState(unidadePadrao)
  const [erro,    setErro]    = useState<string | null>(null)
  const [salvando, iniciar]   = useTransition()

  function salvar() {
    setErro(null)
    const n = Number(pontos)
    if (!Number.isInteger(n) || n <= 0) { setErro('Informe um número inteiro de pontos, maior que zero.'); return }
    if (motivo.trim().length < 3)       { setErro('O motivo do ajuste é obrigatório.'); return }
    iniciar(async () => {
      try {
        const res = await ajustarPontos({
          clientId, branchId: unidade, pontos: sentido === 'CREDITO' ? n : -n, motivo: motivo.trim(),
        })
        if (res.error) setErro(res.error)
        else onFeito()
      } catch (e) {
        setErro(erroParaTela(e, 'Não foi possível ajustar os pontos.'))
      }
    })
  }

  return (
    <div data-testid="formulario-de-ajuste" style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 'var(--radius-row)', padding: 14,
    }}>
      <SegSelect
        options={[{ key: 'CREDITO', label: 'Creditar' }, { key: 'DEBITO', label: 'Debitar' }]}
        value={sentido}
        onSelect={k => setSentido(k as 'CREDITO' | 'DEBITO')}
        ariaLabel="Creditar ou debitar pontos"
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>Pontos</span>
          <input name="pontos" className="field" type="number" min={1} step={1} inputMode="numeric"
            value={pontos} onChange={e => setPontos(e.target.value)} />
        </label>
        {branches.length > 1 && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>Unidade</span>
            <select name="unidade" className="filtro-select" value={unidade} onChange={e => setUnidade(e.target.value)}>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>
          Motivo <span style={{ color: 'var(--brand)' }}>*</span>
        </span>
        <input name="motivo" className="field" value={motivo} onChange={e => setMotivo(e.target.value)}
          placeholder="Ex.: cortesia de aniversário, correção de lançamento" />
      </label>
      {erro && (
        <p role="alert" style={{
          fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--danger)',
          background: 'var(--danger-soft)', border: '1px solid var(--danger-border)',
          borderRadius: 'var(--radius-row)', padding: '8px 12px',
        }}>
          {erro}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>
          {salvando ? <><Loader2 size={14} className="animate-spin" /> Salvando…</> : 'Salvar ajuste'}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancelar} disabled={salvando}>Cancelar</button>
      </div>
    </div>
  )
}

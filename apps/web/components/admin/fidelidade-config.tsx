'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { SegSelect } from '@/components/shared/seg-select'
import { salvarConfigFidelidade } from '@/actions/fidelidade'
import { erroParaTela } from '@/lib/erro-na-tela'
import type { ConfigFidelidade, ModoDeGanho, BaseDaComissao } from '@/lib/fidelidade/config'

/**
 * Configurações → Fidelidade: a rede liga o programa e escolhe as regras.
 *
 * O programa é da REDE e nasce desligado (decisão do Heitor, 2026-09-28).
 * Desligado, nada de pontos aparece em lugar nenhum — nem para a equipe, nem
 * para o cliente. O texto de cada escolha fica à vista: o que importa é a
 * consequência, não o rótulo.
 */

const MODOS: { key: ModoDeGanho; label: string; explicacao: string }[] = [
  {
    key: 'POR_REAL', label: 'Por real pago',
    explicacao: 'O cliente ganha pontos sobre o valor que efetivamente pagou. Atendimento concluído e não pago não gera ponto; estornar o pagamento tira os pontos de volta.',
  },
  {
    key: 'POR_PROCEDIMENTO', label: 'Por procedimento',
    explicacao: 'Cada procedimento vale uma quantidade fixa de pontos, definida no cadastro dele. Bom para destacar o que a clínica quer vender mais. Procedimento sem pontos cadastrados não gera ponto.',
  },
]

const COMISSAO: { key: BaseDaComissao; label: string; explicacao: string }[] = [
  {
    key: 'PRECO', label: 'Sobre o preço',
    explicacao: 'Quando o cliente usar pontos como desconto, a comissão do profissional continua sobre o preço do atendimento. O desconto é custo da clínica.',
  },
  {
    key: 'VALOR_PAGO', label: 'Sobre o valor pago',
    explicacao: 'Quando o cliente usar pontos como desconto, a comissão cai na mesma proporção. O profissional divide o custo do programa.',
  },
]

export function FidelidadeConfig({ inicial, podeEditar }: { inicial: ConfigFidelidade; podeEditar: boolean }) {
  const [ligado,   setLigado]   = useState(inicial.enabled)
  const [modo,     setModo]     = useState<ModoDeGanho>(inicial.earn_mode)
  const [taxa,     setTaxa]     = useState(String(inicial.points_per_real).replace('.', ','))
  const [comissao, setComissao] = useState<BaseDaComissao>(inicial.commission_base)
  const [erro,     setErro]     = useState<string | null>(null)
  const [salvo,    setSalvo]    = useState(false)
  const [salvando, iniciar]     = useTransition()

  useEffect(() => {
    if (!salvo) return
    const id = setTimeout(() => setSalvo(false), 4000)
    return () => clearTimeout(id)
  }, [salvo])

  function salvar() {
    setErro(null)
    setSalvo(false)
    iniciar(async () => {
      try {
        const res = await salvarConfigFidelidade({
          enabled:         ligado,
          earn_mode:       modo,
          points_per_real: taxa.replace(/\./g, '').replace(',', '.'),
          commission_base: comissao,
        })
        if (res.error) setErro(res.error)
        else setSalvo(true)
      } catch (e) {
        setErro(erroParaTela(e, 'Não foi possível salvar.'))
      }
    })
  }

  const modoAtual     = MODOS.find(m => m.key === modo)!
  const comissaoAtual = COMISSAO.find(c => c.key === comissao)!

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
      aria-labelledby="titulo-fidelidade">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 id="titulo-fidelidade"
            style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
            Programa de fidelidade
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 3, maxWidth: 520 }}>
            O cliente acumula pontos a cada pagamento. Desligado, nada de pontos aparece — nem para a equipe, nem para o cliente.
          </p>
        </div>
        <button
          type="button"
          className={ligado ? 'filtro-toggle is-ativo' : 'filtro-toggle'}
          aria-pressed={ligado}
          disabled={!podeEditar}
          onClick={() => setLigado(v => !v)}
        >
          {ligado ? 'Programa ligado' : 'Programa desligado'}
        </button>
      </div>

      <Bloco titulo="Como o cliente ganha pontos">
        {podeEditar ? (
          <SegSelect
            options={MODOS.map(m => ({ key: m.key, label: m.label }))}
            value={modo}
            onSelect={k => setModo(k as ModoDeGanho)}
            ariaLabel="Como o cliente ganha pontos"
          />
        ) : (
          <strong style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{modoAtual.label}</strong>
        )}
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', lineHeight: 1.5 }}>
          {modoAtual.explicacao}
        </p>

        {modo === 'POR_REAL' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 260 }}>
            <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
              Pontos por R$ 1 pago
            </span>
            <input
              name="points_per_real" className="field" inputMode="decimal"
              value={taxa} onChange={e => setTaxa(e.target.value)} disabled={!podeEditar}
            />
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
              Ex.: 1 = um atendimento de R$ 250 dá 250 pontos. Frações de ponto são descartadas.
            </span>
          </label>
        )}
        {modo === 'POR_PROCEDIMENTO' && (
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
            Os pontos de cada procedimento são definidos no cadastro dele, em Procedimentos.
          </p>
        )}
      </Bloco>

      <Bloco titulo="Comissão quando o cliente usa pontos">
        {podeEditar ? (
          <SegSelect
            options={COMISSAO.map(c => ({ key: c.key, label: c.label }))}
            value={comissao}
            onSelect={k => setComissao(k as BaseDaComissao)}
            ariaLabel="Base da comissão com desconto de fidelidade"
          />
        ) : (
          <strong style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{comissaoAtual.label}</strong>
        )}
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', lineHeight: 1.5 }}>
          {comissaoAtual.explicacao}
        </p>
      </Bloco>

      {erro && (
        <p role="alert" style={{
          fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--danger)',
          background: 'var(--danger-soft)', border: '1px solid var(--danger-border)',
          borderRadius: 'var(--radius-row)', padding: '8px 12px',
        }}>
          {erro}
        </p>
      )}

      {podeEditar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? <><Loader2 size={14} className="animate-spin" /> Salvando…</> : 'Salvar'}
          </button>
          {salvo && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--success)' }}>
              <Check size={14} /> Salvo
            </span>
          )}
        </div>
      )}
    </section>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
      <p className="overline">{titulo}</p>
      {children}
    </div>
  )
}

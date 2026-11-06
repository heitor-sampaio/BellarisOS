'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { X, PackagePlus, Loader2, Info } from 'lucide-react'
import { parseDinheiro, DINHEIRO_INVALIDO } from '@estetica-os/utils'
import { JanelaModal } from '@/components/shared/janela-modal'
import { trazerPacoteDeFora } from '@/actions/pacotes'
import { useEnvioUnico } from '@/lib/use-envio-unico'
import { contaDoPacoteDeFora } from '@/lib/pacotes/de-fora'

/**
 * "Trazer pacote de fora" (decisão 1 do Heitor sobre a 8ª simulação,
 * 2026-11-06: "concordo"): o saldo de um pacote que a cliente já tinha no
 * sistema de antes — procedimento, sessões totais, já usadas, validade e um
 * valor de referência opcional. A janela diz a conta antes de gravar
 * (princípio 3) e, sem o valor, que a comissão de execução é R$ 0 (princípio 4).
 * Não é venda: nada vai ao caixa, às Vendas, aos pontos nem à comissão de venda.
 */
export function TrazerPacoteDeFora({ clientId, procedimentos, unidades, unidadeAtual }: {
  clientId: string
  procedimentos: { id: string; name: string }[]
  /** As unidades da rede: com duas ou mais e sem a atual, a janela pergunta. */
  unidades: { id: string; name: string }[]
  /** A unidade da ficha (o portal da unidade, ou a única); vazia na ficha da rede com duas ou mais. */
  unidadeAtual: string
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button type="button" className="btn-ghost" onClick={() => setAberto(true)}
        style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <PackagePlus size={14} aria-hidden="true" /> Trazer pacote de fora
      </button>
      {aberto && (
        <JanelaTrazerPacote clientId={clientId} procedimentos={procedimentos} unidades={unidades}
          unidadeAtual={unidadeAtual} onFechar={() => setAberto(false)} />
      )}
    </>
  )
}

function JanelaTrazerPacote({ clientId, procedimentos, unidades, unidadeAtual, onFechar }: {
  clientId: string; procedimentos: { id: string; name: string }[]
  unidades: { id: string; name: string }[]; unidadeAtual: string; onFechar: () => void
}) {
  const router = useRouter()
  const envio = useEnvioUnico()
  const perguntaUnidade = !unidadeAtual && unidades.length > 1
  const [unidade, setUnidade] = useState(unidadeAtual || (unidades.length === 1 ? unidades[0]!.id : ''))
  const [procedimento, setProcedimento] = useState('')
  const [total, setTotal] = useState('')
  const [usadas, setUsadas] = useState('0')
  const [validade, setValidade] = useState('')
  const [valorTexto, setValorTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()

  const nTotal = Number(total)
  const nUsadas = usadas.trim() === '' ? 0 : Number(usadas)
  const valor = valorTexto.trim() ? parseDinheiro(valorTexto) : null
  const valorIlegivel = valor !== null && !Number.isFinite(valor)
  const conta = contaDoPacoteDeFora({ total: nTotal, usadas: nUsadas, valor: valorIlegivel ? null : valor })
  const usadasDemais = Number.isInteger(nTotal) && nTotal > 0 && nUsadas >= nTotal
  const pronto = !!procedimento && !!conta && !valorIlegivel && (!perguntaUnidade || !!unidade)

  function trazer() {
    if (!pronto) return
    setErro(null)
    startTransition(async () => {
      const r = await trazerPacoteDeFora({
        clientId, branchId: unidade || null, procedureId: procedimento, total: nTotal, usadas: nUsadas,
        valor: valorIlegivel ? null : valor, validade: validade || null, envio: envio.chave(),
      })
      if (r.error) { setErro(r.error); return }
      envio.renovar()
      toast.success('Pacote de antes registrado: as sessões restantes já se agendam como "Já pago".')
      onFechar()
      router.refresh()
    })
  }

  const rotulo = 'field-label'
  return (
    <JanelaModal rotulo="Trazer pacote de fora" onFechar={onFechar} fechaNoFundo={false} travado={pendente} largura={520}>
      <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Trazer pacote de fora</h2>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>
            O saldo de um pacote que a cliente já tinha antes do sistema. Não é uma venda.
          </p>
        </div>
        <button type="button" onClick={onFechar} aria-label="Fechar" disabled={pendente} className="btn-ghost" style={{ padding: 6 }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {perguntaUnidade && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className={rotulo}>Unidade</span>
            <select className="field" value={unidade} onChange={e => setUnidade(e.target.value)}>
              <option value="" disabled>Selecione a unidade…</option>
              {unidades.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span className={rotulo}>Procedimento</span>
          <select className="field" value={procedimento} onChange={e => setProcedimento(e.target.value)}>
            <option value="" disabled>Selecione o procedimento…</option>
            {procedimentos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className={rotulo}>Sessões do pacote</span>
            <input className="field" type="number" inputMode="numeric" min={1} max={100} value={total} onChange={e => setTotal(e.target.value)} placeholder="10" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className={rotulo}>Já usadas antes do sistema</span>
            <input className="field" type="number" inputMode="numeric" min={0} max={99} value={usadas} onChange={e => setUsadas(e.target.value)} placeholder="0" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className={rotulo}>Válido até (opcional)</span>
            <input className="field" type="date" value={validade} onChange={e => setValidade(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className={rotulo}>Valor de referência (opcional)</span>
            <input className="field" type="text" inputMode="decimal" value={valorTexto} onChange={e => setValorTexto(e.target.value)} placeholder="1.500,00" />
          </label>
        </div>
        {valorIlegivel && <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 600 }}>{DINHEIRO_INVALIDO}</p>}
        {usadasDemais && (
          <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 600 }}>
            As sessões já usadas têm de ser menos que o total: o pacote precisa ter sessão restante.
          </p>
        )}

        {conta && (
          <div data-conta-do-pacote-de-fora style={{
            display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 'var(--radius-field-token)',
            background: valor === null || valorIlegivel ? 'var(--warning-soft)' : 'var(--bg-app)',
            border: '1px solid var(--hairline)', fontSize: 'var(--text-sm-sz)', color: 'var(--text)', lineHeight: 1.5,
          }}>
            <Info size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 3, color: valor === null || valorIlegivel ? 'var(--warning)' : 'var(--text-muted)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontWeight: 700 }}>{conta.restantes}</span>
              <span>{conta.valor}</span>
              <span style={{ color: 'var(--text-muted)' }}>{conta.caixa}</span>
            </div>
          </div>
        )}

        {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn-ghost" onClick={onFechar} disabled={pendente}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={trazer} disabled={!pronto || pendente}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {pendente && <Loader2 size={14} className="animate-spin" />}
            Trazer pacote
          </button>
        </div>
      </div>
    </JanelaModal>
  )
}

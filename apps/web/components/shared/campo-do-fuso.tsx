'use client'

import { useState } from 'react'
import { FUSOS, FUSO_PADRAO, fusoPeloEstado, fusoValido, nomeDoFuso } from '@/lib/unidades/fuso'

/**
 * O "Fuso horário" da unidade (F62, o Heitor, 2026-11-11: "Não, deixa a
 * clinica configurar o seu fuso"). O padrão é o horário de Brasília.
 *
 * - `segue` (a unidade NOVA: o setup e o "Nova unidade"): o fuso acompanha o
 *   estado do CEP até a pessoa escolher um — e a tela diz que foi sugerido.
 * - `sugere` (a unidade que já existe): nada se move sozinho; com o estado de
 *   outro fuso, a tela diz qual seria e oferece "Usar este".
 *
 * O valor vai no formulário pelo `name` do seletor.
 */
export function CampoDoFuso({ id, nome = 'fuso', valorInicial, uf, cidade, modo }: {
  id: string
  nome?: string
  valorInicial?: string | null
  uf: string
  cidade?: string
  modo: 'segue' | 'sugere'
}) {
  const sugerido = fusoPeloEstado(uf, cidade)
  const [escolhido, setEscolhido] = useState<string | null>(modo === 'sugere' ? fusoValido(valorInicial) : null)
  const valor = escolhido ?? (modo === 'segue' ? sugerido : FUSO_PADRAO)

  const nota = modo === 'segue'
    ? (escolhido === null && uf && sugerido !== FUSO_PADRAO ? `Sugerido pelo estado (${uf.toUpperCase()}).` : null)
    : (uf && sugerido !== valor ? `Pelo estado (${uf.toUpperCase()}), o fuso seria o ${nomeDoFuso(sugerido)}.` : null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label className="overline" htmlFor={id}>Fuso horário</label>
      <select id={id} name={nome} className="field" value={valor} onChange={e => setEscolhido(e.target.value)}>
        {FUSOS.map(f => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
      </select>
      <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
        A agenda, o app da cliente, o “hoje”, o Fechamento do dia, os indicadores e os envios da unidade seguem este fuso.
      </span>
      {nota && (
        <span data-fuso-sugerido style={{
          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          fontSize: 'var(--text-xs-sz)', color: 'var(--text)',
        }}>
          {nota}
          {modo === 'sugere' && (
            <button type="button" className="btn-secondary" onClick={() => setEscolhido(sugerido)}>Usar este</button>
          )}
        </span>
      )}
    </div>
  )
}

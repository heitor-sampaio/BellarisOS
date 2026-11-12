'use client'

import { X, ShieldCheck } from 'lucide-react'
import type { LimitesDaAutomacao } from '@estetica-os/types'

/**
 * Os limites de bom comportamento da automação.
 *
 * Fica numa gaveta própria, e não enterrado num node, porque valem para o
 * FLUXO inteiro: dois nodes de mensagem no mesmo grafo não deveriam ter
 * horários de silêncio diferentes.
 *
 * Nascem preenchidos (21h–8h, três contatos por dia) e não vazios: uma
 * automação recém-criada não deveria depender de alguém lembrar de configurar
 * isto para não acordar cliente às três da manhã.
 *
 * O campo VAZIO desliga (C54/D16, F69): grava `null`, e a tela diz "Sem
 * silêncio" / "Sem teto". Antes o vazio virava `undefined`, sumia no JSON e o
 * padrão voltava — no motor e na tela reaberta.
 */
export function PainelDeLimites({
  limites, onChange, onFechar, somenteLeitura,
}: {
  limites:  LimitesDaAutomacao
  onChange: (l: LimitesDaAutomacao) => void
  onFechar: () => void
  somenteLeitura?: boolean
}) {
  const semSilencio = !limites.silencioDe || !limites.silencioAte
  const semTeto = !limites.tetoPorClienteDia
  return (
    <aside
      className="auto-gaveta"
      aria-label="Limites da automação"
      style={{
        width: 320, flexShrink: 0, background: 'var(--surface)',
        borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: '1px solid var(--hairline)', gap: 8,
      }}>
        <span style={{
          fontWeight: 'var(--weight-extrabold)', fontSize: 'var(--text-sm-sz)',
          display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <ShieldCheck size={15} /> Limites
        </span>
        <button type="button" onClick={onFechar} className="btn-ghost" aria-label="Fechar" style={{ padding: 4 }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.55 }}>
          Valem só para o que <strong>fala com o cliente</strong>. Avisar a
          equipe e anotar na oportunidade não acordam ninguém.
        </p>

        <div role="group" aria-labelledby="limites-silencio">
          <p id="limites-silencio" className="field-label" style={{ marginBottom: 5 }}>
            Não mandar mensagem entre
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="time" className="field" aria-label="Começa às" value={limites.silencioDe ?? ''}
              disabled={somenteLeitura}
              onChange={e => onChange({ ...limites, silencioDe: e.target.value || null })}
            />
            <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>e</span>
            <input
              type="time" className="field" aria-label="Termina às" value={limites.silencioAte ?? ''}
              disabled={somenteLeitura}
              onChange={e => onChange({ ...limites, silencioAte: e.target.value || null })}
            />
          </div>
          <p data-limite-silencio style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.5 }}>
            {semSilencio
              ? <><strong>Sem silêncio: a mensagem sai a qualquer hora.</strong> Para voltar a esperar a manhã, preencha os dois horários.</>
              : <>A mensagem não é descartada: ela <strong>espera</strong> o horário. Deixe os campos vazios para mandar a qualquer hora.</>}
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="limites-teto" style={{ display: 'block', marginBottom: 5 }}>
            No máximo, por cliente por dia
          </label>
          <input
            id="limites-teto" type="number" min={1} className="field"
            value={limites.tetoPorClienteDia ?? ''}
            disabled={somenteLeitura}
            onChange={e => onChange({
              ...limites,
              tetoPorClienteDia: e.target.value ? Number(e.target.value) : null,
            })}
          />
          <p data-limite-teto style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.5 }}>
            {semTeto
              ? <><strong>Sem teto:</strong> a automação fala com a mesma cliente quantas vezes o fluxo mandar.</>
              : <>Conta as execuções desta automação com a mesma cliente. Passou do
                teto, o fluxo para — esperar até amanhã acumularia a fila e
                mandaria tudo de uma vez. Deixe vazio para não ter teto.</>}
          </p>
        </div>
      </div>
    </aside>
  )
}

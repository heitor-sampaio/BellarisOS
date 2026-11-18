'use client'

import { X, ShieldCheck } from 'lucide-react'
import type { LimitesDaAutomacao } from '@estetica-os/types'
import { Dica } from '@/components/shared/dica'

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
          <ShieldCheck size={15} />
          <span>Limites</span>
          {/* As explicações moram nas dicas (2026-11-16); o estado ("Sem
              silêncio", "Sem teto") fica à vista. O rótulo da dica não diz
              "Limites": o botão da barra se acha por esse nome. */}
          <Dica rotulo="Para o que isto vale">
            Valem só para o que <strong>fala com o cliente</strong>. Avisar a
            equipe e anotar na oportunidade não acordam ninguém.
          </Dica>
        </span>
        <button type="button" onClick={onFechar} className="btn-ghost" aria-label="Fechar" style={{ padding: 4 }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div role="group" aria-labelledby="limites-silencio">
          <p className="field-label" style={{ marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span id="limites-silencio">Não mandar mensagem entre</span>
            <Dica rotulo="Como o silêncio funciona">
              {semSilencio
                ? <>Para voltar a esperar a manhã, preencha os dois horários.</>
                : <>A mensagem não é descartada: ela <strong>espera</strong> o horário. Deixe os campos vazios para mandar a qualquer hora.</>}
            </Dica>
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
          {semSilencio && (
            <p data-limite-silencio style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.5 }}>
              <strong>Sem silêncio: a mensagem sai a qualquer hora.</strong>
            </p>
          )}
          {/* D17 do levantamento ("a + c opcional", o Heitor, 2026-11-11):
              desligada por padrão. */}
          {!semSilencio && (
            <label data-madrugada-na-vespera style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
              <input
                type="checkbox" checked={!!limites.madrugadaNaVespera}
                disabled={somenteLeitura}
                onChange={e => onChange({ ...limites, madrugadaNaVespera: e.target.checked })}
              />
              <span>Se cair de madrugada, mandar na véspera às 20:00</span>
              <Dica rotulo="Como a véspera funciona">
                Vale para o lembrete que espera &quot;antes de&quot; uma data (o
                horário do agendamento). Se a hora dele cair no silêncio, ele
                sai às 20:00 da véspera em vez de esperar a manhã — quando o
                horário é antes do fim do silêncio, sem isso ele não sai. Com o
                silêncio começando antes das 20:00, ele espera a manhã.
              </Dica>
            </label>
          )}
        </div>

        <div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <label className="field-label" htmlFor="limites-teto">
              No máximo, por cliente por dia
            </label>
            <Dica rotulo="Como o teto funciona">
              Conta as execuções desta automação com a mesma cliente. Passou do
              teto, o fluxo para — esperar até amanhã acumularia a fila e
              mandaria tudo de uma vez. Deixe vazio para não ter teto.
            </Dica>
          </span>
          <input
            id="limites-teto" type="number" min={1} className="field"
            value={limites.tetoPorClienteDia ?? ''}
            disabled={somenteLeitura}
            onChange={e => onChange({
              ...limites,
              tetoPorClienteDia: e.target.value ? Number(e.target.value) : null,
            })}
          />
          {semTeto && (
            <p data-limite-teto style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.5 }}>
              <strong>Sem teto:</strong> a automação fala com a mesma cliente quantas vezes o fluxo mandar.
            </p>
          )}
        </div>
      </div>
    </aside>
  )
}

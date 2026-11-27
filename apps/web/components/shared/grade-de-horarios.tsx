'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import type { Horario } from '@/lib/agenda/horario'
import { gradeDoCheckout, aPartirDeAgora } from '@/lib/checkout/grade-de-horarios'
import { useFuso } from '@/components/shared/fuso'
import { useAgora } from '@/lib/use-agora'
import { Dica } from '@/components/shared/dica'

/**
 * A grade de horários de quem agenda pelo checkout do plano e pelas sessões
 * do plano (D8 da simulação de 2026-10-29): o horário de QUEM ATENDE naquele
 * dia — a unidade ∩ ela, sem a pausa e sem cortar a noite (`gradeDoCheckout`).
 * O fora do horário de quem atende (e a unidade fechada) não aparece (R15, o Heitor,
 * 26/11, na página de perguntas: "Não: quem está fora do horário também some
 * das listas (o encaixe só pelo campo de horário)"; era tracejado e se
 * escolhia): o encaixe vai pelo "Outro horário" (no Agendar, o campo de data e
 * hora), com o aviso de sempre.
 * Era uma grade fixa, 08:00–20:00, igual para toda unidade e profissional.
 * Hoje, só o que ainda não passou — também no "Outro horário" (A24 da 6ª
 * simulação: de madrugada, oferecia 00:00–04:00).
 */
export function GradeDeHorarios({
  data, horarioDaUnidade, horarioDoProfissional, nomeDoProfissional, duracaoMin, ocupado, selecionado, onEscolher, carregando, semOutroHorario = false, fuso: fusoDado,
}: {
  data:                  string
  /**
   * A duração do atendimento (D1 da 39ª; AG-07 e AG-10): só aparece o início
   * em que ele cabe INTEIRO no horário de quem atende — a mesma conta do app
   * da cliente. O que não cabe vai pelo encaixe, com o aviso.
   */
  duracaoMin:            number
  horarioDaUnidade:      Horario | null
  horarioDoProfissional: Horario | null
  nomeDoProfissional?:   string
  /**
   * Quem já ocupa o horário (o mesmo profissional), ou nulo: o agendamento, ou
   * o bloqueio dela (`rotulo` "Bloqueado · motivo" — D5 da 8ª simulação). O
   * horário ocupado não aparece na grade (R14).
   */
  ocupado:               (hora: string) => { clientName: string | null; rotulo?: string } | null
  selecionado:           string
  onEscolher:            (hora: string) => void
  carregando:            boolean
  /** Sem o "Outro horário (encaixe)": o modal Agendar já tem o campo de data e hora (A58 da 8ª). */
  semOutroHorario?:      boolean
  /** O fuso da unidade (F62); sem ele, o da tela (`useFuso`). */
  fuso?:                 string
}) {
  const fusoDaTela = useFuso()
  // A38 da 24ª: o relógio ANDA (de 30 em 30 s) — a grade aberta havia minutos
  // seguia oferecendo o horário que já passou. Antes do relógio do navegador,
  // a hora em que a grade abriu.
  const [abriuEm] = useState(() => Date.now())
  const agora = new Date(useAgora() ?? abriuEm)
  const limite = aPartirDeAgora(data, agora, fusoDado ?? fusoDaTela)
  const [erroDoEncaixe, setErroDoEncaixe] = useState<string | null>(null)
  const daJanela = gradeDoCheckout(horarioDaUnidade, horarioDoProfissional, data, limite, duracaoMin)
  // R14 (o Heitor, 26/11, na página de perguntas: "Horarios, salas e pessoas não
  // disponíveis não devem aparecer nas listas"): o horário ocupado ou bloqueado
  // SAI da grade — era riscado e desligado. E R15 ("Não: quem está fora do
  // horário também some das listas (o encaixe só pelo campo de horário)"): o
  // fora do horário de quem atende também sai — era tracejado, o encaixe.
  const doHorarioDela = daJanela.filter(h => h.doProfissional)
  const grade = doHorarioDela.filter(h => !ocupado(h.hora))
  // Ela atende no que resta do dia, mas nada livre comporta a duração (D1 da 39ª): "nenhum livre".
  const atendeNoQueResta = gradeDoCheckout(horarioDaUnidade, horarioDoProfissional, data, limite).some(h => h.doProfissional)
  const nenhumLivre = atendeNoQueResta && grade.length === 0
  const doDiaInteiro = gradeDoCheckout(horarioDaUnidade, horarioDoProfissional, data)
  const jaPassou = !!limite && !atendeNoQueResta && doDiaInteiro.some(h => h.doProfissional)
  const unidadeFechada = doDiaInteiro.length === 0
  const foraDaGrade = !!selecionado && !doHorarioDela.some(h => h.hora === selecionado)
  const quem = nomeDoProfissional?.trim() || 'quem atende'
  const encaixePor = semOutroHorario ? 'o campo de data e hora' : '“Outro horário”'

  return (
    <div data-grade-de-horarios style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span>Horários</span>
          {/* A explicação mora na dica (2026-11-16, "A explicação mora na dica"). */}
          {!carregando && grade.length > 0 && (
            <Dica rotulo="Como se lê a grade de horários">
              Só os horários livres de {quem}. Para um encaixe fora do horário, use {encaixePor}.
            </Dica>
          )}
        </p>
        {carregando && <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>carregando…</p>}
      </div>

      {!carregando && grade.length === 0 && (
        <p data-grade-sem-horario style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          {nenhumLivre
            ? `Nenhum horário livre de ${quem} neste dia: escolha outro dia.`
            : jaPassou
            ? `Os horários de hoje já passaram. Para um encaixe, use ${encaixePor}.`
            : unidadeFechada
            ? `A unidade não abre neste dia. Para um encaixe, use ${encaixePor}.`
            : `${quem === 'quem atende' ? 'Quem atende' : quem} não atende neste dia. Para um encaixe, use ${encaixePor}.`}
        </p>
      )}

      {!carregando && grade.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
          {grade.map(({ hora }) => {
            const sel    = selecionado === hora
            return (
              <button key={hora} type="button" onClick={() => onEscolher(hora)}
                data-horario={hora}
                aria-pressed={sel}
                style={{
                  padding: '8px 4px', borderRadius: 8, fontSize: 'var(--text-sm-sz)', fontWeight: 700,
                  cursor:     'pointer',
                  background: sel ? 'var(--brand)' : 'var(--surface)',
                  color:      sel ? 'var(--on-brand)' : 'var(--text)',
                  border:     sel ? '2px solid var(--brand)' : '1.5px solid var(--brand-soft-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                }}>
                {sel && <Check size={10} />}{hora}
              </button>
            )
          })}
        </div>
      )}

      {!semOutroHorario && (<>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>
        Outro horário (encaixe)
        <input
          type="time" className="field" step={300}
          aria-label="Outro horário (encaixe)"
          value={foraDaGrade ? selecionado : ''}
          onChange={e => {
            const v = e.target.value
            if (!v) return
            if (limite && v < limite) { setErroDoEncaixe(`Escolha a partir de ${limite}.`); return }
            setErroDoEncaixe(null)
            onEscolher(v)
          }}
          style={{ width: 'auto' }}
        />
      </label>
      {erroDoEncaixe && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erroDoEncaixe}</p>}
      </>)}
    </div>
  )
}

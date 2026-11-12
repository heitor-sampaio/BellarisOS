'use client'

import { BANDEIRAS, temBandeira } from '@/lib/financeiro/bandeiras'
import { AvisoDaTaxaDoDebito } from '@/components/shared/aviso-da-taxa'
import { useMaquininhas } from '@/components/shared/use-maquininhas'

/**
 * Os dados do cartão no pagamento (crédito e débito):
 * - "Qual maquininha?" (C75, F67) — só quando a rede tem MAIS DE UMA ativa;
 *   começa em "Escolha…", e a tela não deixa seguir sem ela
 *   (`faltaAMaquininha`). Com uma só, nada a perguntar: o banco põe a única.
 * - "Bandeira (opcional)" (r3-f13-01): vazia, "Não informada" — vale a taxa da
 *   maquininha; com a bandeira, a da bandeira se a maquininha cobra diferente
 *   nela.
 * Com `name`/`nameDaMaquininha`, vão no FormData do formulário.
 */
export function CampoDaBandeira({ metodo, valor, aoMudar, name, rotuloComoLabel = 'field-label', estiloDoRotulo, gap = 4, total, maquininha, aoMudarMaquininha, nameDaMaquininha }: {
  metodo: string | null | undefined
  valor: string
  aoMudar: (v: string) => void
  name?: string
  /** A classe do rótulo, para seguir o formulário em volta. */
  rotuloComoLabel?: string
  /** O estilo do rótulo, para o formulário que desenha os rótulos à mão (o Novo lançamento). */
  estiloDoRotulo?: React.CSSProperties
  gap?: number
  /** O valor no cartão: no DÉBITO, a taxa que vai valer e o líquido (A34 da 9ª). */
  total?: number
  /** A maquininha escolhida ('' = nenhuma ainda) e quem a muda (C75). */
  maquininha?: string
  aoMudarMaquininha?: (v: string) => void
  nameDaMaquininha?: string
}) {
  if (!temBandeira(metodo)) return null
  return (
    <>
      {aoMudarMaquininha && (
        <CampoDaMaquininha metodo={metodo} valor={maquininha ?? ''} aoMudar={aoMudarMaquininha} name={nameDaMaquininha}
          rotuloComoLabel={rotuloComoLabel} estiloDoRotulo={estiloDoRotulo} gap={gap} />
      )}
      <label style={{ display: 'flex', flexDirection: 'column', gap }}>
        <span className={rotuloComoLabel} style={estiloDoRotulo}>Bandeira (opcional)</span>
        <select className="field" name={name} aria-label="Bandeira" value={valor} onChange={e => aoMudar(e.target.value)}>
          <option value="">Não informada</option>
          {BANDEIRAS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        {/* A34 da 9ª: o débito diz a taxa que vai valer (a da bandeira, senão a da maquininha). */}
        {metodo === 'DEBIT_CARD' && <AvisoDaTaxaDoDebito bandeira={valor} total={total} maquininha={maquininha} />}
      </label>
    </>
  )
}

/**
 * "Qual maquininha?" (C75): só no cartão e só quando a rede tem MAIS DE UMA
 * ativa. Começa em "Escolha…"; a tela não segue sem ela (`useFaltaAMaquininha`).
 */
export function CampoDaMaquininha({ metodo, valor, aoMudar, name, rotuloComoLabel = 'field-label', estiloDoRotulo, gap = 4 }: {
  metodo: string | null | undefined
  valor: string
  aoMudar: (v: string) => void
  name?: string
  rotuloComoLabel?: string
  estiloDoRotulo?: React.CSSProperties
  gap?: number
}) {
  const leitura = useMaquininhas()
  if (!temBandeira(metodo) || (leitura?.lista.length ?? 0) <= 1) return null
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap }}>
      <span className={rotuloComoLabel} style={estiloDoRotulo}>Qual maquininha?</span>
      <select className="field" name={name} aria-label="Qual maquininha?" value={valor}
        onChange={e => aoMudar(e.target.value)} data-campo-da-maquininha>
        <option value="">Escolha…</option>
        {leitura!.lista.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
      </select>
    </label>
  )
}

/**
 * C75: com mais de uma maquininha, o cartão não segue sem "Qual maquininha?".
 * A mensagem para a tela, ou nula.
 */
export function useFaltaAMaquininha(metodo: string | null | undefined, maquininha: string | null | undefined): string | null {
  const leitura = useMaquininhas()
  if (!temBandeira(metodo) || (leitura?.lista.length ?? 0) <= 1) return null
  return maquininha ? null : 'Escolha a maquininha do cartão.'
}

'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SegSelect } from '@/components/shared/seg-select'
import { salvarConfigDeComissao, salvarTaxasDaMaquininha } from '@/actions/comissoes'
import type { ConfigDeComissao, TaxaDePagamento, MetodoComTaxa } from '@/lib/comissoes/config'

/**
 * Configurações → Comissões: como a comissão acontece na rede, a tabela de
 * taxas da maquininha e quem atende sem comissão configurada. As regras de
 * cada profissional (o padrão e as exceções por procedimento) ficam na Equipe.
 */

const MODOS = {
  ATENDIMENTO: { label: 'No atendimento', explicacao: 'A comissão nasce quando o atendimento é concluído, sobre o preço dele. A taxa da maquininha, se marcada abaixo, entra como ajuste quando o cliente paga. Se o pagamento for estornado, a comissão é estornada junto.' },
  PAGAMENTO:   { label: 'Quando o cliente paga', explicacao: 'A comissão só vale depois que o cliente paga, sobre o que ele pagou (sem pontos e voucher). No plano, cada sessão executada libera a comissão na proporção do que o plano já recebeu, e cada recebimento seguinte completa. A sessão de pacote libera na conclusão: o pacote é pago na venda.' },
} as const
const BASES = {
  PRECO:      { label: 'Sobre o preço', explicacao: 'Quando o cliente usa pontos ou voucher como desconto, a comissão continua sobre o preço do atendimento. O desconto é custo da clínica.' },
  VALOR_PAGO: { label: 'Sobre o valor pago', explicacao: 'Quando o cliente usa pontos ou voucher, a comissão cai na mesma proporção. O profissional divide o custo do programa.' },
} as const
const PERIODOS = {
  MENSAL:    { label: 'Mensal', explicacao: 'O financeiro fecha e paga as comissões uma vez por mês.' },
  QUINZENAL: { label: 'Quinzenal', explicacao: 'Dois fechamentos por mês: do dia 1 ao 15 e do 16 ao fim do mês.' },
  SEMANAL:   { label: 'Semanal', explicacao: 'Um fechamento por semana, de segunda a domingo.' },
} as const

const PARCELAS_DO_CREDITO = Array.from({ length: 11 }, (_, i) => i + 2)

/** Os campos de taxa são curtos: em grade, quantos couberem na linha. */
const grade = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 } as const

export function SettingsComissoes({ inicial, taxas, semRegra, podeEditar }: {
  inicial:    ConfigDeComissao
  taxas:      TaxaDePagamento[]
  /** Quem atende clientes e não tem comissão padrão configurada. */
  semRegra:   { id: string; nome: string }[]
  podeEditar: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ComoAcontece inicial={inicial} podeEditar={podeEditar} />
      <TabelaDeTaxas inicial={taxas} podeEditar={podeEditar} />
      <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="Comissão de cada profissional">
        <h2 style={titulo}>Comissão de cada profissional</h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', lineHeight: 1.5 }}>
          O percentual (ou valor fixo) de cada profissional e as exceções por procedimento se definem na Equipe, no botão de comissão de cada membro.
        </p>
        {semRegra.length > 0 ? (
          <div data-sem-regra style={{ padding: 12, borderRadius: 'var(--radius-field-token)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)' }}>
            <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)', color: 'var(--text)' }}>
              {semRegra.length === 1 ? 'Atende e não tem comissão configurada:' : `${semRegra.length} profissionais atendem e não têm comissão configurada:`}
            </p>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', marginTop: 4 }}>{semRegra.map(p => p.nome).join(', ')}.</p>
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 4 }}>Sem regra, o atendimento é concluído sem gerar comissão.</p>
          </div>
        ) : (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Todos os profissionais que atendem têm comissão configurada.</p>
        )}
        <Link href="/admin/team" className="btn-secondary" style={{ alignSelf: 'flex-start' }}>Abrir a equipe</Link>
      </div>
    </div>
  )
}

const titulo = { fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' } as const

function Bloco({ titulo: t, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
      <p className="overline">{t}</p>
      {children}
    </div>
  )
}

function ComoAcontece({ inicial, podeEditar }: { inicial: ConfigDeComissao; podeEditar: boolean }) {
  const router = useRouter()
  const [c, setC] = useState(inicial)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [salvando, iniciar] = useTransition()
  const mudar = <K extends keyof ConfigDeComissao>(k: K, v: ConfigDeComissao[K]) => { setC(atual => ({ ...atual, [k]: v })); setSalvo(false) }

  function salvar() {
    setErro(null)
    iniciar(async () => {
      const r = await salvarConfigDeComissao(c)
      if (r.error) { setErro(r.error); return }
      setSalvo(true)
      router.refresh()
    })
  }

  const texto = { fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', lineHeight: 1.5 } as const
  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }} aria-label="Como a comissão acontece">
      <div>
        <h2 style={titulo}>Como a comissão acontece</h2>
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
          Vale para a rede inteira, a partir dos próximos atendimentos concluídos: o que já foi concluído segue a regra de quando foi.
        </p>
      </div>

      <Bloco titulo="Quando a comissão vale">
        {podeEditar
          ? <SegSelect ariaLabel="Quando a comissão vale" value={c.modo} onSelect={k => mudar('modo', k as ConfigDeComissao['modo'])}
              options={(['ATENDIMENTO', 'PAGAMENTO'] as const).map(k => ({ key: k, label: MODOS[k].label }))} />
          : <strong style={{ fontSize: 'var(--text-sm-sz)' }}>{MODOS[c.modo].label}</strong>}
        <p style={texto}>{MODOS[c.modo].explicacao}</p>
      </Bloco>

      <Bloco titulo="O que sai da base da comissão">
        {([
          ['desconta_insumos', 'Custo dos insumos usados no atendimento'],
          ['desconta_taxa', 'Taxa da maquininha do pagamento (tabela abaixo)'],
        ] as const).map(([k, rotulo]) => (
          <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: podeEditar ? 'pointer' : 'default' }}>
            <input type="checkbox" checked={c[k]} disabled={!podeEditar} onChange={e => mudar(k, e.target.checked)}
              style={{ accentColor: 'var(--brand)', width: 16, height: 16 }} />
            <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{rotulo}</span>
          </label>
        ))}
        <p style={texto}>
          {c.desconta_insumos || c.desconta_taxa
            ? 'A comissão é calculada sobre o valor do atendimento menos o que estiver marcado acima.'
            : 'Nada é descontado: a comissão é sobre o valor cheio.'}
          {' '}Vale para a comissão em percentual; a de valor fixo não muda com taxa nem insumos.
        </p>
      </Bloco>

      <Bloco titulo="Quando o cliente usa pontos ou voucher">
        {c.modo === 'PAGAMENTO' ? (
          <p style={texto}>Com a comissão valendo quando o cliente paga, ela já é sobre o que ele pagou — o desconto de pontos ou voucher sai da base.</p>
        ) : (
          <>
            {podeEditar
              ? <SegSelect ariaLabel="Comissão quando o cliente usa pontos" value={c.base_com_pontos} onSelect={k => mudar('base_com_pontos', k as ConfigDeComissao['base_com_pontos'])}
                  options={(['PRECO', 'VALOR_PAGO'] as const).map(k => ({ key: k, label: BASES[k].label }))} />
              : <strong style={{ fontSize: 'var(--text-sm-sz)' }}>{BASES[c.base_com_pontos].label}</strong>}
            <p style={texto}>{BASES[c.base_com_pontos].explicacao}</p>
          </>
        )}
      </Bloco>

      <Bloco titulo="Fechamento das comissões">
        {podeEditar
          ? <SegSelect ariaLabel="Período do fechamento" value={c.periodo} onSelect={k => mudar('periodo', k as ConfigDeComissao['periodo'])}
              options={(['MENSAL', 'QUINZENAL', 'SEMANAL'] as const).map(k => ({ key: k, label: PERIODOS[k].label }))} />
          : <strong style={{ fontSize: 'var(--text-sm-sz)' }}>{PERIODOS[c.periodo].label}</strong>}
        <p style={texto}>{PERIODOS[c.periodo].explicacao}</p>
      </Bloco>

      {!podeEditar && <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>Quem muda é quem administra a rede.</p>}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      {podeEditar && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
          {salvo && <span role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)', fontWeight: 'var(--weight-semibold)' }}>Salvo.</span>}
          <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      )}
    </div>
  )
}

function TabelaDeTaxas({ inicial, podeEditar }: { inicial: TaxaDePagamento[]; podeEditar: boolean }) {
  const router = useRouter()
  const chave = (m: MetodoComTaxa, n: number) => `${m}/${n}`
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(inicial.map(t => [chave(t.metodo, t.parcelas), String(t.taxa_pct).replace('.', ',')])))
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [salvando, iniciar] = useTransition()

  function salvar() {
    setErro(null)
    const lista: TaxaDePagamento[] = []
    for (const [k, bruto] of Object.entries(valores)) {
      const v = bruto.trim()
      if (!v) continue
      const n = Number(v.replace(',', '.'))
      if (!Number.isFinite(n) || n < 0 || n > 100) { setErro('Use percentuais entre 0 e 100.'); return }
      const [metodo, parcelas] = k.split('/') as [MetodoComTaxa, string]
      lista.push({ metodo, parcelas: Number(parcelas), taxa_pct: n })
    }
    iniciar(async () => {
      const r = await salvarTaxasDaMaquininha(lista)
      if (r.error) { setErro(r.error); return }
      setSalvo(true)
      router.refresh()
    })
  }

  const campo = (m: MetodoComTaxa, n: number, rotulo: string) => (
    <label key={chave(m, n)} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>{rotulo}</span>
      <div style={{ position: 'relative' }}>
        <input className="field" inputMode="decimal" placeholder="0,00" aria-label={`Taxa ${rotulo}`} disabled={!podeEditar}
          value={valores[chave(m, n)] ?? ''} onChange={e => { setValores(v => ({ ...v, [chave(m, n)]: e.target.value })); setSalvo(false) }}
          style={{ paddingRight: 28 }} />
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>%</span>
      </div>
    </label>
  )

  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }} aria-label="Taxas da maquininha">
      <div>
        <h2 style={titulo}>Taxas da maquininha</h2>
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2, maxWidth: 600 }}>
          O percentual que a operadora cobra em cada forma de pagamento. Descontado da base da comissão quando a opção acima está marcada. Dinheiro e crédito do cliente não têm taxa.
        </p>
      </div>
      <div style={grade}>
        {campo('PIX', 1, 'Pix')}
        {campo('DEBIT_CARD', 1, 'Débito')}
        {campo('CREDIT_CARD', 1, 'Crédito à vista')}
      </div>
      <p className="overline">Crédito parcelado</p>
      <div style={grade}>
        {PARCELAS_DO_CREDITO.map(n => campo('CREDIT_CARD', n, `${n}x`))}
      </div>
      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
        Parcela sem taxa própria usa a da maior quantidade preenchida abaixo dela.
      </p>
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      {podeEditar && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
          {salvo && <span role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)', fontWeight: 'var(--weight-semibold)' }}>Salvo.</span>}
          <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar taxas'}</button>
        </div>
      )}
    </div>
  )
}

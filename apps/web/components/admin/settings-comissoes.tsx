'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { rotaNoPortal } from '@/lib/rotas'
import { SegSelect } from '@/components/shared/seg-select'
import { salvarConfigDeComissao, salvarTaxasDaMaquininha, salvarMaximoDeVezes, salvarPrazoDaOperadora } from '@/actions/comissoes'
import { maximoDeVezes, opcoesDeVezes, TETO_DE_VEZES, PRAZO_PADRAO_DA_OPERADORA, PRAZO_MAXIMO_DA_OPERADORA, recusaDoPrazoDaOperadora } from '@/lib/financeiro/vezes-do-cartao'
import { rotuloDaBase, type ConfigDeComissao, type TaxaDePagamento, type MetodoComTaxa, type ComissaoDoProduto } from '@/lib/comissoes/config'
import { parseDecimal, NUMERO_INVALIDO, formatBRL } from '@estetica-os/utils'
import { Fala } from '@/components/shared/uma-unidade'

/**
 * Configurações → Comissões: como a comissão acontece na rede, a tabela de
 * taxas da maquininha e quem atende sem comissão configurada. As regras de
 * cada profissional (o padrão e as exceções por procedimento) ficam na Equipe.
 */

/**
 * Quando a comissão vale não é mais escolha (H4, decisão do Heitor,
 * 2026-11-01): só com o pagamento integral. A tela diz a regra.
 */
const QUANDO_VALE = [
  'A comissão fica a pagar quando a cliente paga tudo o que a gerou: o atendimento pago; no pacote, no plano, no pré-pago e na venda de produto, a venda inteira paga — a comissão da venda e a de cada sessão já feita.',
  'Cartão de crédito em várias vezes conta como pago: quem paga a clínica é a operadora. No crediário da clínica (entrada + parcelas), a comissão libera quando a última parcela entra.',
  'Até lá, ela aparece no extrato como “aguardando o pagamento integral”, fora do a pagar e do fechamento. Se um pagamento for estornado, a comissão volta a aguardar.',
] as const
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

export function SettingsComissoes({ inicial, taxas, semRegra, quantosAtendem, podeEditar, maximoDeVezes: maximoGravado = null, prazoDaOperadora = PRAZO_PADRAO_DA_OPERADORA, produtos = [] }: {
  inicial:    ConfigDeComissao
  taxas:      TaxaDePagamento[]
  /** "Parcelar no crédito até" gravado pela rede (D-15); nulo = automático. */
  maximoDeVezes?: number | null
  /** A cada quantos dias a operadora deposita cada parcela (r2-fin-01). */
  prazoDaOperadora?: number
  /** Os produtos de revenda e a comissão de cada um (r2-ven-10). */
  produtos?: ComissaoDoProduto[]
  /** Quem atende clientes e não tem comissão padrão configurada. */
  semRegra:   { id: string; nome: string }[]
  /** Quantos atendem (A12): sem ninguém, a tela não diz "todos têm comissão". */
  quantosAtendem?: number
  podeEditar: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ComoAcontece inicial={inicial} podeEditar={podeEditar} produtos={produtos} />
      <TabelaDeTaxas inicial={taxas} podeEditar={podeEditar} maximoGravado={maximoGravado} prazoGravado={prazoDaOperadora} />
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
        ) : quantosAtendem === 0 ? (
          // A12: "todos têm comissão" sem ninguém que atende parecia tudo em ordem.
          <p data-ninguem-atende style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
            Ninguém da equipe está marcado como “atende clientes”. Marque quem atende na Equipe para configurar a comissão.
          </p>
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

/** A regra de um produto, para o resumo ("10% do vendido", "R$ 3,00 por unidade"). */
const regraDoProduto = (p: ComissaoDoProduto) => p.valor == null || !p.tipo ? null : p.tipo === 'FIXED_AMOUNT'
  ? `${formatBRL(p.valor)} por unidade` : `${String(p.valor).replace('.', ',')}% do vendido`

function ComoAcontece({ inicial, podeEditar, produtos }: { inicial: ConfigDeComissao; podeEditar: boolean; produtos: ComissaoDoProduto[] }) {
  const router = useRouter()
  // O Estoque do portal em que a pessoa está (lib/rotas).
  const pathname = usePathname()
  const hrefDoEstoque = rotaNoPortal(pathname, pathname.split('/')[1] || null, '/estoque')
  const [c, setC] = useState(inicial)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [salvando, iniciar] = useTransition()
  const mudar = <K extends keyof ConfigDeComissao>(k: K, v: ConfigDeComissao[K]) => { setC(atual => ({ ...atual, [k]: v })); setSalvo(false) }
  // A comissão da venda de produto (D4): texto do campo, lido como os outros
  // números com casas ("10" ou "7,5"); vazio = sem comissão.
  const [pctProduto, setPctProduto] = useState(inicial.produto_pct != null ? String(inicial.produto_pct).replace('.', ',') : '')

  function salvar() {
    setErro(null)
    const texto = pctProduto.trim()
    const produto = texto ? parseDecimal(texto, 2) : null
    if (produto != null && Number.isNaN(produto)) { setErro(`Comissão na venda de produto: ${NUMERO_INVALIDO}`); return }
    iniciar(async () => {
      const r = await salvarConfigDeComissao({ ...c, produto_pct: produto })
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
          <Fala>Vale para a rede inteira</Fala>, a partir dos próximos atendimentos concluídos: o que já foi concluído segue a regra de quando foi.
        </p>
      </div>

      <Bloco titulo="Quando a comissão vale">
        <strong style={{ fontSize: 'var(--text-sm-sz)' }}>Quando a cliente paga tudo o que a gerou</strong>
        {QUANDO_VALE.map(t => <p key={t} style={texto}>{t}</p>)}
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
            ? `A comissão é calculada sobre a ${rotuloDaBase(c)}.`
            : `Nada é descontado: a comissão é sobre a ${rotuloDaBase(c)}.`}
          {' '}Vale para a comissão em percentual; a de valor fixo não muda com taxa nem insumos.
        </p>
      </Bloco>

      <Bloco titulo="Quando o cliente usa pontos ou voucher">
        {podeEditar
          ? <SegSelect ariaLabel="Comissão quando o cliente usa pontos" value={c.base_com_pontos} onSelect={k => mudar('base_com_pontos', k as ConfigDeComissao['base_com_pontos'])}
              options={(['PRECO', 'VALOR_PAGO'] as const).map(k => ({ key: k, label: BASES[k].label }))} />
          : <strong style={{ fontSize: 'var(--text-sm-sz)' }}>{BASES[c.base_com_pontos].label}</strong>}
        <p style={texto}>{BASES[c.base_com_pontos].explicacao}</p>
      </Bloco>

      <Bloco titulo="Venda de produto">
        {/* r2-ven-10 (o Heitor: "deixar a clínica decidir, flexibilidade"). */}
        <div role="group" aria-label="Comissão da venda de produto" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {podeEditar
            ? <SegSelect ariaLabel="Como a venda de produto comissiona" value={c.produto_modo}
                onSelect={k => mudar('produto_modo', k as ConfigDeComissao['produto_modo'])}
                options={[{ key: 'TOTAL', label: 'Uma regra sobre o total' }, { key: 'POR_PRODUTO', label: 'Por produto' }]} />
            : <strong style={{ fontSize: 'var(--text-sm-sz)' }}>{c.produto_modo === 'POR_PRODUTO' ? 'Por produto' : 'Uma regra sobre o total'}</strong>}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 260 }}>
            <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>
              {c.produto_modo === 'POR_PRODUTO' ? 'Regra geral — o produto sem a sua (%)' : 'Comissão na venda de produto (%)'}
            </span>
            <input className="field" inputMode="decimal" value={pctProduto} disabled={!podeEditar} placeholder="Sem comissão"
              aria-label="Comissão na venda de produto (%)"
              onChange={e => { setPctProduto(e.target.value); setSalvo(false) }} />
          </label>
          <p style={texto}>
            {c.produto_modo === 'POR_PRODUTO'
              ? 'Cada produto comissiona pela sua regra, sobre a parte dele no valor vendido (com o desconto rateado) — no kit, item a item. O produto sem regra própria usa a regra geral; sem as duas, não gera comissão.'
              : pctProduto.trim()
                ? 'Quem vendeu ganha esse percentual do valor vendido (com o desconto), uma comissão sobre o total — também no kit.'
                : 'Vazio: a venda de produto não gera comissão.'}
            {' '}A comissão fica a pagar com a venda paga inteira: à vista ou no cartão (mesmo em várias vezes), na hora; no crediário, quando a última parcela entrar. O estorno devolve.
          </p>
          {/* A regra de CADA produto se registra no cadastro dele (o Heitor,
              03/11: "em cada produto se possa registrar uma comissão
              diferente"). Aqui, só o resumo do que o cadastro gravou — um
              lugar só para editar. */}
          {c.produto_modo === 'POR_PRODUTO' && (
            <div data-comissao-por-produto style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p className="overline">Comissão por produto</p>
              <p style={texto}>
                A comissão de cada produto se registra no cadastro do produto:{' '}
                <Link href={hrefDoEstoque} style={{ color: 'var(--brand)', fontWeight: 'var(--weight-bold)' }}>Estoque</Link>
                {' '}→ o lápis do produto → “Comissão na venda deste produto”.
                {inicial.produto_modo !== 'POR_PRODUTO' && ' Salve a escolha “Por produto” antes.'}
              </p>
              {produtos.length === 0 ? (
                <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                  Nenhum produto de revenda ativo. Marque o uso “Revenda” e o preço de venda no cadastro do produto (Estoque).
                </p>
              ) : produtos.map(p => {
                const regra = regraDoProduto(p)
                return (
                  <div key={p.productId} data-produto style={{
                    display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center',
                    padding: '8px 10px', borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</p>
                      <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>{formatBRL(p.preco)}</p>
                    </div>
                    <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)', color: regra ? 'var(--text)' : 'var(--text-muted)', flexShrink: 0 }}>
                      {regra ?? 'regra geral'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Bloco>

      <Bloco titulo="Fechamento das comissões">
        {podeEditar
          ? <SegSelect ariaLabel="Período do fechamento" value={c.periodo} onSelect={k => mudar('periodo', k as ConfigDeComissao['periodo'])}
              options={(['MENSAL', 'QUINZENAL', 'SEMANAL'] as const).map(k => ({ key: k, label: PERIODOS[k].label }))} />
          : <strong style={{ fontSize: 'var(--text-sm-sz)' }}>{PERIODOS[c.periodo].label}</strong>}
        <p style={texto}>{PERIODOS[c.periodo].explicacao}</p>
      </Bloco>

      {!podeEditar && <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}><Fala>Quem muda é quem administra a rede.</Fala></p>}
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

function TabelaDeTaxas({ inicial, podeEditar, maximoGravado, prazoGravado }: { inicial: TaxaDePagamento[]; podeEditar: boolean; maximoGravado: number | null; prazoGravado: number }) {
  const router = useRouter()
  const chave = (m: MetodoComTaxa, n: number) => `${m}/${n}`
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(inicial.map(t => [chave(t.metodo, t.parcelas), String(t.taxa_pct).replace('.', ',')])))
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [salvando, iniciar] = useTransition()
  // D-15: "parcela até Nx". Vazio = automático, a maior parcela do crédito
  // com taxa preenchida acima (sem nenhuma, 12x) — calculado do que está na
  // tela, para o rótulo acompanhar a tabela enquanto ela é editada.
  const [maxVezes, setMaxVezes] = useState<string>(maximoGravado == null ? '' : String(maximoGravado))
  const parcelasComTaxa = Object.entries(valores)
    .filter(([k, v]) => k.startsWith('CREDIT_CARD/') && v.trim() !== '')
    .map(([k]) => Number(k.split('/')[1]))
  const automatico = maximoDeVezes(null, parcelasComTaxa)
  // r2-fin-01: o prazo da operadora, em dias corridos.
  const [prazo, setPrazo] = useState(String(prazoGravado))

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
    const dias = Number(prazo.trim())
    const recusaDoPrazo = recusaDoPrazoDaOperadora(dias)
    if (recusaDoPrazo) { setErro(recusaDoPrazo); return }
    iniciar(async () => {
      const r = await salvarTaxasDaMaquininha(lista)
      if (r.error) { setErro(r.error); return }
      const m = await salvarMaximoDeVezes(maxVezes === '' ? null : Number(maxVezes))
      if (m.error) { setErro(m.error); return }
      if (dias !== prazoGravado) {
        const pz = await salvarPrazoDaOperadora(dias)
        if (pz.error) { setErro(pz.error); return }
      }
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
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 360 }}>
        <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>Parcelar no crédito até</span>
        <select className="field" aria-label="Parcelar no crédito até" disabled={!podeEditar} value={maxVezes}
          onChange={e => { setMaxVezes(e.target.value); setSalvo(false) }}>
          <option value="">Automático — até {automatico === 1 ? 'à vista' : `${automatico}x`} (a maior parcela com taxa)</option>
          {opcoesDeVezes(TETO_DE_VEZES).map(n => <option key={n} value={String(n)}>{n === 1 ? 'Só à vista' : `Até ${n}x`}</option>)}
        </select>
        <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          É o “Vezes no cartão” do recebimento, do checkout do plano e das vendas. Acima disso o sistema não deixa passar.
        </span>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 360 }}>
        <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>Prazo da operadora (dias)</span>
        <input className="field" inputMode="numeric" aria-label="Prazo da operadora (dias)" disabled={!podeEditar} value={prazo}
          style={{ maxWidth: 120 }}
          onChange={e => { setPrazo(e.target.value.replace(/D/g, '').slice(0, 3)); setSalvo(false) }} />
        <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          No crédito em várias vezes, a operadora deposita cada parcela a cada {recusaDoPrazoDaOperadora(Number(prazo)) ? 'N' : prazo} dias
          corridos contados da venda: em 3x, nos dias {[1, 2, 3].map(k => k * (Number(prazo) || 0)).join(', ')}. Vale para as próximas
          vendas; de 1 a {PRAZO_MAXIMO_DA_OPERADORA} dias.
        </span>
      </label>
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

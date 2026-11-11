'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { rotaNoPortal } from '@/lib/rotas'
import { SegSelect } from '@/components/shared/seg-select'
import { salvarConfigDeComissao, salvarTaxasDaMaquininha, salvarMaximoDeVezes, salvarPrazoDaOperadora, salvarCartaoPorBandeira } from '@/actions/comissoes'
import { BANDEIRAS, chaveDaTaxa, creditoPelaTaxaPorParcela, taxasDaTabelaColada, faixaDaOperadora, avisoDaTaxaQueBaixa, type Bandeira, type CartaoPorBandeira } from '@/lib/financeiro/bandeiras'
import { taxaQueVale } from '@/lib/financeiro/formas'
import { maximoDeVezes, opcoesDeVezes, TETO_DE_VEZES, PRAZO_PADRAO_DA_OPERADORA, PRAZO_MAXIMO_DA_OPERADORA, recusaDoPrazoDaOperadora, recusaDaTaxaDaMaquininha } from '@/lib/financeiro/vezes-do-cartao'
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

export function SettingsComissoes({ inicial, taxas, semRegra, quantosAtendem, podeEditar, maximoDeVezes: maximoGravado = null, prazoDaOperadora = PRAZO_PADRAO_DA_OPERADORA, porBandeira = {}, produtos = [] }: {
  inicial:    ConfigDeComissao
  taxas:      TaxaDePagamento[]
  /** "Parcelar no crédito até" gravado pela rede (D-15); nulo = automático. */
  maximoDeVezes?: number | null
  /** A cada quantos dias a operadora deposita cada parcela (r2-fin-01). */
  prazoDaOperadora?: number
  /** O prazo e as taxas de cada bandeira (r3-f13-01); o que falta é a regra geral. */
  porBandeira?: CartaoPorBandeira
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
      <TabelaDeTaxas inicial={taxas} podeEditar={podeEditar} maximoGravado={maximoGravado} prazoGravado={prazoDaOperadora} porBandeiraGravado={porBandeira} />
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
            {/* A46 da 12ª: a dona que atende pesava aqui como pendência, sem dizer como sair. */}
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 4 }}>
              Se é de propósito (como a dona que atende), toque em “É de propósito” na linha da pessoa, na Equipe: ela sai deste aviso.
            </p>
          </div>
        ) : quantosAtendem === 0 ? (
          // A12: "todos têm comissão" sem ninguém que atende parecia tudo em ordem.
          <p data-ninguem-atende style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
            Ninguém da equipe está marcado como “atende clientes”. Marque quem atende na Equipe para configurar a comissão.
          </p>
        ) : (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Todos os profissionais que atendem têm comissão configurada (ou estão marcados “sem comissão, de propósito”, na Equipe).</p>
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
  // A comissão da venda do PLANO (decisão 4 da 7ª): vazio = sem comissão (princípio 6).
  const [pctPlano, setPctPlano] = useState(inicial.plano_pct != null ? String(inicial.plano_pct).replace('.', ',') : '')

  function salvar() {
    setErro(null)
    const texto = pctProduto.trim()
    const produto = texto ? parseDecimal(texto, 2) : null
    if (produto != null && Number.isNaN(produto)) { setErro(`Comissão na venda de produto: ${NUMERO_INVALIDO}`); return }
    const textoDoPlano = pctPlano.trim()
    const plano = textoDoPlano ? parseDecimal(textoDoPlano, 2) : null
    if (plano != null && Number.isNaN(plano)) { setErro(`Comissão na venda de plano: ${NUMERO_INVALIDO}`); return }
    iniciar(async () => {
      const r = await salvarConfigDeComissao({ ...c, produto_pct: produto, plano_pct: plano })
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
          {c.desconta_insumos || c.desconta_taxa || c.base_com_pontos === 'VALOR_PAGO'
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

      <Bloco titulo="Venda de plano">
        {/* Decisão 4 do Heitor (7ª simulação): o plano é personalizado para a
            cliente; quem o vende (o "Quem vendeu" do checkout) ganha este
            percentual. Vazio por padrão (princípio 6). */}
        <div data-comissao-do-plano style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 260 }}>
            <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>Comissão na venda de plano (%)</span>
            <input className="field" inputMode="decimal" value={pctPlano} disabled={!podeEditar} placeholder="Sem comissão"
              aria-label="Comissão na venda de plano (%)"
              onChange={e => { setPctPlano(e.target.value); setSalvo(false) }} />
          </label>
          <p style={texto}>
            {pctPlano.trim()
              ? 'Quem vendeu o plano (o “Quem vendeu” do checkout) ganha esse percentual do valor do plano, com o desconto.'
              : 'Vazio: a venda do plano não gera comissão.'}
            {' '}A comissão fica a pagar com o plano pago inteiro: à vista ou no cartão (mesmo em várias vezes), na hora; no crediário, quando a última parcela entrar. Se o plano for cancelado, ela volta. A comissão de quem atende cada sessão segue a regra do profissional.
          </p>
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

/** O que a tela edita de uma bandeira: o prazo e as taxas, em texto ("3,5"); vazio = a regra geral. */
interface BandeiraNaTela { prazo: string; valores: Record<string, string> }
const virgula = (n: number) => String(n).replace('.', ',')

function TabelaDeTaxas({ inicial, podeEditar, maximoGravado, prazoGravado, porBandeiraGravado }: {
  inicial: TaxaDePagamento[]; podeEditar: boolean; maximoGravado: number | null; prazoGravado: number; porBandeiraGravado: CartaoPorBandeira
}) {
  const router = useRouter()
  const chave = (m: MetodoComTaxa, n: number) => `${m}/${n}`
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(inicial.map(t => [chave(t.metodo, t.parcelas), String(t.taxa_pct).replace('.', ',')])))
  // r3-f13-01 (o Heitor: "Prazo por bandeira. Taxas também configuráveis por
  // bandeira."): a tabela mostra a REGRA GERAL ('') ou a de uma bandeira. O
  // vazio da bandeira é a regra geral — o campo mostra qual é.
  const [bandeira, setBandeira] = useState<'' | Bandeira>('')
  const [porBandeira, setPorBandeira] = useState<Partial<Record<Bandeira, BandeiraNaTela>>>(() => Object.fromEntries(
    Object.entries(porBandeiraGravado).map(([b, r]) => [b, {
      prazo: r?.prazo != null ? String(r.prazo) : '',
      valores: Object.fromEntries(Object.entries(r?.taxas ?? {}).map(([k, v]) => [k.replace(':', '/'), virgula(v)])),
    }]),
  ))
  const daBandeira: BandeiraNaTela = bandeira ? (porBandeira[bandeira] ?? { prazo: '', valores: {} }) : { prazo: '', valores: {} }
  const mudarNaBandeira = (parte: Partial<BandeiraNaTela>) => {
    if (!bandeira) return
    setPorBandeira(atual => ({ ...atual, [bandeira]: { ...daBandeira, ...parte } }))
  }
  const comRegraPropria = BANDEIRAS.filter(b => {
    const r = porBandeira[b.value]
    return r && (r.prazo.trim() !== '' || Object.values(r.valores).some(v => v.trim() !== ''))
  }).map(b => b.label)
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
  // F17-4 (o Heitor: "as linhas só devem aparecer se estiverem dentro do range
  // de parcelas que são oferecidas"): com o limite escolhido, o crédito aparece
  // de 1x até ele — na regra geral e na bandeira. No "Automático" o limite SAI
  // das linhas (a maior com taxa), então todas aparecem. O que está gravado
  // acima do limite fica no estado e é regravado no "Salvar taxas": esconder
  // não apaga.
  const ateQuantasVezes = maxVezes === '' ? TETO_DE_VEZES : Number(maxVezes)
  const parcelasNaTela = PARCELAS_DO_CREDITO.filter(n => n <= ateQuantasVezes)
  // r2-fin-01: o prazo da operadora, em dias corridos.
  const [prazo, setPrazo] = useState(String(prazoGravado))
  // O prazo da explicação: o da bandeira escolhida, ou o geral.
  const prazoMostrado = bandeira && daBandeira.prazo.trim() ? daBandeira.prazo : prazo

  // r4-f15-01: o campo vazio da bandeira mostra a regra geral DAQUELAS vezes — a
  // que vale (private.comissao_taxa_pct): a das vezes exatas, senão 0 (F16-2:
  // nunca a de outras vezes).
  const geralQueVale = (m: MetodoComTaxa, n: number) => {
    const doMetodo = Object.entries(valores)
      .map(([k, v]) => [k, Number(v.trim().replace(',', '.'))] as const)
      .filter(([k, v]) => k.startsWith(`${m}/`) && Number.isFinite(v) && valores[k]!.trim() !== '')
      .map(([k, v]) => ({ parcelas: Number(k.split('/')[1]), taxa_pct: v }))
    return virgula(taxaQueVale(doMetodo, m === 'CREDIT_CARD' ? n : 1).taxa)
  }

  // r4-f15-01 (o Heitor: "a taxa é por parcela, por exemplo 1.15% por parcela,
  // então a taxa total é a taxa vezes a quantidade de parcelas"): preenche o
  // crédito 1x a 12x da tabela aberta (a geral ou a da bandeira) com a taxa ×
  // as vezes. Só os campos: grava no "Salvar taxas" de sempre, e cada um
  // continua editável. O débito não muda.
  const [porParcelaAberto, setPorParcelaAberto] = useState(false)
  const [taxaPorParcela, setTaxaPorParcela] = useState('')
  const [erroPorParcela, setErroPorParcela] = useState<string | null>(null)
  // A5 da 6ª simulação: o preencher troca também o crédito 1x (a regra do
  // r4-f15-01 é "1x a 12x"), e diz isso quando o 1x tinha outro valor
  // (princípio 3: nada muda calado).
  const [avisoDo1x, setAvisoDo1x] = useState<string | null>(null)
  // A2 da 8ª simulação: o que o "Preencher" vai pôr, à vista ANTES do clique —
  // a multiplicação deixou 2x 1,98% abaixo do 1x 2,80% sem ninguém ver.
  const pctPorParcela = taxaPorParcela.trim() ? parseDecimal(taxaPorParcela.trim(), 4) : NaN
  const vaiPreencher = Number.isNaN(pctPorParcela) || pctPorParcela < 0
    ? [] : creditoPelaTaxaPorParcela(pctPorParcela).filter(t => t.parcelas <= ateQuantasVezes)
  const oDe1xAgora = ((bandeira ? daBandeira.valores : valores)[chave('CREDIT_CARD', 1)] ?? '').trim()
  // A2: a tabela com mais vezes mais barata grava e AVISA (princípio 2).
  const [avisoTaxaMenor, setAvisoTaxaMenor] = useState<string[]>([])
  function preencherPelaTaxaPorParcela() {
    const texto = taxaPorParcela.trim()
    // A4 da 9ª: "de 3,1 a 11,9" é a faixa da tabela — vai ao colar, com as pontas.
    const faixa = faixaDaOperadora(texto)
    if (faixa) { colarAFaixa(faixa); return }
    const pct = texto ? parseDecimal(texto, 4) : NaN
    if (Number.isNaN(pct)) { setErroPorParcela(`Taxa por parcela: ${NUMERO_INVALIDO}`); return }
    // F16-3 (o Heitor: "não é pra recusar nada, juros podem passar facilmente
    // de 100% no acumulado"): sem teto — só não negativa (e o limite do
    // registro, que o 12x não pode passar).
    if (pct < 0) { setErroPorParcela('A taxa por parcela não pode ser negativa.'); return }
    // F17-4: só as linhas que aparecem (até o "Parcelar no crédito até").
    const preenchido = creditoPelaTaxaPorParcela(pct).filter(t => t.parcelas <= ateQuantasVezes)
    const recusa = recusaDaTaxaDaMaquininha(preenchido[preenchido.length - 1]!.taxa)
    if (recusa) { setErroPorParcela(`Em ${preenchido[preenchido.length - 1]!.parcelas}x: ${recusa}`); return }
    const novos = Object.fromEntries(preenchido
      .map(t => [chave('CREDIT_CARD', t.parcelas), t.taxa.toFixed(2).replace('.', ',')]))
    const antesDo1x = ((bandeira ? daBandeira.valores : valores)[chave('CREDIT_CARD', 1)] ?? '').trim()
    const depoisDo1x = novos[chave('CREDIT_CARD', 1)] as string | undefined
    setAvisoDo1x(antesDo1x && depoisDo1x && parseDecimal(antesDo1x, 4) !== parseDecimal(depoisDo1x, 4)
      ? `O crédito à vista (1x) também mudou: era ${antesDo1x}%, agora ${depoisDo1x}%. Confira antes de salvar.`
      : null)
    if (bandeira) mudarNaBandeira({ valores: { ...daBandeira.valores, ...novos } })
    else setValores(v => ({ ...v, ...novos }))
    setSalvo(false)
    setErroPorParcela(null)
    setPorParcelaAberto(false)
    setTaxaPorParcela('')
  }

  // A3 da 7ª simulação (princípio 3): a tabela real da operadora não é a taxa
  // × as vezes (2,99% à vista, 6,50% em 6x). Colar a tabela preenche cada vez
  // com a taxa DELA — e a tela mostra antes o que vai preencher.
  const [colarAberto, setColarAberto] = useState(false)
  const [tabelaColada, setTabelaColada] = useState('')
  const lida = tabelaColada.trim() ? taxasDaTabelaColada(tabelaColada) : null
  const lidaNaTela = lida ? lida.taxas.filter(t => t.parcelas <= ateQuantasVezes) : []
  const lidaForaDoLimite = lida ? lida.taxas.filter(t => t.parcelas > ateQuantasVezes) : []
  const taxaNaTela = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: false })
  // A4 da 9ª: a faixa "de 3,1 a 11,9" vira o começo da tabela colada — o 1x e a
  // última vez; o meio não se inventa (princípio 4): a clínica cola ou digita.
  const faixaDigitada = faixaDaOperadora(taxaPorParcela)
  const pctDaFaixa = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4, useGrouping: false })
  function colarAFaixa(f: { de: number; ate: number }) {
    setTabelaColada(`1x ${pctDaFaixa(f.de)}%\n…\n${ateQuantasVezes}x ${pctDaFaixa(f.ate)}%`)
    setColarAberto(true)
    setPorParcelaAberto(false)
    setErroPorParcela(null)
  }

  function preencherComATabela() {
    if (!lida || lida.erros.length || !lidaNaTela.length) return
    const novos = Object.fromEntries(lidaNaTela.map(t => [chave('CREDIT_CARD', t.parcelas), taxaNaTela(t.taxa)]))
    if (bandeira) mudarNaBandeira({ valores: { ...daBandeira.valores, ...novos } })
    else setValores(v => ({ ...v, ...novos }))
    setAvisoDo1x(null)
    setSalvo(false)
    setColarAberto(false)
    setTabelaColada('')
  }

  function salvar() {
    setErro(null)
    const lista: TaxaDePagamento[] = []
    for (const [k, bruto] of Object.entries(valores)) {
      const v = bruto.trim()
      if (!v) continue
      const n = Number(v.replace(',', '.'))
      // F16-3: sem teto — só não negativa (e o limite do registro).
      const recusa = recusaDaTaxaDaMaquininha(n)
      if (recusa) { setErro(recusa); return }
      const [metodo, parcelas] = k.split('/') as [MetodoComTaxa, string]
      lista.push({ metodo, parcelas: Number(parcelas), taxa_pct: n })
    }
    const dias = Number(prazo.trim())
    const recusaDoPrazo = recusaDoPrazoDaOperadora(dias)
    if (recusaDoPrazo) { setErro(recusaDoPrazo); return }
    // As bandeiras: só o que foi preenchido; o resto é a regra geral.
    const bandeiras: CartaoPorBandeira = {}
    for (const b of BANDEIRAS) {
      const r = porBandeira[b.value]
      if (!r) continue
      const taxas: Record<string, number> = {}
      for (const [k, bruto] of Object.entries(r.valores)) {
        const v = bruto.trim()
        if (!v) continue
        const n = Number(v.replace(',', '.'))
        const recusa = recusaDaTaxaDaMaquininha(n)
        if (recusa) { setErro(`${b.label}: ${recusa}`); return }
        const [metodo, parcelas] = k.split('/') as ['DEBIT_CARD' | 'CREDIT_CARD', string]
        taxas[chaveDaTaxa(metodo, Number(parcelas))] = n
      }
      const prazoDela = r.prazo.trim() ? Number(r.prazo.trim()) : null
      if (prazoDela !== null) {
        const recusa = recusaDoPrazoDaOperadora(prazoDela)
        if (recusa) { setErro(`${b.label}: ${recusa}`); return }
      }
      if (prazoDela === null && !Object.keys(taxas).length) continue
      bandeiras[b.value] = { ...(prazoDela !== null ? { prazo: prazoDela } : {}), taxas }
    }
    iniciar(async () => {
      const r = await salvarTaxasDaMaquininha(lista)
      if (r.error) { setErro(r.error); return }
      const pb = await salvarCartaoPorBandeira(bandeiras)
      if (pb.error) { setErro(pb.error); return }
      const m = await salvarMaximoDeVezes(maxVezes === '' ? null : Number(maxVezes))
      if (m.error) { setErro(m.error); return }
      if (dias !== prazoGravado) {
        const pz = await salvarPrazoDaOperadora(dias)
        if (pz.error) { setErro(pz.error); return }
      }
      // A2 da 8ª: o que parece engano (mais vezes, taxa menor) vira aviso, sem recusar.
      const avisos: string[] = []
      const doCredito = (t: Record<string, number>) => Object.entries(t).map(([n, taxa]) => ({ parcelas: Number(n), taxa }))
      const geral = Object.fromEntries(lista.filter(t => t.metodo === 'CREDIT_CARD').map(t => [t.parcelas, t.taxa_pct]))
      const avisoGeral = avisoDaTaxaQueBaixa(doCredito(geral))
      if (avisoGeral) avisos.push(avisoGeral)
      for (const b of BANDEIRAS) {
        const taxasDela = bandeiras[b.value]?.taxas
        if (!taxasDela) continue
        const efetiva: Record<string, number> = { ...geral }
        for (const [k, v] of Object.entries(taxasDela)) {
          const m = /^CREDIT_CARD:(\d+)$/.exec(k)
          if (m) efetiva[m[1]!] = v
        }
        const a = avisoDaTaxaQueBaixa(doCredito(efetiva))
        if (a && a !== avisoGeral) avisos.push(`${b.label}: ${a}`)
      }
      setAvisoTaxaMenor(avisos)
      setSalvo(true)
      router.refresh()
    })
  }

  // F16-2 (o Heitor, opção A): sem a taxa EXATA daquelas vezes — nem na
  // bandeira, nem na regra geral — a venda sai com 0%, sem desconto da
  // operadora. A linha diz isso. Não avisa o Pix (sem taxa é comum) nem o
  // crédito acima do "Parcelar no crédito até" (não se vende ali).
  const limiteDeVezes = maxVezes === '' ? automatico : Number(maxVezes)
  const vazio = (texto: string | undefined) => !texto || texto.trim() === ''
  const semTaxa = (m: MetodoComTaxa, n: number) => {
    if (m === 'PIX' || (m === 'CREDIT_CARD' && n > limiteDeVezes)) return false
    if (!vazio(valores[chave(m, n)])) return false
    return !bandeira || vazio(daBandeira.valores[chave(m, n)])
  }
  const avisoSemTaxa = (m: MetodoComTaxa, n: number) =>
    m === 'DEBIT_CARD' ? 'no débito' : n === 1 ? 'no crédito à vista' : `em ${n}x`

  const campo = (m: MetodoComTaxa, n: number, rotulo: string) => (
    <label key={chave(m, n)} {...(semTaxa(m, n) ? { 'data-sem-taxa': '' } : {})} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>{rotulo}</span>
      <div style={{ position: 'relative' }}>
        {bandeira ? (
          // Na bandeira, o vazio é a regra geral: o campo diz qual.
          <input className="field" inputMode="decimal" aria-label={`Taxa ${rotulo}`} disabled={!podeEditar}
            placeholder={`${geralQueVale(m, n)} (geral)`}
            value={daBandeira.valores[chave(m, n)] ?? ''}
            onChange={e => { mudarNaBandeira({ valores: { ...daBandeira.valores, [chave(m, n)]: e.target.value } }); setSalvo(false) }}
            style={{ paddingRight: 28 }} />
        ) : (
          <input className="field" inputMode="decimal" placeholder="0,00" aria-label={`Taxa ${rotulo}`} disabled={!podeEditar}
            value={valores[chave(m, n)] ?? ''} onChange={e => { setValores(v => ({ ...v, [chave(m, n)]: e.target.value })); setSalvo(false) }}
            style={{ paddingRight: 28 }} />
        )}
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>%</span>
      </div>
      {semTaxa(m, n) && (
        <span data-aviso-sem-taxa role="note" style={{
          display: 'flex', gap: 4, alignItems: 'flex-start', padding: '4px 6px', borderRadius: 'var(--radius-field-token)',
          background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
          fontSize: 'var(--text-2xs)', color: 'var(--text)', lineHeight: 1.35,
        }}>
          <AlertTriangle size={11} aria-hidden style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
          <span>Sem taxa: as vendas {avisoSemTaxa(m, n)} saem sem desconto da operadora.</span>
        </span>
      )}
    </label>
  )

  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }} aria-label="Taxas da maquininha">
      <div>
        <h2 style={titulo}>Taxas da maquininha</h2>
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2, maxWidth: 600 }}>
          O percentual que a operadora cobra em cada forma de pagamento. Descontado da base da comissão quando a opção acima está marcada. Dinheiro e crédito do cliente não têm taxa; o Pix, só se a sua operadora cobrar (vazio é sem taxa).
        </p>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 360 }}>
        <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>Bandeira</span>
        <select className="filtro-select" aria-label="Bandeira" value={bandeira}
          onChange={e => setBandeira(e.target.value as '' | Bandeira)}>
          <option value="">Regra geral — toda bandeira sem regra própria</option>
          {BANDEIRAS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          {bandeira
            ? 'O prazo e as taxas desta bandeira. Campo vazio usa a regra geral (mostrada no campo).'
            : 'Vale para todo pagamento no cartão sem bandeira, e para a bandeira sem regra própria.'}
          {comRegraPropria.length > 0 && <> Com regra própria: {comRegraPropria.join(', ')}.</>}
        </span>
      </label>
      <div style={grade}>
        {!bandeira && campo('PIX', 1, 'Pix')}
        {campo('DEBIT_CARD', 1, 'Débito')}
        {campo('CREDIT_CARD', 1, 'Crédito à vista')}
      </div>
      {!bandeira && <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 360 }}>
        <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>Parcelar no crédito até</span>
        <select className="field" aria-label="Parcelar no crédito até" disabled={!podeEditar} value={maxVezes}
          onChange={e => { setMaxVezes(e.target.value); setSalvo(false) }}>
          <option value="">Automático — até {automatico === 1 ? 'à vista' : `${automatico}x`} (a maior parcela com taxa)</option>
          {opcoesDeVezes(TETO_DE_VEZES).map(n => <option key={n} value={String(n)}>{n === 1 ? 'Só à vista' : `Até ${n}x`}</option>)}
        </select>
        <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          É o “Vezes no cartão” do recebimento, do checkout do plano e das vendas. Acima disso o sistema não deixa passar — e as linhas do crédito abaixo vão só até aqui.
        </span>
      </label>}
      {bandeira && maxVezes !== '' && (
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          As linhas do crédito vão até {ateQuantasVezes === 1 ? 'à vista' : `${ateQuantasVezes}x`}, o “Parcelar no crédito até” da clínica (na regra geral).
        </p>
      )}
      {parcelasNaTela.length === 0 ? (
        <p data-so-a-vista style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          A clínica recebe no crédito só à vista: o crédito parcelado não aparece. Para parcelar, escolha até quantas vezes{bandeira ? ' na regra geral' : ' acima'}.
        </p>
      ) : (<>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <p className="overline">Crédito parcelado</p>
        {podeEditar && !porParcelaAberto && !colarAberto && (
          <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
            {/* A4 da 9ª: o caminho principal (ninguém o achava, e as 12 caixas eram digitadas à mão). */}
            <button type="button" className="btn-primary" onClick={() => { setColarAberto(true); setPorParcelaAberto(false) }}>
              Colar a tabela da operadora
            </button>
            <button type="button" className="btn-secondary" onClick={() => { setPorParcelaAberto(true); setColarAberto(false); setErroPorParcela(null) }}>
              Preencher pela taxa por parcela
            </button>
          </span>
        )}
      </div>
      {podeEditar && colarAberto && (
        <div data-colar-tabela style={{
          display: 'flex', flexDirection: 'column', gap: 8, padding: 12,
          borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)', background: 'var(--bg-app)',
        }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>Tabela da operadora</span>
            <textarea className="field" rows={6} autoFocus aria-label="Tabela da operadora" value={tabelaColada}
              placeholder={'1x 2,99%\n2x 4,09%\n3x 4,79%\n…'}
              onChange={e => setTabelaColada(e.target.value)} style={{ fontFamily: 'inherit', resize: 'vertical' }} />
          </label>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
            Cole a tabela como a operadora manda (ou de uma planilha): uma linha por vez, “6x 6,50%”. Só os números também servem — aí vão em ordem, de 1x em diante.
            {' '}Cada vez fica com a taxa da tabela{bandeira ? ' nesta bandeira' : ''}; a que a tabela não traz fica como está. O débito e o Pix têm campo próprio. Confira e use “Salvar taxas” para gravar.
          </p>
          {lida && (
            <div data-tabela-colada role="status" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {lidaNaTela.length > 0 && (
                <span><strong>Vai preencher:</strong> {lidaNaTela.map(t => `${t.parcelas}x ${taxaNaTela(t.taxa)}%`).join(' · ')}</span>
              )}
              {lidaForaDoLimite.length > 0 && (
                <span style={{ color: 'var(--text-muted)' }}>
                  Fora do “Parcelar no crédito até” ({ateQuantasVezes === 1 ? 'só à vista' : `${ateQuantasVezes}x`}), não entram: {lidaForaDoLimite.map(t => `${t.parcelas}x`).join(', ')}.
                </span>
              )}
              {lida.ignoradas.length > 0 && (
                <span style={{ color: 'var(--text-muted)' }}>Ficam de fora (têm campo próprio): {lida.ignoradas.join(' · ')}.</span>
              )}
              {lida.erros.map(e => <span key={e} role="alert" style={{ color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{e}</span>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-primary" onClick={preencherComATabela}
              disabled={!lida || lida.erros.length > 0 || lidaNaTela.length === 0}>
              Preencher com a tabela
            </button>
            <button type="button" className="btn-secondary" onClick={() => { setColarAberto(false); setTabelaColada('') }}>Cancelar</button>
          </div>
        </div>
      )}
      {podeEditar && porParcelaAberto && (
        <div data-por-parcela style={{
          display: 'flex', flexDirection: 'column', gap: 8, padding: 12,
          borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)', background: 'var(--bg-app)',
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 160 }}>
              <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>Taxa por parcela (%)</span>
              <input className="field" inputMode="decimal" placeholder="Ex.: 1,15" autoFocus value={taxaPorParcela}
                onChange={e => { setTaxaPorParcela(e.target.value); setErroPorParcela(null) }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); preencherPelaTaxaPorParcela() } }} />
            </label>
            <button type="button" className="btn-primary" onClick={preencherPelaTaxaPorParcela}>Preencher</button>
            <button type="button" className="btn-secondary" onClick={() => { setPorParcelaAberto(false); setErroPorParcela(null) }}>Cancelar</button>
          </div>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
            {bandeira ? 'Nesta bandeira, o' : 'O'} crédito de 1x (à vista, inclusive) a {ateQuantasVezes}x fica com a taxa × as vezes (1,15% → 1x 1,15%, 2x 2,30%, 3x 3,45%…).
            {' '}O débito não muda. Confira e use “Salvar taxas” para gravar.
            {' '}Serve só quando a operadora cobra a MESMA taxa por parcela — a maioria cobra uma tabela própria, mais cara a cada vez.
          </p>
          {faixaDigitada && (
            <div data-faixa-da-operadora role="status" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span>
                “{taxaPorParcela.trim()}” é a faixa da tabela da operadora (o 1x e o {ateQuantasVezes}x), não uma taxa por parcela.
                {' '}Cada vez tem a taxa dela: cole a tabela — o sistema não inventa as do meio.
              </span>
              <button type="button" className="btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => colarAFaixa(faixaDigitada)}>
                Colar a tabela com 1x {pctDaFaixa(faixaDigitada.de)}% e {ateQuantasVezes}x {pctDaFaixa(faixaDigitada.ate)}%
              </button>
            </div>
          )}
          {vaiPreencher.length > 0 && (
            <p data-vai-preencher role="status" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text)' }}>
              <strong>Vai preencher:</strong> {vaiPreencher.map(t => `${t.parcelas}x ${taxaNaTela(t.taxa)}%`).join(' · ')}
              {oDe1xAgora && parseDecimal(oDe1xAgora, 4) !== vaiPreencher[0]!.taxa && (
                <> — o crédito à vista (1x) deixa de ser {oDe1xAgora}%.</>
              )}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
            A tabela da operadora é outra?
            <button type="button" className="btn-secondary" onClick={() => { setColarAberto(true); setPorParcelaAberto(false); setErroPorParcela(null) }}>
              Colar a tabela da operadora
            </button>
          </div>
          {erroPorParcela && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erroPorParcela}</p>}
        </div>
      )}
      {avisoDo1x && (
        <p role="status" data-aviso-do-1x style={{
          fontSize: 'var(--text-xs-sz)', color: 'var(--text)', fontWeight: 'var(--weight-semibold)', padding: '8px 12px',
          borderRadius: 'var(--radius-field-token)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
        }}>
          {avisoDo1x}
        </p>
      )}
      <div style={grade}>
        {parcelasNaTela.map(n => campo('CREDIT_CARD', n, `${n}x`))}
      </div>
      </>)}
      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
        {bandeira
          ? 'Campo vazio usa a regra geral daquelas vezes (o número mostrado nele), não a de outra quantidade. Sem nenhuma das duas, a venda sai sem desconto da operadora (0%).'
          : 'Parcela sem taxa própria sai sem desconto da operadora (0%) — nunca com a taxa de outra quantidade.'}
      </p>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 360 }}>
        <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>Prazo da operadora (dias)</span>
        {bandeira ? (
          <input className="field" inputMode="numeric" aria-label="Prazo da operadora (dias)" disabled={!podeEditar}
            placeholder={`${prazo} (geral)`} value={daBandeira.prazo} style={{ maxWidth: 160 }}
            onChange={e => { mudarNaBandeira({ prazo: e.target.value.replace(/\D/g, '').slice(0, 3) }); setSalvo(false) }} />
        ) : (
          <input className="field" inputMode="numeric" aria-label="Prazo da operadora (dias)" disabled={!podeEditar} value={prazo}
            style={{ maxWidth: 120 }}
            onChange={e => { setPrazo(e.target.value.replace(/\D/g, '').slice(0, 3)); setSalvo(false) }} />
        )}
        <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          No crédito (à vista ou em várias vezes), a operadora deposita cada parcela a cada {recusaDoPrazoDaOperadora(Number(prazoMostrado)) ? 'N' : prazoMostrado} dias
          corridos contados da venda: em 3x, nos dias {[1, 2, 3].map(k => k * (Number(prazoMostrado) || 0)).join(', ')}. Vale para as próximas
          vendas; de 1 a {PRAZO_MAXIMO_DA_OPERADORA} dias.
        </span>
      </label>
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      {avisoTaxaMenor.length > 0 && (
        <p data-aviso-taxa-menor role="status" style={{
          fontSize: 'var(--text-xs-sz)', color: 'var(--text)', fontWeight: 'var(--weight-semibold)', padding: '8px 12px',
          borderRadius: 'var(--radius-field-token)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {avisoTaxaMenor.map(a => <span key={a}>{a}</span>)}
        </p>
      )}
      {podeEditar && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
          {salvo && <span role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)', fontWeight: 'var(--weight-semibold)' }}>Salvo.</span>}
          <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar taxas'}</button>
        </div>
      )}
    </div>
  )
}

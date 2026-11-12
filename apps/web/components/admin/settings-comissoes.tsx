'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { rotaNoPortal } from '@/lib/rotas'
import { SegSelect } from '@/components/shared/seg-select'
import { salvarConfigDeComissao, salvarMaximoDeParcelas } from '@/actions/comissoes'
import { salvarMaquininha, arquivarMaquininha, salvarTaxaDoPix } from '@/actions/maquininhas'
import type { Maquininha, EntradaDaMaquininha } from '@/lib/financeiro/maquininhas'
import { CREDIARIO_PADRAO, opcoesDeParcelas, TETO_DO_CREDIARIO } from '@/lib/financeiro/parcelas-do-crediario'
import { BANDEIRAS, chaveDaTaxa, creditoPelaTaxaPorParcela, taxasDaTabelaColada, faixaDaOperadora, avisoDaTaxaQueBaixa, type Bandeira, type CartaoPorBandeira } from '@/lib/financeiro/bandeiras'
import { taxaQueVale } from '@/lib/financeiro/formas'
import { maximoDeVezes, opcoesDeVezes, TETO_DE_VEZES, PRAZO_PADRAO_DA_OPERADORA, PRAZO_MAXIMO_DA_OPERADORA, recusaDoPrazoDaOperadora, recusaDaTaxaDaMaquininha } from '@/lib/financeiro/vezes-do-cartao'
import { rotuloDaBase, type ConfigDeComissao, type MetodoComTaxa, type ComissaoDoProduto } from '@/lib/comissoes/config'
import { parseDecimal, NUMERO_INVALIDO, formatBRL } from '@estetica-os/utils'
import { Fala } from '@/components/shared/uma-unidade'

/**
 * Configurações → Comissões: como a comissão acontece na rede, as taxas (o Pix
 * e as maquininhas) e quem atende sem comissão configurada. As regras de
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

export function SettingsComissoes({ inicial, maquininhas, taxaDoPix = 0, semRegra, quantosAtendem, podeEditar, produtos = [], crediarioMax = CREDIARIO_PADRAO }: {
  inicial:    ConfigDeComissao
  /** As maquininhas da rede, as ativas primeiro (C75 da F67). */
  maquininhas: Maquininha[]
  /** A taxa do Pix, fora das maquininhas (padrão 0%). */
  taxaDoPix?: number
  /** Os produtos de revenda e a comissão de cada um (r2-ven-10). */
  produtos?: ComissaoDoProduto[]
  /** C38: até quantas parcelas a clínica divide o crediário (padrão 12). */
  crediarioMax?: number
  /** Quem atende clientes e não tem comissão padrão configurada. */
  semRegra:   { id: string; nome: string }[]
  /** Quantos atendem (A12): sem ninguém, a tela não diz "todos têm comissão". */
  quantosAtendem?: number
  podeEditar: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Simplificação da F67 (princípio 7): primeiro o que a clínica mais procura — o percentual de cada um. */}
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
      <ComoAcontece inicial={inicial} podeEditar={podeEditar} produtos={produtos} />
      <TabelaDeTaxas maquininhas={maquininhas} pixGravado={taxaDoPix} podeEditar={podeEditar} />
      <CrediarioDaClinica gravado={crediarioMax} podeEditar={podeEditar} />
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
        {/* Simplificação da F67 (princípio 7): a regra à vista; o detalhe, a um toque. */}
        <details data-como-funciona>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>
            Como funciona (pacote, plano, cartão, crediário, estorno)
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {QUANDO_VALE.map(t => <p key={t} style={texto}>{t}</p>)}
          </div>
        </details>
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
              ? 'Cada produto comissiona pela sua regra, sobre a parte dele no valor vendido (com o desconto rateado) — no kit, item a item. O produto sem regra própria usa a regra de venda de quem vendeu (Equipe); sem ela, a regra geral; sem nenhuma, não gera comissão.'
              : pctProduto.trim()
                ? 'Quem vendeu ganha a regra de venda dela (Equipe); sem ela, esse percentual do valor vendido (com o desconto), uma comissão sobre o total — também no kit.'
                : 'Vazio: vale a regra de venda de quem vendeu; sem ela, a venda de produto não gera comissão.'}
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
              ? 'Quem vendeu o plano (o “Quem vendeu” do checkout) ganha a regra de venda dela (Equipe); sem ela, esse percentual do valor do plano, com o desconto.'
              : 'Vazio: vale a regra de venda de quem vendeu; sem ela, a venda do plano não gera comissão.'}
            {' '}Se o plano for cancelado, ela volta. A comissão de quem atende cada sessão segue a regra do profissional.
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

/**
 * C38 da F67 (a D10 mudada pelo Heitor: "Decisão da rede"): até quantas
 * parcelas a clínica divide o crediário — o "entrada + parcelas", com a
 * clínica. Padrão 12. Vale no Vender, no checkout e no check-in do plano; a
 * despesa parcelada não muda.
 */
function CrediarioDaClinica({ gravado, podeEditar }: { gravado: number; podeEditar: boolean }) {
  const router = useRouter()
  const [n, setN] = useState(String(gravado))
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [salvando, iniciar] = useTransition()
  function salvar() {
    setErro(null)
    iniciar(async () => {
      const r = await salvarMaximoDeParcelas(Number(n))
      if (r.error) { setErro(r.error); return }
      setSalvo(true)
      router.refresh()
    })
  }
  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="Crediário da clínica">
      <h2 style={titulo}>Crediário da clínica</h2>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 360 }}>
        <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>Dividir o crediário em até</span>
        <select className="field" aria-label="Dividir o crediário em até" disabled={!podeEditar} value={n}
          onChange={e => { setN(e.target.value); setSalvo(false) }}>
          {opcoesDeParcelas(TETO_DO_CREDIARIO).map(v => <option key={v} value={String(v)}>{v === 1 ? '1 parcela' : `${v} parcelas`}{v === CREDIARIO_PADRAO ? ' (padrão)' : ''}</option>)}
        </select>
        <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          É o “Parcelas do saldo” do “entrada + parcelas” — no Vender, no checkout e no check-in do plano. Acima disso o sistema não deixa passar. A despesa parcelada não muda.
        </span>
      </label>
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      {podeEditar && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
          {salvo && <span role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)', fontWeight: 'var(--weight-semibold)' }}>Salvo.</span>}
          <button type="button" className="btn-primary" onClick={salvar} disabled={salvando || Number(n) === gravado}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      )}
    </div>
  )
}

/** O que a tela edita de uma bandeira: o prazo e as taxas, em texto ("3,5"); vazio = a da maquininha. */
interface BandeiraNaTela { prazo: string; valores: Record<string, string> }
const virgula = (n: number) => String(n).replace('.', ',')

/**
 * Uma maquininha como a tela a edita (C75 da F67). `chave` identifica a linha
 * mesmo antes de ela ter id (a nova, ainda não salva). As taxas em texto, com
 * as chaves "DEBIT_CARD/1" e "CREDIT_CARD/N".
 */
interface MaquininhaNaTela {
  chave: string
  id: string | null
  nome: string
  valores: Record<string, string>
  maxVezes: string
  prazo: string
  cobraPorBandeira: boolean
  porBandeira: Partial<Record<Bandeira, BandeiraNaTela>>
  arquivada: boolean
}

function maquininhaNaTela(m: Maquininha): MaquininhaNaTela {
  return {
    chave: m.id, id: m.id, nome: m.nome,
    valores: Object.fromEntries(Object.entries(m.taxas).map(([k, v]) => [k.replace(':', '/'), virgula(v)])),
    maxVezes: m.maxVezes == null ? '' : String(m.maxVezes),
    prazo: String(m.prazoDias),
    cobraPorBandeira: m.cobraPorBandeira,
    porBandeira: Object.fromEntries(Object.entries(m.porBandeira).map(([b, r]) => [b, {
      prazo: r?.prazo != null ? String(r.prazo) : '',
      valores: Object.fromEntries(Object.entries(r?.taxas ?? {}).map(([k, v]) => [k.replace(':', '/'), virgula(v)])),
    }])),
    arquivada: m.arquivada,
  }
}

/** O que o "Salvar taxas" manda de uma maquininha, ou a recusa (com o que está errado). */
function entradaDaMaquininha(m: MaquininhaNaTela): EntradaDaMaquininha | { erro: string } {
  const nome = m.nome.trim()
  if (!nome) return { erro: 'Dê um nome à maquininha (ex.: Stone).' }
  const taxas: Record<string, number> = {}
  for (const [k, bruto] of Object.entries(m.valores)) {
    const v = bruto.trim()
    if (!v) continue
    const n = Number(v.replace(',', '.'))
    // F16-3: sem teto — só não negativa (e o limite do registro).
    const recusa = recusaDaTaxaDaMaquininha(n)
    if (recusa) return { erro: recusa }
    taxas[k.replace('/', ':')] = n
  }
  const dias = Number(m.prazo.trim())
  const recusaDoPrazo = recusaDoPrazoDaOperadora(dias)
  if (recusaDoPrazo) return { erro: recusaDoPrazo }
  // As bandeiras: só o que foi preenchido; o resto é a taxa da maquininha.
  const porBandeira: CartaoPorBandeira = {}
  for (const b of BANDEIRAS) {
    const r = m.porBandeira[b.value]
    if (!r) continue
    const taxasDela: Record<string, number> = {}
    for (const [k, bruto] of Object.entries(r.valores)) {
      const v = bruto.trim()
      if (!v) continue
      const n = Number(v.replace(',', '.'))
      const recusa = recusaDaTaxaDaMaquininha(n)
      if (recusa) return { erro: `${b.label}: ${recusa}` }
      const [metodo, parcelas] = k.split('/') as ['DEBIT_CARD' | 'CREDIT_CARD', string]
      taxasDela[chaveDaTaxa(metodo, Number(parcelas))] = n
    }
    const prazoDela = r.prazo.trim() ? Number(r.prazo.trim()) : null
    if (prazoDela !== null) {
      const recusa = recusaDoPrazoDaOperadora(prazoDela)
      if (recusa) return { erro: `${b.label}: ${recusa}` }
    }
    if (prazoDela === null && !Object.keys(taxasDela).length) continue
    porBandeira[b.value] = { ...(prazoDela !== null ? { prazo: prazoDela } : {}), taxas: taxasDela }
  }
  return {
    ...(m.id ? { id: m.id } : {}),
    nome, taxas, maxVezes: m.maxVezes === '' ? null : Number(m.maxVezes), prazoDias: dias,
    cobraPorBandeira: m.cobraPorBandeira, porBandeira,
  }
}

/** A2 da 8ª: o que parece engano (mais vezes, taxa menor) vira aviso, sem recusar (princípio 2). */
function avisosDaTaxaQueBaixa(e: EntradaDaMaquininha): string[] {
  const avisos: string[] = []
  const doCredito = (t: Record<string, number>) => Object.entries(t)
    .map(([k, taxa]) => { const m = /^CREDIT_CARD:(\d+)$/.exec(k); return m ? { parcelas: Number(m[1]), taxa } : null })
    .filter((x): x is { parcelas: number; taxa: number } => x !== null)
  const avisoGeral = avisoDaTaxaQueBaixa(doCredito(e.taxas))
  if (avisoGeral) avisos.push(avisoGeral)
  if (!e.cobraPorBandeira) return avisos
  for (const b of BANDEIRAS) {
    const taxasDela = (e.porBandeira as CartaoPorBandeira)[b.value]?.taxas
    if (!taxasDela) continue
    const a = avisoDaTaxaQueBaixa(doCredito({ ...e.taxas, ...taxasDela }))
    if (a && a !== avisoGeral) avisos.push(`${b.label}: ${a}`)
  }
  return avisos
}

/**
 * As taxas (C75 da F67 — o Heitor: "a rede precisa configurar suas taxas, por
 * operadora"): o Pix, com campo próprio, e as MAQUININHAS da rede. A clínica
 * comum tem uma — a tela é a de sempre; com mais de uma, escolhe-se qual
 * editar. Cada maquininha tem o débito, o crédito de 1x até onde parcela, o
 * prazo e, guardada até a clínica precisar (princípio 7), a opção "cobra
 * diferente em alguma bandeira?". O campo vazio vale 0% e mostra 0%
 * (princípio 3): não há mais aviso de "sem taxa" em cada campo.
 */
function TabelaDeTaxas({ maquininhas, pixGravado, podeEditar }: {
  maquininhas: Maquininha[]; pixGravado: number; podeEditar: boolean
}) {
  const router = useRouter()
  const chave = (m: MetodoComTaxa, n: number) => `${m}/${n}`
  const [lista, setLista] = useState<MaquininhaNaTela[]>(() => maquininhas.map(maquininhaNaTela))
  // O que está gravado, para o "Salvar taxas" mandar só o que mudou.
  const [gravadas, setGravadas] = useState<Record<string, string>>(() =>
    Object.fromEntries(maquininhas.map(m => [m.id, JSON.stringify(entradaDaMaquininha(maquininhaNaTela(m)))])))
  const ativasNaTela = lista.filter(m => !m.arquivada)
  const arquivadasNaTela = lista.filter(m => m.arquivada && m.id)
  const [aberta, setAberta] = useState<string>(() => ativasNaTela[0]?.chave ?? lista[0]?.chave ?? '')
  const atual: MaquininhaNaTela = ativasNaTela.find(m => m.chave === aberta) ?? ativasNaTela[0]
    ?? { chave: '', id: null, nome: 'Maquininha', valores: {}, maxVezes: '', prazo: String(PRAZO_PADRAO_DA_OPERADORA), cobraPorBandeira: false, porBandeira: {}, arquivada: false }
  const variasMaquininhas = ativasNaTela.length > 1
  const mudarAtual = (f: (m: MaquininhaNaTela) => Partial<MaquininhaNaTela>) => {
    setLista(l => l.map(m => m.chave === atual.chave ? { ...m, ...f(m) } : m))
    setSalvo(false)
  }
  const valores = atual.valores
  const setValores = (f: (v: Record<string, string>) => Record<string, string>) => mudarAtual(m => ({ valores: f(m.valores) }))
  const maxVezes = atual.maxVezes
  const prazo = atual.prazo

  const [pix, setPix] = useState(pixGravado ? virgula(pixGravado) : '')
  // r3-f13-01 (o Heitor: "Prazo por bandeira. Taxas também configuráveis por
  // bandeira."): com "cobra diferente em alguma bandeira?" marcado, a tabela
  // mostra a da maquininha ('') ou a de uma bandeira. O vazio da bandeira é a
  // da maquininha — o campo mostra qual.
  const [bandeiraEscolhida, setBandeira] = useState<'' | Bandeira>('')
  const bandeira: '' | Bandeira = atual.cobraPorBandeira ? bandeiraEscolhida : ''
  const porBandeira = atual.porBandeira
  const daBandeira: BandeiraNaTela = bandeira ? (porBandeira[bandeira] ?? { prazo: '', valores: {} }) : { prazo: '', valores: {} }
  const mudarNaBandeira = (parte: Partial<BandeiraNaTela>) => {
    if (!bandeira) return
    mudarAtual(m => ({ porBandeira: { ...m.porBandeira, [bandeira]: { ...(m.porBandeira[bandeira] ?? { prazo: '', valores: {} }), ...parte } } }))
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
  const parcelasComTaxa = Object.entries(valores)
    .filter(([k, v]) => k.startsWith('CREDIT_CARD/') && v.trim() !== '')
    .map(([k]) => Number(k.split('/')[1]))
  const automatico = maximoDeVezes(null, parcelasComTaxa)
  // F17-4 (o Heitor: "as linhas só devem aparecer se estiverem dentro do range
  // de parcelas que são oferecidas"): com o limite escolhido, o crédito aparece
  // de 1x até ele — na maquininha e na bandeira. No "Automático" o limite SAI
  // das linhas (a maior com taxa), então todas aparecem. O que está gravado
  // acima do limite fica no estado e é regravado no "Salvar taxas": esconder
  // não apaga.
  const ateQuantasVezes = maxVezes === '' ? TETO_DE_VEZES : Number(maxVezes)
  const parcelasNaTela = PARCELAS_DO_CREDITO.filter(n => n <= ateQuantasVezes)
  // O prazo da explicação: o da bandeira escolhida, ou o da maquininha.
  const prazoMostrado = bandeira && daBandeira.prazo.trim() ? daBandeira.prazo : prazo

  // r4-f15-01: o campo vazio da bandeira mostra a taxa da maquininha DAQUELAS
  // vezes — a que vale (private.taxa_da_maquininha): a das vezes exatas, senão
  // 0 (F16-2: nunca a de outras vezes).
  const geralQueVale = (m: MetodoComTaxa, n: number) => {
    const doMetodo = Object.entries(valores)
      .map(([k, v]) => [k, Number(v.trim().replace(',', '.'))] as const)
      .filter(([k, v]) => k.startsWith(`${m}/`) && Number.isFinite(v) && valores[k]!.trim() !== '')
      .map(([k, v]) => ({ parcelas: Number(k.split('/')[1]), taxa_pct: v }))
    return virgula(taxaQueVale(doMetodo, m === 'CREDIT_CARD' ? n : 1).taxa)
  }

  // r4-f15-01 (o Heitor: "a taxa é por parcela, por exemplo 1.15% por parcela,
  // então a taxa total é a taxa vezes a quantidade de parcelas"): preenche o
  // crédito 1x a 12x da tabela aberta (a da maquininha ou a da bandeira) com a
  // taxa × as vezes. Só os campos: grava no "Salvar taxas" de sempre, e cada um
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
    setColarAberto(false)
    setTabelaColada('')
  }

  /** Troca a maquininha aberta: o que foi digitado nas outras fica, até o "Salvar taxas". */
  function abrir(c: string) {
    setAberta(c)
    setBandeira('')
    setColarAberto(false)
    setPorParcelaAberto(false)
    setAvisoDo1x(null)
    setErro(null)
  }

  // A chave da maquininha nova (ainda sem id): um contador da tela.
  const [novas, setNovas] = useState(0)
  function adicionarMaquininha() {
    const c = `nova-${novas + 1}`
    setNovas(n => n + 1)
    setLista(l => [...l, { chave: c, id: null, nome: '', valores: {}, maxVezes: '', prazo: String(PRAZO_PADRAO_DA_OPERADORA), cobraPorBandeira: false, porBandeira: {}, arquivada: false }])
    abrir(c)
    setSalvo(false)
  }

  function descartarANova() {
    setLista(l => l.filter(m => m.chave !== atual.chave))
    abrir(ativasNaTela.find(m => m.chave !== atual.chave)?.chave ?? '')
  }

  function arquivar(m: MaquininhaNaTela, arquivarEla: boolean) {
    if (!m.id) return
    setErro(null)
    iniciar(async () => {
      const r = await arquivarMaquininha(m.id, arquivarEla)
      if (r.error) { setErro(r.error); return }
      setLista(l => l.map(x => x.chave === m.chave ? { ...x, arquivada: arquivarEla } : x))
      if (arquivarEla) abrir(ativasNaTela.find(x => x.chave !== m.chave)?.chave ?? '')
      else abrir(m.chave)
      router.refresh()
    })
  }

  function salvar() {
    setErro(null)
    const pixTexto = pix.trim()
    const pixN = pixTexto ? Number(pixTexto.replace(',', '.')) : 0
    const recusaDoPix = recusaDaTaxaDaMaquininha(pixN)
    if (recusaDoPix) { setErro(`Pix: ${recusaDoPix}`); return }
    // As maquininhas que mudaram (e as novas), conferidas antes de gravar qualquer uma.
    const aGravar: { m: MaquininhaNaTela; e: EntradaDaMaquininha }[] = []
    for (const m of lista.filter(x => !x.arquivada)) {
      const e = entradaDaMaquininha(m)
      if ('erro' in e) {
        // Abre a maquininha do erro (se é outra), e o erro fica à vista.
        if (m.chave !== atual.chave) abrir(m.chave)
        setErro(variasMaquininhas || !m.id ? `${m.nome.trim() || 'A maquininha nova'}: ${e.erro}` : e.erro)
        return
      }
      if (m.id && gravadas[m.id] === JSON.stringify(e)) continue
      aGravar.push({ m, e })
    }
    iniciar(async () => {
      const avisos: string[] = []
      for (const { m, e } of aGravar) {
        const r = await salvarMaquininha(e)
        if (r.error) { setErro(variasMaquininhas ? `${e.nome}: ${r.error}` : r.error); return }
        const id = r.id ?? m.id!
        setLista(l => l.map(x => x.chave === m.chave ? { ...x, id } : x))
        setGravadas(g => ({ ...g, [id]: JSON.stringify({ ...e, id }) }))
        for (const a of avisosDaTaxaQueBaixa(e)) avisos.push(variasMaquininhas ? `${e.nome} — ${a}` : a)
      }
      if (pixN !== pixGravado) {
        const r = await salvarTaxaDoPix(pixN)
        if (r.error) { setErro(`Pix: ${r.error}`); return }
      }
      setAvisoTaxaMenor(avisos)
      setSalvo(true)
      router.refresh()
    })
  }

  const campo = (m: MetodoComTaxa, n: number, rotulo: string) => (
    <label key={chave(m, n)} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>{rotulo}</span>
      <div style={{ position: 'relative' }}>
        {m === 'PIX' ? (
          <input className="field" inputMode="decimal" placeholder="0,00" aria-label="Taxa Pix" disabled={!podeEditar}
            value={pix} onChange={e => { setPix(e.target.value); setSalvo(false) }} style={{ paddingRight: 28 }} />
        ) : bandeira ? (
          // Na bandeira, o vazio é a taxa da maquininha: o campo diz qual.
          <input className="field" inputMode="decimal" aria-label={`Taxa ${rotulo}`} disabled={!podeEditar}
            placeholder={`${geralQueVale(m, n)} (da maquininha)`}
            value={daBandeira.valores[chave(m, n)] ?? ''}
            onChange={e => mudarNaBandeira({ valores: { ...daBandeira.valores, [chave(m, n)]: e.target.value } })}
            style={{ paddingRight: 28 }} />
        ) : (
          <input className="field" inputMode="decimal" placeholder="0,00" aria-label={`Taxa ${rotulo}`} disabled={!podeEditar}
            value={valores[chave(m, n)] ?? ''} onChange={e => { const v = e.target.value; setValores(x => ({ ...x, [chave(m, n)]: v })) }}
            style={{ paddingRight: 28 }} />
        )}
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>%</span>
      </div>
    </label>
  )

  const rotuloPequeno = { fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' } as const
  const ajuda = { fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' } as const

  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }} aria-label="Taxas da maquininha">
      <div>
        <h2 style={titulo}>Taxas da maquininha</h2>
        <p style={{ ...ajuda, marginTop: 2, maxWidth: 600 }}>
          O percentual que a operadora cobra em cada pagamento. Descontado da base da comissão quando a opção acima está marcada. Dinheiro e crédito do cliente não têm taxa. Campo vazio é 0%.
        </p>
      </div>
      <div style={grade}>
        {campo('PIX', 1, 'Pix')}
      </div>

      <div data-maquininhas style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <p className="overline">{variasMaquininhas ? 'Maquininhas' : 'Cartão'}</p>
          {podeEditar && (
            <button type="button" className="btn-secondary" onClick={adicionarMaquininha}>+ Adicionar maquininha</button>
          )}
        </div>
        {variasMaquininhas && (
          <SegSelect ariaLabel="Maquininha" value={atual.chave} onSelect={abrir}
            options={ativasNaTela.map(m => ({ key: m.chave, label: m.nome.trim() || 'Nova maquininha' }))} />
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 360 }}>
          <span style={rotuloPequeno}>Nome da maquininha</span>
          <input className="field" aria-label="Nome da maquininha" disabled={!podeEditar} maxLength={60}
            placeholder="Ex.: Stone" value={atual.nome} autoFocus={!atual.id}
            onChange={e => { const v = e.target.value; mudarAtual(() => ({ nome: v })) }} />
          {!variasMaquininhas && (
            <span style={ajuda}>A clínica que passa o cartão em mais de uma maquininha cadastra cada uma: aí a venda no cartão pergunta “Qual maquininha?”.</span>
          )}
        </label>
      </div>

      {atual.cobraPorBandeira && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 360 }}>
          <span style={rotuloPequeno}>Bandeira</span>
          <select className="filtro-select" aria-label="Bandeira" value={bandeira}
            onChange={e => setBandeira(e.target.value as '' | Bandeira)}>
            <option value="">Todas — a taxa desta maquininha</option>
            {BANDEIRAS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
          <span style={ajuda}>
            {bandeira
              ? 'O prazo e as taxas desta bandeira nesta maquininha. Campo vazio usa a taxa da maquininha (mostrada no campo).'
              : 'Vale para o cartão sem bandeira informada e para a bandeira sem taxa própria.'}
            {comRegraPropria.length > 0 && <> Com taxa própria: {comRegraPropria.join(', ')}.</>}
          </span>
        </label>
      )}
      <div style={grade}>
        {campo('DEBIT_CARD', 1, 'Débito')}
        {campo('CREDIT_CARD', 1, 'Crédito à vista')}
      </div>
      {!bandeira && <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 360 }}>
        <span style={rotuloPequeno}>Parcelar no crédito até</span>
        <select className="field" aria-label="Parcelar no crédito até" disabled={!podeEditar} value={maxVezes}
          onChange={e => { const v = e.target.value; mudarAtual(() => ({ maxVezes: v })) }}>
          <option value="">Automático — até {automatico === 1 ? 'à vista' : `${automatico}x`} (a maior parcela com taxa)</option>
          {opcoesDeVezes(TETO_DE_VEZES).map(n => <option key={n} value={String(n)}>{n === 1 ? 'Só à vista' : `Até ${n}x`}</option>)}
        </select>
        <span style={ajuda}>
          É o “Vezes no cartão” do recebimento, do checkout do plano e das vendas{variasMaquininhas ? ', nesta maquininha' : ''}. Acima disso o sistema não deixa passar — e as linhas do crédito abaixo vão só até aqui.
        </span>
      </label>}
      {bandeira && maxVezes !== '' && (
        <p style={ajuda}>
          As linhas do crédito vão até {ateQuantasVezes === 1 ? 'à vista' : `${ateQuantasVezes}x`}, o “Parcelar no crédito até” desta maquininha.
        </p>
      )}
      {parcelasNaTela.length === 0 ? (
        <p data-so-a-vista style={ajuda}>
          {variasMaquininhas ? 'Nesta maquininha, a' : 'A'} clínica recebe no crédito só à vista: o crédito parcelado não aparece. Para parcelar, escolha até quantas vezes{bandeira ? ' na taxa da maquininha' : ' acima'}.
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
            <span style={rotuloPequeno}>Tabela da operadora</span>
            <textarea className="field" rows={6} autoFocus aria-label="Tabela da operadora" value={tabelaColada}
              placeholder={'1x 2,99%\n2x 4,09%\n3x 4,79%\n…'}
              onChange={e => setTabelaColada(e.target.value)} style={{ fontFamily: 'inherit', resize: 'vertical' }} />
          </label>
          <p style={ajuda}>
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
              <span style={rotuloPequeno}>Taxa por parcela (%)</span>
              <input className="field" inputMode="decimal" placeholder="Ex.: 1,15" autoFocus value={taxaPorParcela}
                onChange={e => { setTaxaPorParcela(e.target.value); setErroPorParcela(null) }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); preencherPelaTaxaPorParcela() } }} />
            </label>
            <button type="button" className="btn-primary" onClick={preencherPelaTaxaPorParcela}>Preencher</button>
            <button type="button" className="btn-secondary" onClick={() => { setPorParcelaAberto(false); setErroPorParcela(null) }}>Cancelar</button>
          </div>
          <p style={ajuda}>
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
      <p style={ajuda}>
        {bandeira
          ? 'Campo vazio usa a taxa da maquininha daquelas vezes (o número mostrado nele), não a de outra quantidade. Sem nenhuma das duas, a venda sai sem desconto da operadora (0%).'
          : 'Campo vazio é 0%: a venda sai sem desconto da operadora — nunca com a taxa de outra quantidade.'}
      </p>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 360 }}>
        <span style={rotuloPequeno}>Prazo da operadora (dias)</span>
        {bandeira ? (
          <input className="field" inputMode="numeric" aria-label="Prazo da operadora (dias)" disabled={!podeEditar}
            placeholder={`${prazo} (da maquininha)`} value={daBandeira.prazo} style={{ maxWidth: 160 }}
            onChange={e => mudarNaBandeira({ prazo: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
        ) : (
          <input className="field" inputMode="numeric" aria-label="Prazo da operadora (dias)" disabled={!podeEditar} value={prazo}
            style={{ maxWidth: 120 }}
            onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 3); mudarAtual(() => ({ prazo: v })) }} />
        )}
        <span style={ajuda}>
          No crédito (à vista ou em várias vezes), a operadora deposita cada parcela a cada {recusaDoPrazoDaOperadora(Number(prazoMostrado)) ? 'N' : prazoMostrado} dias
          corridos contados da venda: em 3x, nos dias {[1, 2, 3].map(k => k * (Number(prazoMostrado) || 0)).join(', ')}. Vale para as próximas
          vendas; de 1 a {PRAZO_MAXIMO_DA_OPERADORA} dias.
        </span>
      </label>
      {/* C75: guardada até a clínica precisar (princípio 7) — fechada de saída. */}
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
        <input type="checkbox" disabled={!podeEditar} checked={atual.cobraPorBandeira}
          onChange={e => { const v = e.target.checked; mudarAtual(() => ({ cobraPorBandeira: v })); setBandeira('') }} />
        <span>
          Esta maquininha cobra diferente em alguma bandeira?
          <span style={{ display: 'block', ...ajuda }}>
            Marque se a operadora tem taxa ou prazo diferente para Elo, Amex… Desmarcada, toda bandeira paga a taxa acima{comRegraPropria.length > 0 && !atual.cobraPorBandeira ? ` (as de ${comRegraPropria.join(', ')} ficam guardadas, sem valer)` : ''}.
          </span>
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
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', gap: 8 }}>
            {!atual.id && atual.chave && (
              <button type="button" className="btn-secondary" onClick={descartarANova} disabled={salvando}>Descartar esta maquininha</button>
            )}
            {atual.id && variasMaquininhas && (
              <button type="button" className="btn-secondary" onClick={() => arquivar(atual, true)} disabled={salvando}>Arquivar {atual.nome.trim() || 'esta maquininha'}</button>
            )}
          </span>
          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            {salvo && <span role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)', fontWeight: 'var(--weight-semibold)' }}>Salvo.</span>}
            <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar taxas'}</button>
          </span>
        </div>
      )}
      {arquivadasNaTela.length > 0 && (
        <div data-maquininhas-arquivadas style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', ...ajuda }}>
          Arquivadas (as vendas feitas nelas continuam com as taxas delas):
          {arquivadasNaTela.map(m => (
            <span key={m.chave} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: 'var(--text)' }}>{m.nome}</span>
              {podeEditar && <button type="button" className="btn-secondary" onClick={() => arquivar(m, false)} disabled={salvando}>Voltar a usar</button>}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

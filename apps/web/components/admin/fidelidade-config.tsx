'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { SegSelect } from '@/components/shared/seg-select'
import { salvarConfigFidelidade } from '@/actions/fidelidade'
import { erroParaTela } from '@/lib/erro-na-tela'
import type { ConfigFidelidade, ModoDeGanho, BaseDaComissao } from '@/lib/fidelidade/config'

/**
 * Configurações → Fidelidade: a rede liga o programa e escolhe as regras.
 *
 * O programa é da REDE e nasce desligado (decisão do Heitor, 2026-09-28).
 * Desligado, nada de pontos aparece em lugar nenhum — nem para a equipe, nem
 * para o cliente. O texto de cada escolha fica à vista: o que importa é a
 * consequência, não o rótulo.
 */

const MODOS: { key: ModoDeGanho; label: string; explicacao: string }[] = [
  {
    key: 'POR_REAL', label: 'Por real pago',
    explicacao: 'O cliente ganha pontos sobre o valor que efetivamente pagou. Atendimento concluído e não pago não gera ponto; estornar o pagamento tira os pontos de volta.',
  },
  {
    key: 'POR_PROCEDIMENTO', label: 'Por procedimento',
    explicacao: 'Cada procedimento vale uma quantidade fixa de pontos, definida no cadastro dele. Bom para destacar o que a clínica quer vender mais. Procedimento sem pontos cadastrados não gera ponto.',
  },
]

const COMISSAO: { key: BaseDaComissao; label: string; explicacao: string }[] = [
  {
    key: 'PRECO', label: 'Sobre o preço',
    explicacao: 'Quando o cliente usar pontos como desconto, a comissão do profissional continua sobre o preço do atendimento. O desconto é custo da clínica.',
  },
  {
    key: 'VALOR_PAGO', label: 'Sobre o valor pago',
    explicacao: 'Quando o cliente usar pontos como desconto, a comissão cai na mesma proporção. O profissional divide o custo do programa.',
  },
]

export function FidelidadeConfig({ inicial, podeEditar, temLancamentos = false }: {
  inicial: ConfigFidelidade
  podeEditar: boolean
  /** A rede já tem pontos lançados: a abrangência fica travada. */
  temLancamentos?: boolean
}) {
  const [ligado,   setLigado]   = useState(inicial.enabled)
  const [modo,     setModo]     = useState<ModoDeGanho>(inicial.earn_mode)
  const [taxa,     setTaxa]     = useState(String(inicial.points_per_real).replace('.', ','))
  const [comissao, setComissao] = useState<BaseDaComissao>(inicial.commission_base)
  const [valorDoPonto, setValorDoPonto] = useState(String(inicial.redeem_points_value).replace('.', ','))
  const [minimo,   setMinimo]   = useState(String(inicial.redeem_min_points))
  const [teto,     setTeto]     = useState(String(inicial.redeem_max_pct).replace('.', ','))
  const [vencem,   setVencem]   = useState(inicial.expiry_months != null)
  const [meses,    setMeses]    = useState(String(inicial.expiry_months ?? 12))
  const [porUnidade, setPorUnidade] = useState(inicial.scope_per_branch)
  // Opcionais: cada um tem o liga/desliga e o número separados, para desligar
  // não apagar o número que a rede tinha escolhido.
  const [aniversario, setAniversario] = useState(inicial.birthday_bonus > 0)
  const [pontosAniversario, setPontosAniversario] = useState(String(inicial.birthday_bonus || 100))
  const [primeiroAcesso, setPrimeiroAcesso] = useState(inicial.first_access_bonus > 0)
  const [pontosPrimeiroAcesso, setPontosPrimeiroAcesso] = useState(String(inicial.first_access_bonus || 50))
  const [trocaNoPortal, setTrocaNoPortal] = useState(inicial.client_redeem)
  const [avisar,   setAvisar]   = useState(inicial.expiry_notice_days != null)
  const [diasAviso, setDiasAviso] = useState(String(inicial.expiry_notice_days ?? 7))
  const [erro,     setErro]     = useState<string | null>(null)
  const [salvo,    setSalvo]    = useState(false)
  const [salvando, iniciar]     = useTransition()

  useEffect(() => {
    if (!salvo) return
    const id = setTimeout(() => setSalvo(false), 4000)
    return () => clearTimeout(id)
  }, [salvo])

  function salvar() {
    setErro(null)
    setSalvo(false)
    iniciar(async () => {
      try {
        const res = await salvarConfigFidelidade({
          enabled:         ligado,
          earn_mode:       modo,
          points_per_real: taxa.replace(/\./g, '').replace(',', '.'),
          commission_base: comissao,
          redeem_points_value: numero(valorDoPonto),
          redeem_min_points:   numero(minimo),
          redeem_max_pct:      numero(teto),
          expiry_months:       vencem ? numero(meses) : null,
          scope_per_branch:    porUnidade,
          birthday_bonus:      aniversario ? numero(pontosAniversario) : 0,
          first_access_bonus:  primeiroAcesso ? numero(pontosPrimeiroAcesso) : 0,
          client_redeem:       trocaNoPortal,
          expiry_notice_days:  vencem && avisar ? numero(diasAviso) : null,
        })
        if (res.error) setErro(res.error)
        else setSalvo(true)
      } catch (e) {
        setErro(erroParaTela(e, 'Não foi possível salvar.'))
      }
    })
  }

  const modoAtual     = MODOS.find(m => m.key === modo)!
  const comissaoAtual = COMISSAO.find(c => c.key === comissao)!

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
      aria-labelledby="titulo-fidelidade">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 id="titulo-fidelidade"
            style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
            Programa de fidelidade
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 3, maxWidth: 520 }}>
            O cliente acumula pontos a cada pagamento. Desligado, nada de pontos aparece — nem para a equipe, nem para o cliente.
          </p>
        </div>
        <button
          type="button"
          className={ligado ? 'filtro-toggle is-ativo' : 'filtro-toggle'}
          aria-pressed={ligado}
          disabled={!podeEditar}
          onClick={() => setLigado(v => !v)}
        >
          {ligado ? 'Programa ligado' : 'Programa desligado'}
        </button>
      </div>

      <Bloco titulo="Como o cliente ganha pontos">
        {podeEditar ? (
          <SegSelect
            options={MODOS.map(m => ({ key: m.key, label: m.label }))}
            value={modo}
            onSelect={k => setModo(k as ModoDeGanho)}
            ariaLabel="Como o cliente ganha pontos"
          />
        ) : (
          <strong style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{modoAtual.label}</strong>
        )}
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', lineHeight: 1.5 }}>
          {modoAtual.explicacao}
        </p>

        {modo === 'POR_REAL' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 260 }}>
            <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
              Pontos por R$ 1 pago
            </span>
            <input
              name="points_per_real" className="field" inputMode="decimal"
              value={taxa} onChange={e => setTaxa(e.target.value)} disabled={!podeEditar}
            />
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
              Ex.: 1 = um atendimento de R$ 250 dá 250 pontos. Frações de ponto são descartadas.
            </span>
          </label>
        )}
        {modo === 'POR_PROCEDIMENTO' && (
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
            Os pontos de cada procedimento são definidos no cadastro dele, em Procedimentos.
          </p>
        )}
      </Bloco>

      <Bloco titulo="Usar pontos como desconto">
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', lineHeight: 1.5 }}>
          Na recepção, ao confirmar o pagamento, o cliente pode abater pontos do valor. O que ele pagar em pontos não entra como receita — só o que pagar em dinheiro.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          <CampoNumero rotulo="Valor de 1 ponto (R$)" nome="redeem_points_value" valor={valorDoPonto} onChange={setValorDoPonto}
            dica={`Ex.: 0,01 = 100 pontos valem R$ 1.`} desabilitado={!podeEditar} />
          <CampoNumero rotulo="Mínimo para usar (pontos)" nome="redeem_min_points" valor={minimo} onChange={setMinimo}
            dica="0 = qualquer quantidade." desabilitado={!podeEditar} />
          <CampoNumero rotulo="Pontos pagam até (%)" nome="redeem_max_pct" valor={teto} onChange={setTeto}
            dica="100 = pode pagar tudo com pontos." desabilitado={!podeEditar} />
        </div>
      </Bloco>

      <Bloco titulo="Validade dos pontos">
        {podeEditar ? (
          <SegSelect
            options={[{ key: 'nunca', label: 'Não vencem' }, { key: 'meses', label: 'Vencem' }]}
            value={vencem ? 'meses' : 'nunca'}
            onSelect={k => setVencem(k === 'meses')}
            ariaLabel="Os pontos vencem?"
          />
        ) : (
          <strong style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{vencem ? 'Vencem' : 'Não vencem'}</strong>
        )}
        {vencem && (
          <div style={{ maxWidth: 260 }}>
            <CampoNumero rotulo="Vencem após (meses)" nome="expiry_months" valor={meses} onChange={setMeses}
              desabilitado={!podeEditar} dica="Contados de quando cada ponto entrou." />
          </div>
        )}
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', lineHeight: 1.5 }}>
          {vencem
            ? 'Cada ponto vence N meses depois de entrar; os mais antigos são usados primeiro. Mudar a regra vale para os pontos novos — os que já existem mantêm o vencimento de quando entraram.'
            : 'Os pontos ficam com o cliente até ele usar.'}
        </p>
        {vencem && (
          <Opcional
            titulo="Aviso antes de vencer" testId="opcional-aviso"
            opcoes={[{ key: 'nao', label: 'Não avisa' }, { key: 'sim', label: 'Avisa por push' }]}
            ligado={avisar} onChange={setAvisar} podeEditar={podeEditar}
            explicacao={avisar
              ? 'O cliente recebe uma notificação no celular ou no navegador quando tiver pontos para vencer dentro do prazo — um aviso por lote, não um por dia.'
              : 'O cliente só vê o que vai vencer quando abrir os pontos no portal.'}
          >
            <CampoNumero rotulo="Dias antes" nome="expiry_notice_days" valor={diasAviso} onChange={setDiasAviso}
              desabilitado={!podeEditar} dica="De 1 a 90 dias." />
          </Opcional>
        )}
      </Bloco>

      <Bloco titulo="Bônus">
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', lineHeight: 1.5 }}>
          Pontos que o cliente ganha sem pagar nada, uma vez por ocasião. Valem e vencem como os outros.
        </p>
        <Opcional
          titulo="No aniversário" testId="opcional-aniversario"
          opcoes={[{ key: 'nao', label: 'Sem bônus' }, { key: 'sim', label: 'Dá pontos' }]}
          ligado={aniversario} onChange={setAniversario} podeEditar={podeEditar}
          explicacao={aniversario
            ? 'No dia do aniversário (pela data de nascimento do cadastro), o cliente ganha os pontos e recebe uma notificação. Uma vez por ano.'
            : undefined}
        >
          <CampoNumero rotulo="Pontos no aniversário" nome="birthday_bonus" valor={pontosAniversario} onChange={setPontosAniversario}
            desabilitado={!podeEditar} />
        </Opcional>
        <Opcional
          titulo="No primeiro acesso ao portal ou ao app" testId="opcional-primeiro-acesso"
          opcoes={[{ key: 'nao', label: 'Sem bônus' }, { key: 'sim', label: 'Dá pontos' }]}
          ligado={primeiroAcesso} onChange={setPrimeiroAcesso} podeEditar={podeEditar}
          explicacao={primeiroAcesso
            ? 'Na primeira vez que o cliente entra no portal ou no app. Quem já tinha entrado antes não ganha.'
            : undefined}
        >
          <CampoNumero rotulo="Pontos no primeiro acesso" nome="first_access_bonus" valor={pontosPrimeiroAcesso} onChange={setPontosPrimeiroAcesso}
            desabilitado={!podeEditar} />
        </Opcional>
      </Bloco>

      <Bloco titulo="Quem troca pontos por recompensa">
        {podeEditar ? (
          <SegSelect
            options={[{ key: 'equipe', label: 'Só a equipe' }, { key: 'cliente', label: 'Também o cliente' }]}
            value={trocaNoPortal ? 'cliente' : 'equipe'}
            onSelect={k => setTrocaNoPortal(k === 'cliente')}
            ariaLabel="Quem troca pontos por recompensa"
          />
        ) : (
          <strong style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{trocaNoPortal ? 'Também o cliente' : 'Só a equipe'}</strong>
        )}
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', lineHeight: 1.5 }}>
          {trocaNoPortal
            ? 'Além da recepção, o cliente troca os pontos pelo portal ou pelo app. O voucher aparece na hora para ele e na ficha para a equipe.'
            : 'A troca é feita na recepção, pela ficha do cliente. No portal, o cliente só vê o catálogo.'}
        </p>
      </Bloco>

      <Bloco titulo="Onde os pontos valem">
        {podeEditar && !temLancamentos ? (
          <SegSelect
            options={[{ key: 'rede', label: 'Rede inteira' }, { key: 'unidade', label: 'Só na unidade' }]}
            value={porUnidade ? 'unidade' : 'rede'}
            onSelect={k => setPorUnidade(k === 'unidade')}
            ariaLabel="Onde os pontos valem"
          />
        ) : (
          <strong data-testid="abrangencia-travada" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
            {porUnidade ? 'Só na unidade' : 'Rede inteira'}
          </strong>
        )}
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', lineHeight: 1.5 }}>
          {porUnidade
            ? 'Os pontos ganhos numa unidade só valem nela: o saldo é separado por unidade.'
            : 'Um saldo só: os pontos ganhos em qualquer unidade valem em todas.'}
          {temLancamentos && ' Não dá para trocar depois que a rede já tem pontos lançados — mudaria o saldo de quem já tem.'}
        </p>
      </Bloco>

      <Bloco titulo="Comissão quando o cliente usa pontos">
        {podeEditar ? (
          <SegSelect
            options={COMISSAO.map(c => ({ key: c.key, label: c.label }))}
            value={comissao}
            onSelect={k => setComissao(k as BaseDaComissao)}
            ariaLabel="Base da comissão com desconto de fidelidade"
          />
        ) : (
          <strong style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{comissaoAtual.label}</strong>
        )}
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', lineHeight: 1.5 }}>
          {comissaoAtual.explicacao}
        </p>
      </Bloco>

      {erro && (
        <p role="alert" style={{
          fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--danger)',
          background: 'var(--danger-soft)', border: '1px solid var(--danger-border)',
          borderRadius: 'var(--radius-row)', padding: '8px 12px',
        }}>
          {erro}
        </p>
      )}

      {podeEditar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? <><Loader2 size={14} className="animate-spin" /> Salvando…</> : 'Salvar'}
          </button>
          {salvo && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--success)' }}>
              <Check size={14} /> Salvo
            </span>
          )}
        </div>
      )}
    </section>
  )
}

/** "1.234,56" → "1234.56": o zod converte; aqui só se tira a formatação BR. */
function numero(v: string): string {
  return v.trim().replace(/\./g, '').replace(',', '.')
}

function CampoNumero({ rotulo, nome, valor, onChange, dica, desabilitado }: {
  rotulo: string; nome: string; valor: string; onChange: (v: string) => void; dica?: string; desabilitado?: boolean
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
        {rotulo}
      </span>
      <input name={nome} className="field" inputMode="decimal" value={valor}
        onChange={e => onChange(e.target.value)} disabled={desabilitado} />
      {dica && <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{dica}</span>}
    </label>
  )
}

/** Um opcional: liga/desliga, o número quando ligado e o que acontece. */
function Opcional({ titulo, testId, opcoes, ligado, onChange, podeEditar, explicacao, children }: {
  titulo: string
  testId?: string
  opcoes: [{ key: string; label: string }, { key: string; label: string }]
  ligado: boolean
  onChange: (v: boolean) => void
  podeEditar: boolean
  explicacao?: string
  children: React.ReactNode
}) {
  return (
    <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>{titulo}</span>
      {podeEditar ? (
        <SegSelect options={opcoes} value={ligado ? opcoes[1].key : opcoes[0].key}
          onSelect={k => onChange(k === opcoes[1].key)} ariaLabel={titulo} />
      ) : (
        <strong style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{ligado ? opcoes[1].label : opcoes[0].label}</strong>
      )}
      {ligado && <div style={{ maxWidth: 260 }}>{children}</div>}
      {explicacao && (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', lineHeight: 1.5 }}>{explicacao}</p>
      )}
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
      <p className="overline">{titulo}</p>
      {children}
    </div>
  )
}

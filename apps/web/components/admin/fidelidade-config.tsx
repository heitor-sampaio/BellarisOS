'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { SegSelect } from '@/components/shared/seg-select'
import { salvarConfigFidelidade } from '@/actions/fidelidade'
import { erroParaTela } from '@/lib/erro-na-tela'
import { parseDecimal, NUMERO_INVALIDO } from '@estetica-os/utils'
import type { ConfigFidelidade, ModoDeGanho, PremioDeIndicacao } from '@/lib/fidelidade/config'
import { Fala } from '@/components/shared/uma-unidade'
import { Dica } from '@/components/shared/dica'

/**
 * Configurações → Fidelidade: a rede liga o programa e escolhe as regras.
 *
 * O programa é da REDE e nasce desligado (decisão do Heitor, 2026-09-28).
 * Desligado, nada de pontos aparece em lugar nenhum — nem para a equipe, nem
 * para o cliente. O que cada escolha faz mora na dica ao lado do título do
 * bloco (2026-11-16, o Heitor: "Não dá pra ficar poluindo tela com um monte de
 * explicaçãozinha" — docs/regras/design.md, "A explicação mora na dica").
 */

/** O título (ou rótulo) com a dica ao lado. */
const linhaComDica = { display: 'inline-flex', alignItems: 'center', gap: 6 } as const

const MODOS: { key: ModoDeGanho; label: string; explicacao: string }[] = [
  {
    key: 'POR_REAL', label: 'Por real pago',
    explicacao: 'O cliente ganha pontos sobre o valor que efetivamente pagou. Atendimento concluído e não pago não gera ponto; estornar o pagamento tira os pontos de volta.',
  },
  {
    key: 'POR_PROCEDIMENTO', label: 'Por procedimento',
    explicacao: 'Cada procedimento vale uma quantidade fixa de pontos, definida no cadastro dele. Bom para destacar o que a rede quer vender mais. Procedimento sem pontos cadastrados não gera ponto.',
  },
]

const PREMIOS: { key: PremioDeIndicacao; label: string }[] = [
  { key: 'DESLIGADO', label: 'Desligado' }, { key: 'PONTOS', label: 'Pontos' }, { key: 'RECOMPENSA', label: 'Uma recompensa' },
]

export function FidelidadeConfig({ inicial, podeEditar, recompensas = [] }: {
  inicial: ConfigFidelidade
  podeEditar: boolean
  /** O catálogo, para o prêmio por indicação em recompensa (as arquivadas ficam fora da escolha). */
  recompensas?: { id: string; name: string; is_active: boolean }[]
}) {
  const [ligado,   setLigado]   = useState(inicial.enabled)
  // A3 da 14ª (princípio 7): o liga/desliga só vale depois do "Salvar" do fim
  // da página — o topo diz "Falta salvar" enquanto o estado da tela não é o gravado (não "Não salvo": o "Salvo" do fim da página é procurado pelo texto).
  const [ligadoSalvo, setLigadoSalvo] = useState(inicial.enabled)
  const [modo,     setModo]     = useState<ModoDeGanho>(inicial.earn_mode)
  const [taxa,     setTaxa]     = useState(String(inicial.points_per_real).replace('.', ','))
  const [valorDoPonto, setValorDoPonto] = useState(String(inicial.redeem_points_value).replace('.', ','))
  const [minimo,   setMinimo]   = useState(String(inicial.redeem_min_points))
  const [teto,     setTeto]     = useState(String(inicial.redeem_max_pct).replace('.', ','))
  const [vencem,   setVencem]   = useState(inicial.expiry_months != null)
  const [meses,    setMeses]    = useState(String(inicial.expiry_months ?? 12))
  // Opcionais: cada um tem o liga/desliga e o número separados, para desligar
  // não apagar o número que a rede tinha escolhido.
  const [aniversario, setAniversario] = useState(inicial.birthday_bonus > 0)
  const [pontosAniversario, setPontosAniversario] = useState(String(inicial.birthday_bonus || 100))
  const [primeiroAcesso, setPrimeiroAcesso] = useState(inicial.first_access_bonus > 0)
  const [pontosPrimeiroAcesso, setPontosPrimeiroAcesso] = useState(String(inicial.first_access_bonus || 50))
  const [trocaNoPortal, setTrocaNoPortal] = useState(inicial.client_redeem)
  const [pontuaProduto, setPontuaProduto] = useState(inicial.pontua_venda_de_produto)
  // O prêmio por indicação (decisão do Heitor, 2026-11-10): nasce desligado.
  const [indicacao, setIndicacao] = useState<PremioDeIndicacao>(inicial.indicacao_premio)
  const [pontosIndicacao, setPontosIndicacao] = useState(String(inicial.indicacao_pontos || 300))
  const [recompensaIndicacao, setRecompensaIndicacao] = useState(inicial.indicacao_recompensa_id ?? '')
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
    // Os números com casas decimais leem como o dinheiro (frente de cadastro,
    // 2026-10-29: "0.5" ponto por real virava 5, e "0.01" no valor do ponto, R$ 1).
    const ilegivel = ([
      ['Pontos por R$ 1 pago', taxa, CASAS.taxa], ['Valor de 1 ponto (R$)', valorDoPonto, CASAS.valorDoPonto], ['Pontos pagam até (%)', teto, CASAS.teto],
    ] as const).find(([, v, c]) => numeroIlegivel(v, c))
    if (ilegivel) { setErro(`${ilegivel[0]}: ${NUMERO_INVALIDO}`); return }
    iniciar(async () => {
      try {
        const res = await salvarConfigFidelidade({
          enabled:         ligado,
          earn_mode:       modo,
          points_per_real:     decimal(taxa, CASAS.taxa),
          redeem_points_value: decimal(valorDoPonto, CASAS.valorDoPonto),
          redeem_min_points:   numero(minimo),
          redeem_max_pct:      decimal(teto, CASAS.teto),
          expiry_months:       vencem ? numero(meses) : null,
          birthday_bonus:      aniversario ? numero(pontosAniversario) : 0,
          first_access_bonus:  primeiroAcesso ? numero(pontosPrimeiroAcesso) : 0,
          client_redeem:       trocaNoPortal,
          pontua_venda_de_produto: pontuaProduto,
          indicacao_premio:        indicacao,
          indicacao_pontos:        numero(pontosIndicacao),
          indicacao_recompensa_id: recompensaIndicacao || null,
          expiry_notice_days:  vencem && avisar ? numero(diasAviso) : null,
        })
        if (res.error) setErro(res.error)
        else { setSalvo(true); setLigadoSalvo(ligado) }
      } catch (e) {
        setErro(erroParaTela(e, 'Não foi possível salvar.'))
      }
    })
  }

  const modoAtual     = MODOS.find(m => m.key === modo)!

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
      aria-labelledby="titulo-fidelidade">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          {/* O id fica no texto: o nome da seção não leva o da dica. */}
          <h2 style={{ ...linhaComDica, fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
            <span id="titulo-fidelidade">Programa de fidelidade</span>
            <Dica rotulo="Sobre o programa de fidelidade">
              O cliente acumula pontos a cada pagamento. Desligado, nada de pontos aparece — nem para a equipe, nem para o cliente.
            </Dica>
          </h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <button
            type="button"
            className={ligado ? 'filtro-toggle is-ativo' : 'filtro-toggle'}
            aria-pressed={ligado}
            disabled={!podeEditar}
            onClick={() => setLigado(v => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            {/* A3 da 14ª: o interruptor à vista — o texto dizia o estado e parecia um botão de ação. */}
            <span aria-hidden className="interruptor" data-ligado={ligado || undefined} />
            {ligado ? 'Programa ligado' : 'Programa desligado'}
          </button>
          {ligado !== ligadoSalvo && (
            <span data-fidelidade-nao-salvo style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 'var(--weight-bold)' }}>
              Falta salvar: vale depois do “Salvar”, no fim da página.
            </span>
          )}
        </div>
      </div>

      {/* Os dois modos explicados na dica, para escolher sabendo. */}
      <Bloco titulo="Como o cliente ganha pontos" sobre={{
        rotulo: 'Sobre os modos de ganhar pontos',
        texto: <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {MODOS.map(m => (
            <span key={m.key}>
              <strong style={{ color: 'var(--text)' }}>{m.label}:</strong> {m.explicacao}
              {m.key === 'POR_PROCEDIMENTO' && ' Os pontos de cada procedimento são definidos no cadastro dele, em Procedimentos.'}
            </span>
          ))}
        </span>,
      }}>
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

        {modo === 'POR_REAL' && (
          <div style={{ maxWidth: 260 }}>
            <CampoNumero rotulo="Pontos por R$ 1 pago" nome="points_per_real" valor={taxa} onChange={setTaxa}
              desabilitado={!podeEditar} casas={CASAS.taxa}
              sobre="Exemplo: quanto rende cada real"
              dica="Ex.: 1 = um atendimento de R$ 250 dá 250 pontos. Frações de ponto são descartadas." />
          </div>
        )}
      </Bloco>

      <Bloco titulo="Usar pontos como desconto" sobre={{
        rotulo: 'Como o desconto em pontos funciona',
        texto: 'No PDV, ao receber, o cliente pode abater pontos do valor — numa comanda de atendimento (com os produtos dela) ou numa venda à vista. O que ele pagar em pontos não entra como receita — só o que pagar em dinheiro.',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          <CampoNumero rotulo="Valor de 1 ponto (R$)" nome="redeem_points_value" valor={valorDoPonto} onChange={setValorDoPonto}
            sobre="Exemplo: quanto vale o ponto"
            dica={`Ex.: 0,01 = 100 pontos valem R$ 1.`} desabilitado={!podeEditar} casas={CASAS.valorDoPonto} />
          <CampoNumero rotulo="Mínimo para usar (pontos)" nome="redeem_min_points" valor={minimo} onChange={setMinimo}
            sobre="Sobre o mínimo" dica="0 = qualquer quantidade." desabilitado={!podeEditar} />
          <CampoNumero rotulo="Pontos pagam até (%)" nome="redeem_max_pct" valor={teto} onChange={setTeto}
            sobre="Sobre o limite do desconto" dica="100 = pode pagar tudo com pontos." desabilitado={!podeEditar} casas={CASAS.teto} />
        </div>
      </Bloco>

      <Bloco titulo="Validade dos pontos" sobre={{
        rotulo: 'Como a validade funciona',
        texto: vencem
          ? 'Cada ponto vence N meses depois de entrar; os mais antigos são usados primeiro. Mudar a regra vale para os pontos novos — os que já existem mantêm o vencimento de quando entraram.'
          : 'Os pontos ficam com o cliente até ele usar.',
      }}>
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
              desabilitado={!podeEditar} sobre="Sobre a contagem dos meses" dica="Contados de quando cada ponto entrou." />
          </div>
        )}
        {vencem && (
          <Opcional
            titulo="Aviso antes de vencer" testId="opcional-aviso" sobre="O que o aviso faz"
            opcoes={[{ key: 'nao', label: 'Não avisa' }, { key: 'sim', label: 'Avisa por push' }]}
            ligado={avisar} onChange={setAvisar} podeEditar={podeEditar}
            explicacao={avisar
              ? 'O cliente recebe uma notificação no celular ou no navegador quando tiver pontos para vencer dentro do prazo — um aviso por lote, não um por dia.'
              : 'O cliente só vê o que vai vencer quando abrir os pontos no portal.'}
          >
            <CampoNumero rotulo="Dias antes" nome="expiry_notice_days" valor={diasAviso} onChange={setDiasAviso}
              desabilitado={!podeEditar} sobre="Sobre o prazo do aviso" dica="De 1 a 90 dias." />
          </Opcional>
        )}
      </Bloco>

      <Bloco titulo="Bônus" sobre={{
        rotulo: 'Sobre os bônus',
        texto: 'Pontos que o cliente ganha sem pagar nada, uma vez por ocasião. Valem e vencem como os outros.',
      }}>
        <Opcional
          titulo="No aniversário" testId="opcional-aniversario" sobre="Como o bônus de aniversário funciona"
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
          titulo="No primeiro acesso ao portal ou ao app" testId="opcional-primeiro-acesso" sobre="Como o bônus de primeiro acesso funciona"
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

      {/* O prêmio por indicação (A43 da 10ª; decisão do Heitor, 2026-11-10:
          "1 - sim"). Nasce desligado (princípio 6); sem dinheiro, sem prêmio (princípio 5). */}
      <Bloco titulo="Indicação">
        <div data-testid="opcional-indicacao" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Como o prêmio funciona mora na dica (2026-11-16 — era um parágrafo embaixo). */}
          <span style={{ ...linhaComDica, fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>
            <span>Prêmio por indicação</span>
            <Dica rotulo="Como funciona o prêmio por indicação" largura={340}>
              {indicacao === 'DESLIGADO'
                ? 'A ficha guarda quem indicou (“Indicada por”), mas ninguém ganha nada pela indicação.'
                : `Quem indicou ganha ${indicacao === 'PONTOS' ? 'os pontos' : 'um voucher da recompensa, sem gastar pontos,'} quando a indicada pagar o primeiro atendimento ou a primeira compra (a venda de pacote, pré-pago, produto ou crédito interno também conta) — uma vez por indicada. Se esse pagamento for estornado por inteiro, o prêmio sai junto; o estorno de uma parte não tira o prêmio. Quem já tinha pago antes da indicação não conta. No app, a cliente vê “Indique uma amiga” com o prêmio; a ficha da amiga continua sendo feita pela equipe.`}
            </Dica>
          </span>
          {podeEditar ? (
            <SegSelect
              options={PREMIOS.map(o => ({ key: o.key, label: o.label }))}
              value={indicacao}
              onSelect={k => setIndicacao(k as PremioDeIndicacao)}
              ariaLabel="Prêmio por indicação"
            />
          ) : (
            <strong style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{PREMIOS.find(o => o.key === indicacao)?.label}</strong>
          )}
          {indicacao === 'PONTOS' && (
            <div style={{ maxWidth: 260 }}>
              <CampoNumero rotulo="Pontos para quem indicou" nome="indicacao_pontos" valor={pontosIndicacao} onChange={setPontosIndicacao}
                desabilitado={!podeEditar} />
              {/* A6 da 12ª: o 300 é sugestão, não regra (princípio 3). */}
              {!inicial.indicacao_pontos && (
                <span data-sugestao-de-pontos style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                  300 pontos é uma sugestão: ajuste ao seu programa.
                </span>
              )}
            </div>
          )}
          {indicacao === 'RECOMPENSA' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 360 }}>
              <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                Recompensa para quem indicou
              </span>
              <select className="filtro-select" value={recompensaIndicacao} onChange={e => setRecompensaIndicacao(e.target.value)} disabled={!podeEditar}>
                <option value="">Selecione…</option>
                {recompensas.filter(r => r.is_active || r.id === recompensaIndicacao).map(r => (
                  <option key={r.id} value={r.id}>{r.name}{r.is_active ? '' : ' (arquivada)'}</option>
                ))}
              </select>
              {!recompensas.some(r => r.is_active) && (
                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                  Cadastre a recompensa no catálogo, logo abaixo, e volte aqui para escolher.
                </span>
              )}
            </label>
          )}
        </div>
      </Bloco>

      {/* A venda de produto (D4, decisão do Heitor: "os pontos são
          configuráveis pela clínica"). Nasce desligado, como todo opcional. */}
      <Bloco titulo="Venda de produto" sobre={{
        rotulo: 'Quais vendas pontuam',
        texto: pontuaProduto
          ? 'A venda de produto dá pontos pelo valor pago, na mesma conta de pontos por R$ 1 — também quando os procedimentos pontuam por procedimento.'
          : 'A venda de produto não dá pontos. Os atendimentos, os pacotes, os pré-pagos, os planos e o crédito interno vendido pontuam.',
      }}>
        {podeEditar ? (
          <SegSelect
            options={[{ key: 'nao', label: 'Não pontua' }, { key: 'sim', label: 'Pontua' }]}
            value={pontuaProduto ? 'sim' : 'nao'}
            onSelect={k => setPontuaProduto(k === 'sim')}
            ariaLabel="A venda de produto pontua"
          />
        ) : (
          <strong style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{pontuaProduto ? 'Pontua' : 'Não pontua'}</strong>
        )}
      </Bloco>

      <Bloco titulo="Quem troca pontos por recompensa" sobre={{
        rotulo: 'Como a troca funciona',
        texto: trocaNoPortal
          ? 'Além da ficha do cliente, ele troca os pontos pelo portal ou pelo app. O voucher aparece na hora para ele e na ficha para a equipe; o de desconto se usa no PDV, ao receber.'
          : 'A troca é feita pela ficha do cliente; o voucher de desconto se usa no PDV, ao receber. No portal, o cliente só vê o catálogo.',
      }}>
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
      </Bloco>

      <Bloco titulo="Comissão quando o cliente usa pontos">
        {/* Mudou de casa em 2026-09-30: é política de comissão, e mora com as
            outras (modo, descontos, período) em Configurações → Comissões e taxas. */}
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', lineHeight: 1.5 }}>
          <Fala>Agora se define em Configurações → Comissões e taxas, junto com as outras regras de comissão da rede.</Fala>
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

/** Número INTEIRO (mínimo, meses, bônus, dias): "1.000" é mil; o zod converte e recusa a fração. */
function numero(v: string): string {
  return v.trim().replace(/\./g, '').replace(',', '.')
}

/** As casas decimais de cada campo com fração: o valor do ponto vai a 0,0001. */
const CASAS = { taxa: 2, valorDoPonto: 4, teto: 2 } as const

/** Número com fração pela leitura do dinheiro (`parseDecimal`); vazio segue vazio (o zod responde). */
function decimal(v: string, casas: number): number | string {
  return v.trim() ? parseDecimal(v, casas) : ''
}
const numeroIlegivel = (v: string, casas: number) => v.trim() !== '' && !Number.isFinite(parseDecimal(v, casas))

function AvisoDoNumero({ valor, casas }: { valor: string; casas: number }) {
  if (!numeroIlegivel(valor, casas)) return null
  return (
    <span role="alert" style={{ fontSize: 'var(--text-2xs)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>
      {NUMERO_INVALIDO}
    </span>
  )
}

/**
 * Um campo numérico. O `dica` (o exemplo, a faixa) mora na dica ao lado do
 * rótulo (2026-11-16 — era uma linha embaixo do campo). O rótulo é LIGADO ao
 * campo pelo `htmlFor`: com a dica dentro de um <label> que envolve, o rótulo
 * ligaria o botão da dica, não o campo. O `sobre` é o nome da dica — sem o
 * texto do rótulo, para o getByLabel do campo não achar dois.
 */
function CampoNumero({ rotulo, nome, valor, onChange, dica, sobre, desabilitado, casas }: {
  rotulo: string; nome: string; valor: string; onChange: (v: string) => void; dica?: string; desabilitado?: boolean
  /** O nome acessível da dica. */
  sobre?: string
  /** Campo com fração: lê como o dinheiro e avisa o ambíguo. */
  casas?: number
}) {
  const id = useId()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={linhaComDica}>
        <label htmlFor={id} style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
          {rotulo}
        </label>
        {dica && <Dica rotulo={sobre ?? 'Como preencher'}>{dica}</Dica>}
      </span>
      <input id={id} name={nome} className="field" inputMode="decimal" value={valor}
        onChange={e => onChange(e.target.value)} disabled={desabilitado} />
      {casas != null && <AvisoDoNumero valor={valor} casas={casas} />}
    </div>
  )
}

/** Um opcional: liga/desliga, o número quando ligado e, na dica ao lado do título, o que acontece. */
function Opcional({ titulo, testId, opcoes, ligado, onChange, podeEditar, explicacao, sobre, children }: {
  titulo: string
  testId?: string
  opcoes: [{ key: string; label: string }, { key: string; label: string }]
  ligado: boolean
  onChange: (v: boolean) => void
  podeEditar: boolean
  explicacao?: string
  /** O nome acessível da dica (sem o título, que é o nome do seletor). */
  sobre: string
  children: React.ReactNode
}) {
  return (
    <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ ...linhaComDica, fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>
        <span>{titulo}</span>
        {explicacao && <Dica rotulo={sobre}>{explicacao}</Dica>}
      </span>
      {podeEditar ? (
        <SegSelect options={opcoes} value={ligado ? opcoes[1].key : opcoes[0].key}
          onSelect={k => onChange(k === opcoes[1].key)} ariaLabel={titulo} />
      ) : (
        <strong style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{ligado ? opcoes[1].label : opcoes[0].label}</strong>
      )}
      {ligado && <div style={{ maxWidth: 260 }}>{children}</div>}
    </div>
  )
}

/** Um bloco da tela; o que ele faz mora na dica ao lado do título. */
function Bloco({ titulo, sobre, children }: {
  titulo: string
  sobre?: { rotulo: string; texto: React.ReactNode }
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
      {sobre ? (
        <p className="overline" style={linhaComDica}>
          <span>{titulo}</span>
          <Dica rotulo={sobre.rotulo} largura={340}>{sobre.texto}</Dica>
        </p>
      ) : <p className="overline">{titulo}</p>}
      {children}
    </div>
  )
}

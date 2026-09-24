'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ChevronLeft, Play, Pause, Save, Plus, AlertCircle, CheckCircle2, ShieldCheck, History,
  X,
  GitBranch,
} from 'lucide-react'
import {
  NODES,
  type GrafoDeAutomacao, type TipoDeNo, type StatusDaAutomacao, type LimitesDaAutomacao,
} from '@estetica-os/types'
import { Quadro } from './quadro'
import { PainelDoNo } from './painel-do-no'
import { PainelDeLimites } from './painel-de-limites'
import { PainelDeExecucoes } from './painel-de-execucoes'
import { PainelDeVersoes } from './painel-de-versoes'
import { validarGrafo, ROTULOS, type ProblemaDoGrafo } from '@/lib/automacoes/validar'
import { novoIdDeNo, configPadrao } from '@/lib/automacoes/ids'
import { nomePadraoDoPasso, renomearPasso } from '@/lib/automacoes/passos'
import { salvarAutomacao, mudarStatusDaAutomacao, opcoesDoEditor } from '@/actions/automacoes'
import type { OpcoesDoEditor } from '@/actions/automacoes'
import type { AutomacaoCompleta } from '@/actions/automacoes'

/**
 * O editor de uma automação.
 *
 * **Salvar é explícito, não automático.** O grafo é regra de negócio que age
 * sozinha depois: gravar a cada arrastão gravaria estados intermediários — um
 * fluxo pela metade, ligado, disparando errado. O aviso de "não salvo" fica na
 * barra, e a validação corre a cada mudança para o problema aparecer enquanto
 * se monta, não só na hora de ligar.
 */

/** A paleta, na ordem em que um fluxo é pensado. */
const PALETA: { grupo: string; tipos: TipoDeNo[] }[] = [
  { grupo: 'Começa quando', tipos: [NODES.GATILHO_EVENTO, NODES.GATILHO_AGENDA] },
  { grupo: 'Decide',        tipos: [NODES.CONDICAO_SE, NODES.CONDICAO_ESCOLHA] },
  { grupo: 'Espera',        tipos: [NODES.ESPERA_DURACAO, NODES.ESPERA_ATE] },
  { grupo: 'Faz',           tipos: [
    NODES.ACAO_NOTIFICAR_EQUIPE, NODES.ACAO_ANOTAR, NODES.ACAO_MENSAGEM,
    NODES.ACAO_MOVER_ETAPA, NODES.ACAO_DESFECHO, NODES.ACAO_TAG_CLIENTE,
    NODES.ACAO_ATRIBUIR, NODES.BUSCAR_CLIENTES,
  ] },
]

/** Os que já rodam de verdade. Os outros entram no fluxo, mas param a execução. */
const EXECUTAVEIS: TipoDeNo[] = [
  NODES.GATILHO_EVENTO, NODES.CONDICAO_SE, NODES.CONDICAO_ESCOLHA,
  NODES.ACAO_NOTIFICAR_EQUIPE, NODES.ACAO_ANOTAR, NODES.ACAO_MENSAGEM,
  NODES.ACAO_MOVER_ETAPA, NODES.ACAO_DESFECHO, NODES.ACAO_TAG_CLIENTE,
  NODES.ACAO_ATRIBUIR, NODES.ESPERA_DURACAO, NODES.ESPERA_ATE,
  NODES.GATILHO_AGENDA, NODES.BUSCAR_CLIENTES,
]

export function EditorDeAutomacao({
  automacao, podeEditar,
}: { automacao: AutomacaoCompleta; podeEditar: boolean }) {
  const router = useRouter()
  const [nome, setNome]         = useState(automacao.nome)
  const [grafo, setGrafo]       = useState<GrafoDeAutomacao>(automacao.grafo)
  const [status, setStatus]     = useState<StatusDaAutomacao>(automacao.status)
  const [selecionado, setSel]   = useState<string | null>(null)
  const [sujo, setSujo]         = useState(false)
  const [enquadrar, setEnquadrar] = useState(0)
  const [opcoes, setOpcoes]       = useState<OpcoesDoEditor | null>(null)
  const [limites, setLimites]     = useState<LimitesDaAutomacao>(automacao.limites)
  // Um painel por vez: 'no' vem da seleção no quadro; os outros dois, da barra.
  const [gaveta, setGaveta] = useState<'limites' | 'execucoes' | 'versoes' | null>(null)
  // Só o celular usa: lá a paleta cobre o quadro em vez de ser uma coluna.
  const [paleta, setPaleta] = useState(false)
  const [salvando, salvar]      = useTransition()

  // Etapas, cargos, pessoas e tags: uma consulta ao abrir. Pedi-las por node
  // faria cada clique esperar uma ida ao banco.
  useEffect(() => { opcoesDoEditor().then(setOpcoes).catch(() => setOpcoes(null)) }, [])

  const problemas = useMemo(() => validarGrafo(grafo), [grafo])
  const erros     = problemas.filter(p => p.grau === 'erro')
  const comProblema = useMemo(
    () => new Set(problemas.filter(p => p.noId).map(p => p.noId!)),
    [problemas],
  )

  const noSelecionado = grafo.nos.find(n => n.id === selecionado) ?? null

  const mudarGrafo = useCallback((novo: GrafoDeAutomacao) => {
    setGrafo(novo)
    setSujo(true)
  }, [])

  function adicionar(tipo: TipoDeNo) {
    const id = novoIdDeNo()
    // Nasce à direita do último, para não empilhar tudo na origem do quadro.
    const ultimo = grafo.nos[grafo.nos.length - 1]
    const pos = ultimo
      ? { x: ultimo.pos.x + 280, y: ultimo.pos.y }
      : { x: 80, y: 120 }

    mudarGrafo({
      ...grafo,
      // Com os padrões do tipo: um node que nasce vazio mostra "A unidade do
      // fato" no painel e grava `alvo: undefined` — a tela dizendo uma coisa e
      // o banco guardando outra.
      //
      // E com nome: é por ele que os nodes seguintes leem o que este deixou
      // (`{{passos.mandar_mensagem.enviada}}`). Numerado a partir dos que já
      // existem, senão dois passos do mesmo tipo disputariam a mesma chave e o
      // segundo apagaria em silêncio o que o primeiro produziu.
      nos: [...grafo.nos, {
        id, tipo, pos,
        nome:   nomePadraoDoPasso(tipo, grafo),
        config: configPadrao(tipo),
      }],
    })
    setSel(id)
    // Reenquadra: o node novo nasce à direita e cairia fora da área visível
    // justamente quando o painel de configuração abre e come 320px da tela.
    setEnquadrar(n => n + 1)
  }

  function configurar(config: Record<string, unknown>) {
    if (!noSelecionado) return
    mudarGrafo({
      ...grafo,
      nos: grafo.nos.map(n => (n.id === noSelecionado.id ? { ...n, config } : n)),
    })
  }

  /**
   * Renomear o passo muda a chave por onde os seguintes o leem — e por isso
   * `renomearPasso` reescreve junto quem o citava.
   *
   * A troca acontece quando o campo perde o foco, não a cada tecla: renomeando
   * letra a letra, o nome passa por "" no meio do caminho, a chave some e as
   * referências ficariam apontando para um nome pela metade.
   */
  function renomearNo(nome: string) {
    if (!noSelecionado) return
    mudarGrafo(renomearPasso(grafo, noSelecionado.id, nome))
  }

  /**
   * Carrega uma versão antiga NA TELA — e só.
   *
   * Nada é gravado aqui: a versão entra como rascunho e vira realidade quando
   * a pessoa salvar, que é a regra do editor inteiro. Restaurar por engano não
   * pode trocar em silêncio um fluxo que está no ar; e como o salvamento grava
   * um retrato novo, voltar também não apaga a versão de onde se veio.
   */
  function restaurarVersao(v: {
    nome: string; grafo: GrafoDeAutomacao; limites: LimitesDaAutomacao
  }) {
    setNome(v.nome)
    setGrafo(v.grafo)
    setLimites(v.limites)
    setSel(null)
    setSujo(true)
    setEnquadrar(n => n + 1)
  }

  function excluirNo() {
    if (!noSelecionado) return
    mudarGrafo({
      nos: grafo.nos.filter(n => n.id !== noSelecionado.id),
      ligacoes: grafo.ligacoes.filter(
        l => l.de !== noSelecionado.id && l.para !== noSelecionado.id,
      ),
    })
    setSel(null)
  }

  function aoSalvar() {
    salvar(async () => {
      const r = await salvarAutomacao({ id: automacao.id, nome, grafo, limites })
      if (r.error) {
        toast.error(r.error, { description: r.problemas?.join(' · ') })
        return
      }
      setSujo(false)
      toast.success('Automação salva.')
      router.refresh()
    })
  }

  function alternarStatus() {
    const novo: StatusDaAutomacao = status === 'ATIVA' ? 'PAUSADA' : 'ATIVA'

    salvar(async () => {
      // Ligar com alterações na tela ligaria a versão do BANCO, não a que a
      // pessoa está vendo — e ela sairia convencida de que ligou o que montou.
      if (sujo) {
        const s = await salvarAutomacao({ id: automacao.id, nome, grafo, limites })
        if (s.error) {
          toast.error(s.error, { description: s.problemas?.join(' · ') })
          return
        }
        setSujo(false)
      }

      const r = await mudarStatusDaAutomacao(automacao.id, novo)
      if (r.error) {
        toast.error(r.error, { description: r.problemas?.join(' · ') })
        return
      }
      setStatus(novo)
      toast.success(novo === 'ATIVA' ? 'Automação ligada.' : 'Automação desligada.')
      router.refresh()
    })
  }

  const naoExecutaveis = grafo.nos.filter(n => !EXECUTAVEIS.includes(n.tipo as TipoDeNo))

  return (
    <div
      className="auto-editor"
      style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 92px)' }}
    >
      {/* -- Barra ---------------------------------------------------------- */}
      <div className="auto-barra" style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '0 0 14px', borderBottom: '1px solid var(--hairline)',
      }}>
        <Link href="/admin/automacoes" className="btn-ghost" style={{ padding: '4px 0', color: 'var(--text-muted)' }}>
          <ChevronLeft size={15} /> Automações
        </Link>

        <input
          value={nome}
          onChange={e => { setNome(e.target.value); setSujo(true) }}
          disabled={!podeEditar}
          style={{
            flex: 1, minWidth: 180, border: 'none', background: 'transparent',
            fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)',
            color: 'var(--text)', outline: 'none', padding: 0,
          }}
        />

        <span className={status === 'ATIVA' ? 'chip chip-success' : 'chip chip-muted'}>
          {status === 'ATIVA' ? 'Ligada' : status === 'PAUSADA' ? 'Desligada' : 'Rascunho'}
        </span>

        {podeEditar && (
          <>
            {/* No celular a paleta não cabe como coluna: vira esta gaveta. */}
            <button
              type="button" className="btn-secondary show-mobile"
              onClick={() => { setPaleta(true); setSel(null); setGaveta(null) }}
              style={{ alignItems: 'center', gap: 6, fontSize: 'var(--text-xs-sz)' }}
            >
              <Plus size={14} /> Passo
            </button>
            <button
              type="button" className="btn-ghost"
              onClick={() => { setGaveta(g => (g === 'execucoes' ? null : 'execucoes')); setSel(null) }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs-sz)' }}
              title="Histórico e ensaio" aria-label="Execuções"
            >
              <History size={14} /> <span className="auto-rotulo">Execuções</span>
            </button>
            <button
              type="button" className="btn-ghost"
              onClick={() => { setGaveta(g => (g === 'versoes' ? null : 'versoes')); setSel(null) }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs-sz)' }}
              title="Histórico do fluxo — e voltar para uma versão anterior" aria-label="Versões"
            >
              <GitBranch size={14} /> <span className="auto-rotulo">Versões</span>
            </button>
            <button
              type="button" className="btn-ghost"
              onClick={() => { setGaveta(g => (g === 'limites' ? null : 'limites')); setSel(null) }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs-sz)' }}
              title="Silêncio noturno e teto por cliente" aria-label="Limites"
            >
              <ShieldCheck size={14} /> <span className="auto-rotulo">Limites</span>
            </button>
            <button
              type="button" className="btn-secondary" onClick={aoSalvar}
              disabled={salvando || !sujo}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Save size={14} /> {sujo ? 'Salvar' : 'Salvo'}
            </button>
            <button
              type="button" className="btn-primary" onClick={alternarStatus}
              disabled={salvando || (status !== 'ATIVA' && erros.length > 0)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title={erros.length ? 'Corrija os problemas antes de ligar' : undefined}
            >
              {status === 'ATIVA' ? <><Pause size={14} /> Desligar</> : <><Play size={14} /> Ligar</>}
            </button>
          </>
        )}
      </div>

      {/* -- Corpo ---------------------------------------------------------- */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Paleta — coluna no desktop, gaveta de tela cheia no celular. */}
        {podeEditar && (
          <aside
            className="auto-paleta"
            data-aberta={paleta ? '1' : '0'}
            aria-label="Passos disponíveis"
            style={{
              width: 190, flexShrink: 0, overflowY: 'auto', paddingRight: 12,
              borderRight: '1px solid var(--hairline)',
            }}
          >
            {/* Só aparece quando a paleta está por cima do quadro; na coluna
                do desktop não há o que fechar. */}
            <div className="show-mobile" style={{
              alignItems: 'center', justifyContent: 'space-between',
              gap: 8, paddingBottom: 6, borderBottom: '1px solid var(--hairline)',
            }}>
              <span style={{ fontWeight: 'var(--weight-extrabold)', fontSize: 'var(--text-sm-sz)' }}>
                Adicionar passo
              </span>
              <button
                type="button" onClick={() => setPaleta(false)} className="btn-ghost"
                aria-label="Fechar" style={{ padding: 4 }}
              >
                <X size={15} />
              </button>
            </div>

            {PALETA.map(g => (
              <div key={g.grupo} style={{ marginTop: 14 }}>
                <p className="overline" style={{ marginBottom: 6 }}>{g.grupo}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {g.tipos.map(t => (
                    <button
                      key={t} type="button"
                      // No celular a paleta cobre o quadro: deixá-la aberta
                      // depois de escolher esconderia justamente o node que
                      // acabou de nascer, e o toque pareceria não ter feito
                      // nada — o mesmo sintoma que o reenquadramento resolveu.
                      onClick={() => { adicionar(t); setPaleta(false) }}
                      className="btn-ghost"
                      style={{
                        justifyContent: 'flex-start', textAlign: 'left',
                        fontSize: 'var(--text-xs-sz)', padding: '6px 8px',
                        opacity: EXECUTAVEIS.includes(t) ? 1 : 0.55,
                      }}
                      title={EXECUTAVEIS.includes(t) ? undefined : 'Ainda não executável'}
                    >
                      <Plus size={12} style={{ flexShrink: 0 }} />
                      {ROTULOS[t]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </aside>
        )}

        {/* Quadro + avisos */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <Quadro
              grafo={grafo}
              onChange={mudarGrafo}
              selecionado={selecionado}
              onSelecionar={setSel}
              comProblema={comProblema}
              enquadrarEm={enquadrar}
              somenteLeitura={!podeEditar}
            />
          </div>

          <ListaDeProblemas problemas={problemas} naoExecutaveis={naoExecutaveis.length} />
        </div>

        {/* Um painel por vez: os dois juntos comeriam 640px do quadro, e as
            duas coisas se configuram em momentos diferentes. */}
        {noSelecionado ? (
          <PainelDoNo
            // Remonta ao trocar de node: o painel guarda estado próprio (o
            // campo escrito à mão, a amostra do evento), e reaproveitá-lo
            // mostraria o do node anterior no formulário do novo.
            key={noSelecionado.id}
            no={noSelecionado}
            // O grafo inteiro porque a lista de campos depende de ONDE o node
            // está: o payload do gatilho que o alimenta e o que os passos
            // anteriores a ele deixaram.
            grafo={grafo}
            opcoes={opcoes}
            onChange={configurar}
            onRenomear={renomearNo}
            onExcluir={excluirNo}
            onFechar={() => setSel(null)}
            somenteLeitura={!podeEditar}
          />
        ) : gaveta === 'limites' ? (
          <PainelDeLimites
            limites={limites}
            onChange={l => { setLimites(l); setSujo(true) }}
            onFechar={() => setGaveta(null)}
            somenteLeitura={!podeEditar}
          />
        ) : gaveta === 'versoes' ? (
          <PainelDeVersoes
            automacaoId={automacao.id}
            podeEditar={podeEditar}
            onFechar={() => setGaveta(null)}
            onRestaurar={restaurarVersao}
          />
        ) : gaveta === 'execucoes' ? (
          <PainelDeExecucoes
            automacaoId={automacao.id}
            podeEditar={podeEditar}
            onFechar={() => setGaveta(null)}
          />
        ) : null}
      </div>
    </div>
  )
}

function ListaDeProblemas({
  problemas, naoExecutaveis,
}: { problemas: ProblemaDoGrafo[]; naoExecutaveis: number }) {
  const erros  = problemas.filter(p => p.grau === 'erro')
  const avisos = problemas.filter(p => p.grau === 'aviso')

  if (!problemas.length && !naoExecutaveis) {
    return (
      <div className="auto-rodape" style={{
        padding: '9px 14px', borderTop: '1px solid var(--hairline)',
        display: 'flex', alignItems: 'center', gap: 7,
        fontSize: 'var(--text-xs-sz)', color: 'var(--success)',
      }}>
        <CheckCircle2 size={14} /> O fluxo está pronto para ligar.
      </div>
    )
  }

  return (
    <div className="auto-rodape" style={{
      padding: '9px 14px', borderTop: '1px solid var(--hairline)',
      maxHeight: 108, overflowY: 'auto',
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      {erros.map((p, i) => (
        <p key={`e${i}`} style={{ fontSize: 'var(--text-xs-sz)', color: '#b42318', display: 'flex', gap: 6 }}>
          <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {p.mensagem}
        </p>
      ))}
      {avisos.map((p, i) => (
        <p key={`a${i}`} style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', display: 'flex', gap: 6 }}>
          <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {p.mensagem}
        </p>
      ))}
      {naoExecutaveis > 0 && (
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          {naoExecutaveis === 1
            ? 'Um node do fluxo ainda não é executável: a automação vai parar nele.'
            : `${naoExecutaveis} nodes do fluxo ainda não são executáveis: a automação vai parar no primeiro deles.`}
        </p>
      )}
    </div>
  )
}

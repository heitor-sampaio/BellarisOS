'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ChevronLeft, Play, Pause, Save, Plus, AlertCircle, CheckCircle2, ShieldCheck, History,
  X, Trash2, AlertTriangle,
  GitBranch,
} from 'lucide-react'
import {
  NODES,
  type GrafoDeAutomacao, type TipoDeNo, type StatusDaAutomacao, type LimitesDaAutomacao,
} from '@estetica-os/types'
import { Quadro } from './quadro'
import { JanelaModal } from '@/components/shared/janela-modal'
import { useAvisoAoSair } from '@/lib/use-aviso-ao-sair'
import { ICONE_DO_NO } from './no-do-quadro'
import { PainelDoNo } from './painel-do-no'
import { PainelDeLimites } from './painel-de-limites'
import { PainelDeExecucoes } from './painel-de-execucoes'
import { PainelDeVersoes } from './painel-de-versoes'
import { validarGrafo, ROTULOS, type ProblemaDoGrafo } from '@/lib/automacoes/validar'
import { novoIdDeNo, novoIdDeLigacao, configPadrao } from '@/lib/automacoes/ids'
import { encaixarPasso } from '@/lib/automacoes/encaixe'
import { nomePadraoDoPasso, renomearPasso } from '@/lib/automacoes/passos'
import { salvarAutomacao, mudarStatusDaAutomacao, opcoesDoEditor, excluirAutomacao, contarAntesDeLigar } from '@/actions/automacoes'
import { canaisParaACliente, explicacaoAntesDeLigar, textoAntesDeLigar } from '@/lib/automacoes/antes-de-ligar'
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
    // Nasce à direita do anterior — o aberto no painel ou, sem nenhum, o
    // último que entrou — e já LIGADO a ele pela primeira saída livre (J-14).
    // Solto, cada passo pedia um arrasto de alça a alça.
    const { pos, ligacao } = encaixarPasso(grafo, tipo, selecionado)

    mudarGrafo({
      ligacoes: ligacao
        ? [...grafo.ligacoes, { id: novoIdDeLigacao(), de: ligacao.de, para: id, saida: ligacao.saida }]
        : grafo.ligacoes,
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

  // C65 (H1 do levantamento, F69) e A10 da 14ª (F71): antes de LIGAR um
  // fluxo que chega à cliente — por qualquer canal, o aviso no celular
  // incluído —, a tela diz quantas a busca acharia e quantas a mensagem
  // alcança. A regra mora em lib/automacoes/antes-de-ligar.ts.
  const canaisDaCliente = canaisParaACliente(grafo)
  const [antesDeLigar, setAntesDeLigar] = useState<null | { texto: string | null; erro?: string }>(null)

  function pedirParaLigar() {
    if (status === 'ATIVA' || canaisDaCliente.length === 0) { alternarStatus(); return }
    setAntesDeLigar({ texto: null })
    const busca = grafo.nos.find(n => n.tipo === NODES.BUSCAR_CLIENTES)
    contarAntesDeLigar(busca ? busca.config : null, canaisDaCliente)
      .then(r => {
        if ('error' in r) { setAntesDeLigar({ texto: null, erro: r.error }); return }
        setAntesDeLigar({ texto: textoAntesDeLigar(r) })
      })
      .catch(() => setAntesDeLigar({ texto: null, erro: 'Não consegui contar agora — dá para ligar assim mesmo.' }))
  }

  function alternarStatus() {
    const novo: StatusDaAutomacao = status === 'ATIVA' ? 'PAUSADA' : 'ATIVA'
    setAntesDeLigar(null)

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

  // Excluir existia no servidor desde o começo e nunca teve botão (2026-09-28).
  // Só aparece DESLIGADA: a action recusa apagar o que está agindo agora, e
  // oferecer o botão com ela ligada seria prometer o que não acontece.
  const confirmarExclusao = useRef<HTMLDialogElement>(null)
  const [excluindo, startExcluir] = useTransition()
  function excluir() {
    startExcluir(async () => {
      const r = await excluirAutomacao(automacao.id)
      if (r.error) { toast.error(r.error); return }
      confirmarExclusao.current?.close()
      toast.success('Automação excluída.')
      router.push('/admin/automacoes')
    })
  }

  const naoExecutaveis = grafo.nos.filter(n => !EXECUTAVEIS.includes(n.tipo as TipoDeNo))
  // A12 da 7ª simulação: sair com alteração solta pergunta antes (o fluxo
  // montado se perdia sem aviso). Salvar continua explícito.
  const aviso = useAvisoAoSair(sujo && podeEditar)
  function salvarESair() {
    salvar(async () => {
      const r = await salvarAutomacao({ id: automacao.id, nome, grafo, limites })
      if (r.error) { toast.error(r.error, { description: r.problemas?.join(' · ') }); aviso.ficar(); return }
      setSujo(false)
      aviso.sair()
    })
  }

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
          aria-label="Nome da automação"
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
            {/* Consultar e agir eram seis botões do mesmo tamanho em fila:
                Execuções, Versões e Limites ABREM uma gaveta; Salvar e Ligar
                MUDAM a automação. Os três primeiros viram um segmento só —
                juntos, com o fundo do app e divisórias —, que é como o sistema
                já trata escolha de período no dashboard. A separação é o que
                faz "Ligar" parecer o que é. */}
            <div className="auto-segmento">
              <button
                type="button"
                className={gaveta === 'execucoes' ? 'auto-segmento__item is-ativo' : 'auto-segmento__item'}
                onClick={() => { setGaveta(g => (g === 'execucoes' ? null : 'execucoes')); setSel(null) }}
                title="Histórico e ensaio" aria-label="Execuções"
              >
                <History size={14} /> <span className="auto-rotulo">Execuções</span>
              </button>
              <button
                type="button"
                className={gaveta === 'versoes' ? 'auto-segmento__item is-ativo' : 'auto-segmento__item'}
                onClick={() => { setGaveta(g => (g === 'versoes' ? null : 'versoes')); setSel(null) }}
                title="Histórico do fluxo — e voltar para uma versão anterior" aria-label="Versões"
              >
                <GitBranch size={14} /> <span className="auto-rotulo">Versões</span>
              </button>
              <button
                type="button"
                className={gaveta === 'limites' ? 'auto-segmento__item is-ativo' : 'auto-segmento__item'}
                onClick={() => { setGaveta(g => (g === 'limites' ? null : 'limites')); setSel(null) }}
                title="Silêncio noturno e teto por cliente" aria-label="Limites"
              >
                <ShieldCheck size={14} /> <span className="auto-rotulo">Limites</span>
              </button>
            </div>

            {/* A12 da 7ª simulação: o "Salvar" fica SEMPRE no lugar (só
                aparecia depois de mexer, e quem procurava não achava), e o
                estado ao lado diz se há o que salvar. */}
            <span data-estado-do-salvo style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 'var(--text-xs-sz)', color: sujo ? 'var(--warning)' : 'var(--text-faint)',
              fontWeight: sujo ? 'var(--weight-bold)' : undefined,
              padding: '0 4px', whiteSpace: 'nowrap',
            }}>
              {sujo
                ? <><AlertTriangle size={13} /> <span className="auto-rotulo">Não salvo</span></>
                : <><CheckCircle2 size={13} /> <span className="auto-rotulo">Salvo</span></>}
            </span>
            <button
              type="button" className="btn-secondary" onClick={aoSalvar}
              disabled={salvando || !sujo}
              title={sujo ? undefined : 'Nada a salvar: tudo o que está na tela já está salvo.'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Save size={14} /> Salvar
            </button>
            {status !== 'ATIVA' && (
              <button
                type="button" className="btn-ghost" onClick={() => confirmarExclusao.current?.showModal()}
                disabled={salvando || excluindo}
                title="Excluir automação" aria-label="Excluir automação"
                style={{ color: 'var(--danger)', padding: '6px 8px' }}
              >
                <Trash2 size={15} />
              </button>
            )}
            <button
              type="button" className="btn-primary" onClick={pedirParaLigar}
              disabled={salvando || (status !== 'ATIVA' && erros.length > 0)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title={erros.length ? 'Corrija os problemas antes de ligar' : undefined}
            >
              {status === 'ATIVA' ? <><Pause size={14} /> Desligar</> : <><Play size={14} /> Ligar</>}
            </button>
          </>
        )}
      </div>

      {antesDeLigar && (
        <JanelaModal rotulo="Ligar a automação?" largura={460} travado={salvando} onFechar={() => setAntesDeLigar(null)}>
          <div data-antes-de-ligar style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
              Ligar a automação?
            </p>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {explicacaoAntesDeLigar(canaisDaCliente)}
            </p>
            <p role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 'var(--weight-bold)', lineHeight: 1.5 }}>
              {antesDeLigar.erro ?? antesDeLigar.texto ?? 'Contando as clientes…'}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary" onClick={() => setAntesDeLigar(null)} disabled={salvando}>Agora não</button>
              <button type="button" className="btn-primary" onClick={alternarStatus} disabled={salvando}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Play size={14} /> {salvando ? 'Ligando…' : 'Ligar'}
              </button>
            </div>
          </div>
        </JanelaModal>
      )}

      {aviso.destino && (
        <JanelaModal rotulo="Sair sem salvar?" largura={420} papel="alertdialog" travado={salvando} onFechar={aviso.ficar}>
          <div data-sair-sem-salvar style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
              Sair sem salvar?
            </p>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              A automação tem alterações não salvas. Saindo agora, elas se perdem — a versão salva continua como estava.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn-ghost" onClick={aviso.sair} disabled={salvando}>Sair sem salvar</button>
              <button type="button" className="btn-secondary" onClick={aviso.ficar} disabled={salvando}>Continuar editando</button>
              <button type="button" className="btn-primary" onClick={salvarESair} disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar e sair'}
              </button>
            </div>
          </div>
        </JanelaModal>
      )}

      <dialog
        ref={confirmarExclusao}
        className="modal"
        style={{ maxWidth: 400 }}
        onClick={e => { if (e.target === confirmarExclusao.current) confirmarExclusao.current?.close() }}
      >
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
            Excluir automação?
          </p>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text)' }}>{nome}</strong> sai da lista, com o histórico de
            execuções dela. O que ela já fez — mensagens enviadas, cards movidos — continua registrado
            onde aconteceu. Não dá para desfazer.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={() => confirmarExclusao.current?.close()} disabled={excluindo}>
              Cancelar
            </button>
            <button
              type="button" onClick={excluir} disabled={excluindo} className="btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--danger)', background: 'var(--danger-soft)' }}
            >
              <Trash2 size={14} /> {excluindo ? 'Excluindo…' : 'Excluir'}
            </button>
          </div>
        </div>
      </dialog>

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

            {/* A paleta era uma lista de "+ rótulo" em texto puro — e o card
                que nasce dela TEM ícone. Nada ligava o que se escolhe ao que
                aparece no quadro. Agora cada item mostra o mesmo ícone do
                node, no mesmo quadrado arredondado, e a paleta lê como uma
                prateleira de peças em vez de um índice. */}
            {PALETA.map(g => (
              <div key={g.grupo} style={{ marginTop: 16 }}>
                <p className="overline" style={{ marginBottom: 7 }}>{g.grupo}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {g.tipos.map(t => {
                    const Icone = ICONE_DO_NO[t] ?? Plus
                    const executavel = EXECUTAVEIS.includes(t)
                    return (
                      <button
                        key={t} type="button"
                        // No celular a paleta cobre o quadro: deixá-la aberta
                        // depois de escolher esconderia justamente o node que
                        // acabou de nascer, e o toque pareceria não ter feito
                        // nada — o mesmo sintoma que o reenquadramento resolveu.
                        onClick={() => { adicionar(t); setPaleta(false) }}
                        className="item-da-paleta"
                        style={{ opacity: executavel ? 1 : 0.5 }}
                        title={executavel ? undefined : 'Ainda não executável'}
                      >
                        <span className="item-da-paleta__icone">
                          <Icone size={13} />
                        </span>
                        {ROTULOS[t]}
                      </button>
                    )
                  })}
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

  // O rodapé era texto solto sobre o fundo do quadro, sem superfície — e é o
  // lugar onde se lê por que o botão "Ligar" está apagado. Agora é uma faixa
  // com fundo e borda, no mesmo padrão de alerta que o dashboard usa: a cor
  // vem do pior grau presente, porque um erro no meio de três avisos não pode
  // ler como aviso.
  const grau = erros.length ? 'erro' : avisos.length ? 'aviso' : 'ok'
  const paleta = {
    erro:  { fundo: 'var(--danger-soft)',  borda: 'var(--danger-border)' },
    aviso: { fundo: 'var(--warning-soft)', borda: 'var(--warning-border)' },
    ok:    { fundo: 'var(--success-bg)',   borda: 'var(--success-border)' },
  }[grau]

  if (!problemas.length && !naoExecutaveis) {
    return (
      <div className="auto-rodape" style={{
        padding: '10px 14px', borderTop: `1px solid ${paleta.borda}`, background: paleta.fundo,
        display: 'flex', alignItems: 'center', gap: 7,
        fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)', color: 'var(--success)',
      }}>
        <CheckCircle2 size={14} /> O fluxo está pronto para ligar.
      </div>
    )
  }

  return (
    <div className="auto-rodape" style={{
      padding: '10px 14px', borderTop: `1px solid ${paleta.borda}`, background: paleta.fundo,
      maxHeight: 108, overflowY: 'auto',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      {erros.map((p, i) => (
        <p key={`e${i}`} style={{
          fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
          color: 'var(--danger)', display: 'flex', gap: 6,
        }}>
          <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {p.mensagem}
        </p>
      ))}
      {avisos.map((p, i) => (
        <p key={`a${i}`} style={{
          fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
          color: 'var(--warning)', display: 'flex', gap: 6,
        }}>
          <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {p.mensagem}
        </p>
      ))}
      {naoExecutaveis > 0 && (
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-soft)' }}>
          {naoExecutaveis === 1
            ? 'Um node do fluxo ainda não é executável: a automação vai parar nele.'
            : `${naoExecutaveis} nodes do fluxo ainda não são executáveis: a automação vai parar no primeiro deles.`}
        </p>
      )}
    </div>
  )
}


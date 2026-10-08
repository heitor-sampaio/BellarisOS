'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  Sparkles, X, History, Plus, Paperclip, Mic, Square, SendHorizontal, Trash2, Loader2, FileText, Image as ImageIcon, AudioLines,
} from 'lucide-react'
import { abrirConversaDoCopilot, apagarConversaDoCopilot, listarConversasDoCopilot } from '@/actions/copilot'
import { erroParaTela } from '@/lib/erro-na-tela'
import { TextoDoCopilot } from '@/components/copilot/texto-do-copilot'
import { CartaoDoCopilot } from '@/components/copilot/cartao-do-copilot'
import {
  ANEXOS_MAXIMOS, TEXTO_MAXIMO,
  type AnexoNaTela, type Cartao, type ConversaNaLista, type EventoDoCopilot, type MensagemNaTela,
} from '@/lib/copilot/tipos'

/**
 * O Copilot — a secretária virtual, flutuando sobre todas as telas da equipe
 * (montado nos layouts de /admin e /[slug], nunca no portal do cliente).
 *
 * O chat vai pela rota `/api/copilot` (a resposta chega em streaming, SSE); o
 * resto (conversas, confirmar um cartão) por actions. A conversa aberta fica
 * na aba (sessionStorage): navegar ou recarregar não a perde.
 */

const CHAVE_DA_CONVERSA = 'bellaris:copilot:conversa'
const CHAVE_DO_PAINEL = 'bellaris:copilot:aberto'
const ACEITOS = 'image/jpeg,image/png,image/webp,application/pdf,.txt,.csv'

const SUGESTOES = [
  'Quais são os horários livres amanhã?',
  'Quem são os agendamentos de hoje?',
  'Quanto faturamos este mês?',
  'Cadastrar uma cliente nova',
]

function guardado(chave: string): string | null {
  try { return window.sessionStorage.getItem(chave) } catch { return null }
}
function guardar(chave: string, valor: string | null) {
  try {
    if (valor === null) window.sessionStorage.removeItem(chave)
    else window.sessionStorage.setItem(chave, valor)
  } catch { /* sem sessionStorage: só não lembra */ }
}

function tipoDoArquivo(f: File): AnexoNaTela['tipo'] {
  if (f.type.startsWith('image/')) return 'imagem'
  if (f.type.startsWith('audio/')) return 'audio'
  return 'documento'
}

function IconeDoAnexo({ tipo }: { tipo: AnexoNaTela['tipo'] }) {
  if (tipo === 'imagem') return <ImageIcon size={12} />
  if (tipo === 'audio') return <AudioLines size={12} />
  return <FileText size={12} />
}

function quando(iso: string): string {
  const d = new Date(iso)
  const hoje = new Date()
  const mesmoDia = d.toDateString() === hoje.toDateString()
  return mesmoDia
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

/** Lê o stream SSE da rota e entrega cada evento. */
async function lerEventos(res: Response, aoEvento: (e: EventoDoCopilot) => void) {
  const leitor = res.body!.getReader()
  const decodificador = new TextDecoder()
  let resto = ''
  for (;;) {
    const { value, done } = await leitor.read()
    if (done) break
    resto += decodificador.decode(value, { stream: true })
    let fim: number
    while ((fim = resto.indexOf('\n\n')) >= 0) {
      const bloco = resto.slice(0, fim)
      resto = resto.slice(fim + 2)
      const dados = bloco.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('')
      if (!dados) continue
      try { aoEvento(JSON.parse(dados) as EventoDoCopilot) } catch { /* bloco quebrado */ }
    }
  }
}

/** A gravação de voz: MediaRecorder com o formato padrão do navegador (a transcrição aceita todos). */
function useGravador(aoTerminar: (arquivo: File) => void) {
  const [gravando, setGravando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const gravadorRef = useRef<MediaRecorder | null>(null)
  const pedacosRef = useRef<Blob[]>([])
  const relogioRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const parar = useCallback(() => {
    gravadorRef.current?.stop()
  }, [])

  const comecar = useCallback(async (): Promise<string | null> => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'Este navegador não grava áudio.'
    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch {
      return 'Sem acesso ao microfone. Libere o microfone nas permissões do navegador.'
    }
    const gravador = new MediaRecorder(stream)
    pedacosRef.current = []
    gravador.ondataavailable = e => { if (e.data.size > 0) pedacosRef.current.push(e.data) }
    gravador.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      if (relogioRef.current) clearInterval(relogioRef.current)
      setGravando(false)
      const tipo = (gravador.mimeType || 'audio/webm').split(';')[0]!
      const extensao = tipo.includes('mp4') ? 'm4a' : tipo.includes('ogg') ? 'ogg' : tipo.includes('mpeg') ? 'mp3' : 'webm'
      const blob = new Blob(pedacosRef.current, { type: tipo })
      if (blob.size > 0) aoTerminar(new File([blob], `audio-${Date.now()}.${extensao}`, { type: tipo }))
    }
    gravadorRef.current = gravador
    gravador.start()
    setSegundos(0)
    setGravando(true)
    relogioRef.current = setInterval(() => setSegundos(s => s + 1), 1000)
    return null
  }, [aoTerminar])

  useEffect(() => () => {
    if (relogioRef.current) clearInterval(relogioRef.current)
    const g = gravadorRef.current
    if (g && g.state !== 'inactive') { g.onstop = null; g.stop() }
  }, [])

  return { gravando, segundos, comecar, parar }
}

export function Copilot() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const pagina = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`

  const [aberto, setAberto] = useState(false)
  const [vista, setVista] = useState<'chat' | 'conversas'>('chat')
  const [conversaId, setConversaId] = useState<string | null>(null)
  const [titulo, setTitulo] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<MensagemNaTela[]>([])
  const [conversas, setConversas] = useState<ConversaNaLista[] | null>(null)
  const [texto, setTexto] = useState('')
  const [anexos, setAnexos] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)
  const [pensando, setPensando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  // O que o leitor de tela anuncia: a resposta INTEIRA, quando termina (não cada pedaço).
  const [anuncio, setAnuncio] = useState('')
  const corpoRef = useRef<HTMLDivElement>(null)
  const campoRef = useRef<HTMLTextAreaElement>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)

  const rolarParaOFim = useCallback(() => {
    requestAnimationFrame(() => {
      const el = corpoRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [])

  const carregarConversa = useCallback(async (id: string) => {
    setCarregando(true)
    setErro(null)
    try {
      const r = await abrirConversaDoCopilot(id)
      if ('error' in r) { guardar(CHAVE_DA_CONVERSA, null); setConversaId(null); setMensagens([]); return }
      setConversaId(id)
      setMensagens(r.mensagens)
      guardar(CHAVE_DA_CONVERSA, id)
      rolarParaOFim()
    } catch (e) {
      setErro(erroParaTela(e, 'Não foi possível abrir a conversa.'))
    } finally {
      setCarregando(false)
    }
  }, [rolarParaOFim])

  // A aba lembra se o painel estava aberto e qual conversa.
  useEffect(() => {
    const id = guardado(CHAVE_DA_CONVERSA)
    const estavaAberto = guardado(CHAVE_DO_PAINEL) === '1'
    // Leitura do armazenamento da aba depois de montar (não existe no servidor).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (estavaAberto) setAberto(true)
    if (id) void carregarConversa(id)
  }, [carregarConversa])

  // Atalho: Ctrl/Cmd + J abre e fecha; Esc fecha.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
        setAberto(a => { if (a) guardar(CHAVE_DO_PAINEL, null); return false })
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setAberto(a => { guardar(CHAVE_DO_PAINEL, a ? null : '1'); return !a })
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  useEffect(() => {
    if (aberto && vista === 'chat') campoRef.current?.focus()
  }, [aberto, vista])

  function abrirOuFechar(abrir: boolean) {
    setAberto(abrir)
    guardar(CHAVE_DO_PAINEL, abrir ? '1' : null)
  }

  function novaConversa() {
    setConversaId(null)
    setTitulo(null)
    setMensagens([])
    setErro(null)
    setVista('chat')
    guardar(CHAVE_DA_CONVERSA, null)
  }

  async function verConversas() {
    setVista('conversas')
    setErro(null)
    try { setConversas(await listarConversasDoCopilot()) } catch (e) {
      setErro(erroParaTela(e, 'Não foi possível listar as conversas.'))
    }
  }

  async function apagar(id: string) {
    try {
      const r = await apagarConversaDoCopilot(id)
      if (!r.ok) { setErro(r.error ?? 'Não foi possível apagar.'); return }
      setConversas(c => (c ?? []).filter(x => x.id !== id))
      if (id === conversaId) novaConversa()
    } catch (e) {
      setErro(erroParaTela(e, 'Não foi possível apagar.'))
    }
  }

  function atualizarCartao(mensagemId: string, novo: Cartao) {
    setMensagens(ms => ms.map(m => m.id !== mensagemId ? m : {
      ...m,
      cartoes: (m.cartoes ?? []).map(c => c.tipo === 'acao' && novo.tipo === 'acao' && c.acaoId === novo.acaoId ? novo : c),
    }))
  }

  const enviar = useCallback(async (entrada: { texto: string; anexos: File[] }) => {
    const fala = entrada.texto.trim()
    if ((!fala && entrada.anexos.length === 0) || enviando) return
    setErro(null)
    setEnviando(true)
    setPensando('Pensando…')
    const idUsuario = `local-u-${Date.now()}`
    const idResposta = `local-a-${Date.now()}`
    setMensagens(ms => [
      ...ms,
      { id: idUsuario, papel: 'user', texto: fala, anexos: entrada.anexos.map(a => ({ nome: a.name, tipo: tipoDoArquivo(a) })), criadaEm: new Date().toISOString() },
      { id: idResposta, papel: 'assistant', texto: '', cartoes: [], criadaEm: new Date().toISOString() },
    ])
    setTexto('')
    setAnexos([])
    if (campoRef.current) campoRef.current.style.height = 'auto'
    rolarParaOFim()

    const form = new FormData()
    form.append('texto', fala)
    form.append('pagina', pagina)
    if (conversaId) form.append('conversaId', conversaId)
    for (const a of entrada.anexos) form.append('anexos', a)

    const naResposta = (f: (m: MensagemNaTela) => MensagemNaTela) =>
      setMensagens(ms => ms.map(m => m.id === idResposta ? f(m) : m))

    try {
      const res = await fetch('/api/copilot', { method: 'POST', body: form })
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null) as { error?: string } | null
        setErro(j?.error ?? 'Não foi possível falar com o Copilot. Tente de novo.')
        setMensagens(ms => ms.filter(m => m.id !== idResposta))
        return
      }
      await lerEventos(res, e => {
        if (e.tipo === 'conversa') {
          setConversaId(e.id); setTitulo(e.titulo); guardar(CHAVE_DA_CONVERSA, e.id)
        } else if (e.tipo === 'transcricao') {
          setMensagens(ms => ms.map(m => m.id === idUsuario ? { ...m, texto: [m.texto, e.texto].filter(Boolean).join('\n') } : m))
        } else if (e.tipo === 'texto') {
          setPensando(null)
          naResposta(m => ({ ...m, texto: m.texto + e.delta }))
          rolarParaOFim()
        } else if (e.tipo === 'pensando') {
          setPensando(e.rotulo)
        } else if (e.tipo === 'cartao') {
          naResposta(m => ({ ...m, cartoes: [...(m.cartoes ?? []), e.cartao] }))
          rolarParaOFim()
        } else if (e.tipo === 'erro') {
          setErro(e.mensagem)
        }
      })
      // Resposta sem texto nem cartão (o erro já foi dito): some o balão vazio.
      setMensagens(ms => {
        const final = ms.find(m => m.id === idResposta)
        if (final?.texto.trim()) setAnuncio(final.texto.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'))
        return ms.filter(m => m.id !== idResposta || m.texto.trim() || (m.cartoes?.length ?? 0) > 0)
      })
    } catch {
      setErro('A conexão caiu no meio da resposta. Tente de novo.')
    } finally {
      setEnviando(false)
      setPensando(null)
      rolarParaOFim()
    }
  }, [conversaId, enviando, pagina, rolarParaOFim])

  // O áudio vai para a conversa ABERTA quando a gravação termina, não para a
  // de quando começou: o envio mais recente fica num ref.
  const enviarRef = useRef(enviar)
  useEffect(() => { enviarRef.current = enviar }, [enviar])
  const gravador = useGravador(useCallback((arquivo: File) => {
    void enviarRef.current({ texto: '', anexos: [arquivo] })
  }, []))

  function escolherArquivos(lista: FileList | null) {
    if (!lista) return
    const novos = [...anexos, ...Array.from(lista)].slice(0, ANEXOS_MAXIMOS)
    if (anexos.length + lista.length > ANEXOS_MAXIMOS) setErro(`No máximo ${ANEXOS_MAXIMOS} anexos por vez.`)
    setAnexos(novos)
  }

  async function microfone() {
    if (gravador.gravando) { gravador.parar(); return }
    const problema = await gravador.comecar()
    if (problema) setErro(problema)
  }

  // No inbox, o botão sobe: embaixo, à direita, mora o "Enviar" da conversa.
  const subir = /\/inbox(\/|$)/.test(pathname)

  if (!aberto) {
    return (
      <button type="button" className="copilot-botao" data-subir={subir ? 'sim' : 'nao'}
        onClick={() => abrirOuFechar(true)} aria-label="Copilot" aria-expanded="false" title="Copilot (Ctrl+J)">
        <Sparkles size={18} />
        <span className="copilot-botao-rotulo">Copilot</span>
      </button>
    )
  }

  return (
    <section className="copilot-painel" role="dialog" aria-label="Copilot" aria-modal="false">
      <header className="copilot-cabecalho">
        <div className="copilot-titulo">
          <span className="copilot-icone"><Sparkles size={15} /></span>
          <div>
            <strong>Copilot</strong>
            <span>{vista === 'conversas' ? 'Suas conversas' : (titulo ?? (conversaId ? 'Conversa' : 'Sua secretária virtual'))}</span>
          </div>
        </div>
        <button type="button" className="copilot-acao-topo" aria-label="Conversas" aria-pressed={vista === 'conversas'}
          onClick={() => vista === 'conversas' ? setVista('chat') : void verConversas()} title="Conversas">
          <History size={16} />
        </button>
        <button type="button" className="copilot-acao-topo" aria-label="Nova conversa" onClick={novaConversa} title="Nova conversa">
          <Plus size={16} />
        </button>
        <button type="button" className="copilot-acao-topo" aria-label="Fechar o Copilot" onClick={() => abrirOuFechar(false)} title="Fechar">
          <X size={16} />
        </button>
      </header>

      {vista === 'conversas' ? (
        <div className="copilot-corpo">
          {conversas === null ? (
            <span className="copilot-pensando"><Loader2 size={13} className="animate-spin" /> Carregando…</span>
          ) : conversas.length === 0 ? (
            <div className="copilot-vazio"><p>Nenhuma conversa ainda.</p></div>
          ) : (
            <ul className="copilot-conversas" aria-label="Conversas do Copilot">
              {conversas.map(c => (
                <li key={c.id}>
                  <button type="button" className="copilot-conversa" onClick={() => { setVista('chat'); setTitulo(c.titulo); void carregarConversa(c.id) }}>
                    <span>{c.titulo}</span>
                    <small>{quando(c.atualizadaEm)}</small>
                  </button>
                  <button type="button" className="copilot-acao-topo" aria-label={`Apagar a conversa ${c.titulo}`} onClick={() => void apagar(c.id)}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {erro && <div className="copilot-erro" role="alert">{erro}</div>}
        </div>
      ) : (
        <>
          <div className="copilot-anuncio" aria-live="polite">{anuncio}</div>
          <div className="copilot-corpo" ref={corpoRef}>
            {carregando && <span className="copilot-pensando"><Loader2 size={13} className="animate-spin" /> Carregando…</span>}
            {!carregando && mensagens.length === 0 && (
              <div className="copilot-vazio">
                <p>Olá! Peça o que precisar: consultar a agenda, achar um cliente, ver números, cadastrar ou agendar. Toda gravação passa pela sua confirmação.</p>
                {SUGESTOES.map(s => (
                  <button key={s} type="button" className="copilot-sugestao" onClick={() => { setTexto(s); campoRef.current?.focus() }}>{s}</button>
                ))}
              </div>
            )}
            {mensagens.map(m => (
              <div key={m.id} className="copilot-msg" data-papel={m.papel}>
                {m.papel === 'user' && (m.anexos?.length ?? 0) > 0 && (
                  <div className="copilot-anexos-da-msg">
                    {m.anexos!.map((a, i) => <span key={i} className="copilot-anexo"><IconeDoAnexo tipo={a.tipo} /><span>{a.tipo === 'audio' ? 'Áudio' : a.nome}</span></span>)}
                  </div>
                )}
                {m.texto && (
                  <div className="copilot-balao">
                    {m.papel === 'assistant' ? <TextoDoCopilot texto={m.texto} /> : m.texto}
                  </div>
                )}
                {(m.cartoes ?? []).map((c, i) => (
                  <CartaoDoCopilot key={c.tipo === 'acao' ? c.acaoId : `l-${i}`} cartao={c} pagina={pagina}
                    aoMudar={novo => atualizarCartao(m.id, novo)} />
                ))}
              </div>
            ))}
            {pensando && <span className="copilot-pensando"><Loader2 size={13} className="animate-spin" /> {pensando}</span>}
          </div>

          <footer className="copilot-rodape">
            {erro && <div className="copilot-erro" role="alert">{erro}</div>}
            {anexos.length > 0 && (
              <div className="copilot-anexos-pendentes">
                {anexos.map((a, i) => (
                  <span key={`${a.name}-${i}`} className="copilot-anexo">
                    <IconeDoAnexo tipo={tipoDoArquivo(a)} /><span>{a.name}</span>
                    <button type="button" aria-label={`Tirar ${a.name}`} onClick={() => setAnexos(l => l.filter((_, j) => j !== i))}><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <form className="copilot-compositor" onSubmit={e => { e.preventDefault(); void enviar({ texto, anexos }) }}>
              <input ref={arquivoRef} type="file" accept={ACEITOS} multiple hidden aria-label="Arquivo para o Copilot"
                onChange={e => { escolherArquivos(e.target.files); e.target.value = '' }} />
              <button type="button" className="copilot-compositor-botao" aria-label="Anexar arquivo" title="Anexar imagem ou documento"
                disabled={enviando || gravador.gravando} onClick={() => arquivoRef.current?.click()}>
                <Paperclip size={16} />
              </button>
              <textarea
                ref={campoRef}
                aria-label="Mensagem para o Copilot"
                placeholder={gravador.gravando ? `Gravando… ${gravador.segundos}s` : 'Peça algo ao Copilot…'}
                rows={1}
                maxLength={TEXTO_MAXIMO}
                value={texto}
                disabled={gravador.gravando}
                onChange={e => {
                  setTexto(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`
                }}
                onKeyDown={e => {
                  // No celular, Enter é quebra de linha (o teclado não tem Shift+Enter à mão).
                  const toque = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
                  if (e.key === 'Enter' && !e.shiftKey && !toque) { e.preventDefault(); void enviar({ texto, anexos }) }
                }}
              />
              {!texto.trim() && anexos.length === 0 ? (
                <button type="button" className="copilot-compositor-botao" data-gravando={gravador.gravando ? 'sim' : 'nao'}
                  aria-label={gravador.gravando ? 'Parar e enviar o áudio' : 'Gravar áudio'} disabled={enviando}
                  onClick={() => void microfone()}>
                  {gravador.gravando ? <Square size={14} /> : <Mic size={16} />}
                </button>
              ) : (
                <button type="submit" className="copilot-compositor-botao enviar" aria-label="Enviar" disabled={enviando}>
                  {enviando ? <Loader2 size={15} className="animate-spin" /> : <SendHorizontal size={15} />}
                </button>
              )}
            </form>
            <p className="copilot-aviso-clinico">Não envie dados de prontuário. O Copilot não lê nem comenta informação clínica.</p>
          </footer>
        </>
      )}
    </section>
  )
}

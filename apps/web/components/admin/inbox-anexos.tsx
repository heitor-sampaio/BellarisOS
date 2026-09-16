'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Paperclip, Mic, Square, X, Send, AlertCircle, FileText } from 'lucide-react'

/**
 * Anexo e gravação de voz no compositor.
 *
 * É um hook, e não um componente, porque as duas metades vivem em lugares
 * diferentes da tela: os botões dentro da linha do compositor, o painel de
 * pré-envio acima dela. Com um componente só, uma das duas ficaria no lugar
 * errado; com dois componentes, o estado teria de ser duplicado.
 *
 * Arquivo e gravação convergem no mesmo painel de propósito: o que sai daqui é
 * sempre um arquivo, e anexo não tem desfazer — o cliente recebe.
 */

/**
 * Formatos de gravação que o WhatsApp aceita, na ordem de preferência.
 *
 * ⚠️ O padrão do Chrome é `audio/webm;codecs=opus`, e a Cloud API **recusa**
 * webm: ela aceita aac, mp4, mpeg, amr e ogg-opus. Por isso a escolha é
 * explícita em vez do default do MediaRecorder — senão a gravação funciona na
 * tela, sobe para o bucket e só falha na hora do envio.
 */
const FORMATOS_DE_VOZ = [
  { mime: 'audio/mp4',                  ext: 'm4a' },
  { mime: 'audio/mp4;codecs=mp4a.40.2', ext: 'm4a' },
  { mime: 'audio/aac',                  ext: 'aac' },
  { mime: 'audio/ogg;codecs=opus',      ext: 'ogg' },
  { mime: 'audio/mpeg',                 ext: 'mp3' },
]

function formatoDisponivel() {
  if (typeof MediaRecorder === 'undefined') return null
  return FORMATOS_DE_VOZ.find(f => MediaRecorder.isTypeSupported(f.mime)) ?? null
}

function tamanhoLegivel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function duracaoLegivel(segundos: number) {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`
}

export interface Anexos {
  pendente:   File | null
  previewUrl: string | null
  caption:    string
  setCaption: (v: string) => void
  gravando:   boolean
  segundos:   number
  erro:       string | null
  abrirSeletor:      () => void
  alternarGravacao:  () => void
  descartar:         () => void
  confirmar:         () => void
  inputRef:   React.RefObject<HTMLInputElement | null>
  aoEscolher: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export function useAnexos(onEnviar: (file: File, caption: string) => void): Anexos {
  const [pendente,   setPendente]   = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [caption,    setCaption]    = useState('')
  const [erro,       setErro]       = useState<string | null>(null)
  const [gravando,   setGravando]   = useState(false)
  const [segundos,   setSegundos]   = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef   = useRef<Blob[]>([])
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef    = useRef<HTMLInputElement | null>(null)

  // Object URL vira memória vazada se não for revogado ao trocar de arquivo.
  useEffect(() => {
    if (!pendente) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(pendente)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pendente])

  // Sair da tela gravando deixaria o microfone ligado.
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    recorderRef.current?.stream.getTracks().forEach(t => t.stop())
  }, [])

  const aoEscolher = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''   // permite reescolher o mesmo arquivo depois
    if (!f) return
    setErro(null); setCaption(''); setPendente(f)
  }, [])

  const abrirSeletor = useCallback(() => {
    setErro(null)
    inputRef.current?.click()
  }, [])

  const pararGravacao = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
    setGravando(false)
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  const alternarGravacao = useCallback(async () => {
    if (gravando) { pararGravacao(); return }

    setErro(null)
    const formato = formatoDisponivel()
    if (!formato) {
      setErro('Este navegador não grava num formato que o WhatsApp aceita. Anexe um arquivo de áudio.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec    = new MediaRecorder(stream, { mimeType: formato.mime })
      chunksRef.current = []

      rec.ondataavailable = ev => { if (ev.data.size > 0) chunksRef.current.push(ev.data) }
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const tipo = formato.mime.split(';')[0]!
        const blob = new Blob(chunksRef.current, { type: tipo })
        // A extensão do nome importa em três lugares: vira o `docName` da
        // uazapi, define o caminho do arquivo no bucket, e o `type` decide o
        // `media_type` gravado na mensagem.
        setPendente(new File([blob], `audio-${Date.now()}.${formato.ext}`, { type: tipo }))
        setCaption('')
      }

      rec.start()
      recorderRef.current = rec
      setGravando(true)
      setSegundos(0)
      timerRef.current = setInterval(() => setSegundos(s => s + 1), 1000)
    } catch {
      setErro('Não foi possível usar o microfone. Confira a permissão no navegador.')
    }
  }, [gravando, pararGravacao])

  const descartar = useCallback(() => {
    setPendente(null); setCaption(''); setErro(null)
  }, [])

  const confirmar = useCallback(() => {
    if (!pendente) return
    onEnviar(pendente, caption.trim())
    setPendente(null); setCaption(''); setErro(null)
  }, [pendente, caption, onEnviar])

  return {
    pendente, previewUrl, caption, setCaption,
    gravando, segundos, erro,
    abrirSeletor, alternarGravacao, descartar, confirmar,
    inputRef, aoEscolher,
  }
}

// -- Painel de pré-envio (acima da linha do compositor) -----------------------

export function PainelDeAnexo({ a, enviando }: { a: Anexos; enviando: boolean }) {
  const ehImagem = a.pendente?.type.startsWith('image/')
  const ehAudio  = a.pendente?.type.startsWith('audio/')
  const ehVideo  = a.pendente?.type.startsWith('video/')

  return (
    <>
      <input
        ref={a.inputRef}
        type="file"
        onChange={a.aoEscolher}
        style={{ display: 'none' }}
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
      />

      {a.gravando && (
        <div style={{
          margin: '0 16px 8px', padding: '9px 12px', borderRadius: 10,
          border: '1px solid #dc262633', background: '#fef2f2',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#dc2626', flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#dc2626' }}>
            Gravando · {duracaoLegivel(a.segundos)}
          </span>
          <button type="button" onClick={a.alternarGravacao} className="btn-primary"
            style={{ marginLeft: 'auto', height: 30, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Square size={12} /> Parar
          </button>
        </div>
      )}

      {(a.pendente || a.erro) && (
        <div style={{
          margin: '0 16px 8px', padding: 10, borderRadius: 10,
          border: '1px solid var(--border)', background: 'var(--bg-app)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {a.erro && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{a.erro}</span>
            </div>
          )}

          {a.pendente && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {ehImagem && a.previewUrl ? (
                  <img src={a.previewUrl} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                ) : (
                  <div style={{
                    width: 52, height: 52, borderRadius: 8, flexShrink: 0,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <FileText size={18} color="var(--text-faint)" />
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {a.pendente.name}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-faint)' }}>
                    {tamanhoLegivel(a.pendente.size)}
                  </p>
                  {ehAudio && a.previewUrl && <audio controls src={a.previewUrl} style={{ width: '100%', height: 30, marginTop: 5 }} />}
                  {ehVideo && a.previewUrl && <video controls src={a.previewUrl} style={{ width: '100%', maxHeight: 120, marginTop: 5, borderRadius: 6 }} />}
                </div>

                <button type="button" onClick={a.descartar} className="btn-ghost"
                  style={{ height: 30, padding: '0 8px', flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </div>

              <div style={{ display: 'flex', gap: 7 }}>
                {/* Áudio não tem legenda em lugar nenhum do WhatsApp. */}
                {!ehAudio && (
                  <input
                    value={a.caption}
                    onChange={e => a.setCaption(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); a.confirmar() } }}
                    placeholder="Legenda (opcional)"
                    className="field"
                    style={{ flex: 1, fontSize: 12.5 }}
                    autoFocus
                  />
                )}
                <button
                  type="button"
                  onClick={a.confirmar}
                  disabled={enviando}
                  className="btn-primary"
                  style={{ marginLeft: ehAudio ? 'auto' : 0, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Send size={13} /> {enviando ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}

// -- Botões (dentro da linha do compositor) -----------------------------------

const ESTILO_BOTAO = {
  flexShrink: 0, alignSelf: 'flex-end' as const,
  height: 36, width: 36, borderRadius: 9,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1.5px solid var(--border)', background: 'var(--bg-app)',
  color: 'var(--text-muted)',
}

export function BotoesDeAnexo({ a, disabled }: { a: Anexos; disabled: boolean }) {
  return (
    <>
      <button
        type="button" onClick={a.abrirSeletor} disabled={disabled}
        title="Anexar arquivo"
        style={{ ...ESTILO_BOTAO, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}
      >
        <Paperclip size={15} />
      </button>
      <button
        type="button" onClick={a.alternarGravacao} disabled={disabled}
        title={a.gravando ? 'Parar gravação' : 'Gravar áudio'}
        style={{
          ...ESTILO_BOTAO,
          cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
          ...(a.gravando && { borderColor: '#dc2626', background: '#fef2f2', color: '#dc2626' }),
        }}
      >
        {a.gravando ? <Square size={14} /> : <Mic size={15} />}
      </button>
    </>
  )
}

'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { LifeBuoy, X, ArrowLeft, Plus, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { JanelaModal } from '@/components/shared/janela-modal'
import { abrirChamado, responderChamado, meusChamados, verChamado } from '@/actions/chamados'
import { autorizarSuporte, revogarAutorizacaoDeSuporte } from '@/actions/suporte-autorizacao'
import { ROTULO_DA_SITUACAO } from '@/lib/suporte/chamados-regras'
import type { ChamadoResumo, ChamadoCompleto } from '@/lib/suporte/chamados'

/**
 * O botão "Ajuda" da topbar: abre chamado com o suporte do BellarisOS e
 * acompanha a conversa. Some no modo suporte (quem está ali é o atendente).
 *
 * O sino abre direto num chamado pelo evento `bellaris:ajuda`
 * (`detail.chamadoId`), disparado no "Ver a resposta" da notificação.
 */
type Tela = { tipo: 'lista' } | { tipo: 'novo' } | { tipo: 'conversa'; id: string }

const FORMATO = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
})
const quando = (iso: string) => FORMATO.format(new Date(iso))

export function Ajuda({ internalUserId }: { internalUserId: string | null }) {
  const [aberta, setAberta] = useState(false)
  const [tela, setTela] = useState<Tela>({ tipo: 'lista' })
  // Vem da lista (a primeira tela): só quem gerencia o prontuário libera dado clínico.
  const [podeClinico, setPodeClinico] = useState(false)

  useEffect(() => {
    function abrir(e: Event) {
      const id = (e as CustomEvent<{ chamadoId?: string }>).detail?.chamadoId
      setTela(id ? { tipo: 'conversa', id } : { tipo: 'lista' })
      setAberta(true)
    }
    window.addEventListener('bellaris:ajuda', abrir)
    return () => window.removeEventListener('bellaris:ajuda', abrir)
  }, [])

  return (
    <>
      <button type="button" className="btn-ghost" aria-label="Ajuda" title="Ajuda — falar com o suporte"
        onClick={() => { setTela({ tipo: 'lista' }); setAberta(true) }} style={{ padding: 8 }}>
        <LifeBuoy size={18} />
      </button>
      {aberta && (
        <JanelaModal onFechar={() => setAberta(false)} rotulo="Ajuda" largura={600} fechaNoFundo={false}>
          <div style={{ padding: 'var(--card-pad)' }}>
            {tela.tipo === 'lista' && <Lista onAbrir={id => setTela({ tipo: 'conversa', id })} onNovo={() => setTela({ tipo: 'novo' })} onFechar={() => setAberta(false)} onPodeClinico={setPodeClinico} />}
            {tela.tipo === 'novo' && <Novo podeClinico={podeClinico} onVoltar={() => setTela({ tipo: 'lista' })} onCriado={id => setTela({ tipo: 'conversa', id })} />}
            {tela.tipo === 'conversa' && <Conversa id={tela.id} internalUserId={internalUserId} onVoltar={() => setTela({ tipo: 'lista' })} />}
          </div>
        </JanelaModal>
      )}
    </>
  )
}

function Cabecalho({ titulo, sub, onVoltar, onFechar }: { titulo: string; sub?: string; onVoltar?: () => void; onFechar?: () => void }) {
  return (
    <div className="ajuda-cabecalho">
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', minWidth: 0 }}>
        {onVoltar && <button type="button" className="btn-ghost" onClick={onVoltar} aria-label="Voltar" style={{ padding: 6 }}><ArrowLeft size={16} /></button>}
        <div style={{ minWidth: 0 }}>
          <h2 className="ajuda-titulo">{titulo}</h2>
          {sub && <p className="ajuda-sub">{sub}</p>}
        </div>
      </div>
      {onFechar && <button type="button" className="btn-ghost" onClick={onFechar} aria-label="Fechar" style={{ padding: 6 }}><X size={16} /></button>}
    </div>
  )
}

function Situacao({ status }: { status: ChamadoResumo['status'] }) {
  return <span className="chamado-situacao" data-situacao={status}>{ROTULO_DA_SITUACAO[status]}</span>
}

function Lista({ onAbrir, onNovo, onFechar, onPodeClinico }: {
  onAbrir: (id: string) => void; onNovo: () => void; onFechar: () => void; onPodeClinico: (v: boolean) => void
}) {
  const [dados, setDados] = useState<{ chamados: ChamadoResumo[]; daRede: boolean } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    meusChamados()
      .then(r => { if (r.ok) { setDados(r); onPodeClinico(r.podeClinico) } else setErro(r.error) })
      .catch(() => setErro('Não consegui carregar os chamados.'))
  }, [onPodeClinico])
  return (
    <>
      <Cabecalho titulo="Ajuda" sub="Fale com o suporte do BellarisOS. A resposta chega no sino." onFechar={onFechar} />
      <div className="ajuda-acoes" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p className="overline">{dados?.daRede ? 'Chamados da rede' : 'Seus chamados'}</p>
        <button type="button" className="btn-primary" onClick={onNovo}><Plus size={14} /> Novo chamado</button>
      </div>
      {erro && <p className="ajuda-erro">{erro}</p>}
      {!dados && !erro && <p className="ajuda-nota">Carregando…</p>}
      {dados && !dados.chamados.length && <p className="ajuda-nota">Nenhum chamado ainda. Se algo não está funcionando, conte para a gente.</p>}
      {dados && dados.chamados.length > 0 && (
        <div className="ajuda-lista">
          {dados.chamados.map(c => (
            <button key={c.id} type="button" className="ajuda-item" onClick={() => onAbrir(c.id)}>
              <div className="ajuda-item-texto">
                <p className="ajuda-item-assunto">#{c.numero} · {c.assunto}</p>
                <p className="ajuda-item-meta">
                  {dados.daRede && c.quem ? `${c.quem} · ` : ''}{quando(c.ultimaMensagem)}
                </p>
              </div>
              <Situacao status={c.status} />
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function CampoDeAnexo({ nome }: { nome: string }) {
  const [arquivo, setArquivo] = useState<string | null>(null)
  return (
    <label className="btn-secondary" style={{ cursor: 'pointer', alignSelf: 'flex-start' }}>
      <Paperclip size={14} /> {arquivo ?? 'Anexar print (PNG ou JPEG, até 5 MB)'}
      <input type="file" name={nome} accept="image/png,image/jpeg" hidden
        onChange={e => setArquivo(e.target.files?.[0]?.name ?? null)} />
    </label>
  )
}

function Novo({ podeClinico, onVoltar, onCriado }: { podeClinico: boolean; onVoltar: () => void; onCriado: (id: string) => void }) {
  const [autorizar, setAutorizar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [gravando, iniciar] = useTransition()

  function enviar(form: FormData) {
    setErro(null)
    form.set('contexto', JSON.stringify({
      pagina: window.location.pathname,
      tela: `${window.innerWidth}×${window.innerHeight}`,
      navegador: navigator.userAgent,
    }))
    iniciar(async () => {
      const r = await abrirChamado(form)
      if (!r.ok) { setErro(r.error); return }
      toast.success(`Chamado #${r.numero} aberto. Avisamos no sino quando o suporte responder.`)
      onCriado(r.chamadoId)
    })
  }

  return (
    <>
      <Cabecalho titulo="Novo chamado" sub="Conte o que aconteceu. A tela em que você está vai junto." onVoltar={onVoltar} />
      <form action={enviar} className="ajuda-form">
        <label className="ajuda-rotulo">Assunto
          <input className="field" name="assunto" required minLength={3} maxLength={120} placeholder="Ex.: não consigo concluir o atendimento" />
        </label>
        <label className="ajuda-rotulo">O que aconteceu
          <textarea className="field" name="corpo" required maxLength={5000} rows={5}
            placeholder="O que você tentou fazer, o que apareceu na tela e com qual cliente ou agendamento." />
        </label>
        <CampoDeAnexo nome="anexo" />
        <label className="ajuda-check">
          <input type="checkbox" name="autorizar" value="1" checked={autorizar} onChange={e => setAutorizar(e.target.checked)} />
          <span>Autorizo o suporte a entrar na minha conta por 72 horas para olhar o problema de perto.</span>
        </label>
        {autorizar && podeClinico && (
          <label className="ajuda-check ajuda-check-sub">
            <input type="checkbox" name="clinico" value="1" />
            <span>Incluir dados clínicos (prontuário, fichas e fotos).</span>
          </label>
        )}
        {autorizar && <p className="ajuda-nota">Tudo o que o suporte fizer fica registrado, e dá para revogar a qualquer momento aqui mesmo, no chamado. Nada é enviado aos seus clientes durante o acesso.</p>}
        {erro && <p className="ajuda-erro">{erro}</p>}
        <div className="ajuda-acoes">
          <button type="button" className="btn-secondary" onClick={onVoltar} disabled={gravando}>Voltar</button>
          <button type="submit" className="btn-primary" disabled={gravando}>{gravando ? 'Enviando…' : 'Enviar'}</button>
        </div>
      </form>
    </>
  )
}

function Conversa({ id, internalUserId, onVoltar }: { id: string; internalUserId: string | null; onVoltar: () => void }) {
  const [dados, setDados] = useState<{ chamado: ChamadoCompleto; meu: boolean } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [erroDoEnvio, setErroDoEnvio] = useState<string | null>(null)
  const [gravando, iniciar] = useTransition()
  const [chave, setChave] = useState(0)

  const carregar = useCallback(() => {
    verChamado(id).then(r => r.ok ? setDados(r) : setErro(r.error)).catch(() => setErro('Não consegui carregar o chamado.'))
  }, [id])
  useEffect(() => { carregar() }, [carregar])
  // A resposta do suporte aparece sem precisar fechar e abrir.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') carregar() }, 30_000)
    return () => clearInterval(t)
  }, [carregar])

  function responder(form: FormData) {
    setErroDoEnvio(null)
    form.set('chamadoId', id)
    iniciar(async () => {
      const r = await responderChamado(form)
      if (!r.ok) { setErroDoEnvio(r.error); return }
      setChave(k => k + 1)
      carregar()
    })
  }

  function revogar(grantId: string) {
    iniciar(async () => {
      const r = await revogarAutorizacaoDeSuporte(grantId)
      if (!r.ok) { toast.error(r.error); return }
      toast.success('Acesso do suporte revogado.')
      carregar()
    })
  }

  function autorizar() {
    if (!internalUserId) return
    iniciar(async () => {
      const r = await autorizarSuporte({ userId: internalUserId, chamadoId: id })
      if (!r.ok) { toast.error(r.error); return }
      toast.success('Acesso autorizado por 72 horas.')
      carregar()
    })
  }

  if (erro) return <><Cabecalho titulo="Chamado" onVoltar={onVoltar} /><p className="ajuda-erro">{erro}</p></>
  if (!dados) return <><Cabecalho titulo="Chamado" onVoltar={onVoltar} /><p className="ajuda-nota">Carregando…</p></>
  const { chamado: c, meu } = dados

  return (
    <>
      <Cabecalho titulo={`#${c.numero} · ${c.assunto}`} sub={`Aberto por ${c.quem ?? '—'} em ${quando(c.criadoEm)}`} onVoltar={onVoltar} />
      <div className="ajuda-acoes" style={{ justifyContent: 'flex-start' }}><Situacao status={c.status} /></div>
      {c.autorizacao
        ? <div className="ajuda-aviso" data-tom="ok" style={{ marginTop: 10 }}>
            <span>Acesso do suporte autorizado até {quando(c.autorizacao.expiraEm)}{c.autorizacao.clinico ? ', com dados clínicos' : ''}.</span>
            {meu && <button type="button" className="btn-secondary" disabled={gravando} onClick={() => revogar(c.autorizacao!.id)}>Revogar</button>}
          </div>
        : meu && (
          <div className="ajuda-aviso" style={{ marginTop: 10 }}>
            <span>O suporte só entra na sua conta com a sua autorização.</span>
            <button type="button" className="btn-secondary" onClick={autorizar} disabled={gravando}>Autorizar por 72 h</button>
          </div>
        )}
      <div className="chamado-conversa">
        {c.mensagens.map(m => (
          <div key={m.id} className="chamado-msg" data-autor={m.autor}>
            <p className="chamado-msg-quem"><span>{m.nome}</span><span>{quando(m.em)}</span></p>
            <p className="chamado-msg-corpo">{m.corpo}</p>
            {m.anexos.length > 0 && (
              <div className="chamado-anexos">
                {m.anexos.map(a => a.url && (
                  <a key={a.path} className="chamado-anexo" href={a.url} target="_blank" rel="noreferrer" title={a.nome}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do bucket privado */}
                    <img src={a.url} alt={a.nome} />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <form key={chave} action={responder} className="ajuda-form">
        <label className="ajuda-rotulo">{c.status === 'resolvido' ? 'Escrever de novo reabre o chamado' : 'Responder'}
          <textarea className="field" name="corpo" required maxLength={5000} rows={3} />
        </label>
        <CampoDeAnexo nome="anexo" />
        {erroDoEnvio && <p className="ajuda-erro">{erroDoEnvio}</p>}
        <div className="ajuda-acoes">
          <button type="submit" className="btn-primary" disabled={gravando}>{gravando ? 'Enviando…' : 'Enviar'}</button>
        </div>
      </form>
    </>
  )
}

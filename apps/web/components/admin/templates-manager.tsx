'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, Send, RefreshCw, AlertCircle, CheckCircle2, X, Braces,
} from 'lucide-react'
import {
  saveTemplate, submitTemplate, deleteTemplate, syncTemplates,
  type MessageTemplate, type TemplateInput,
} from '@/actions/message-templates'
import {
  CATEGORIAS, STATUS_META, LIMITES, extrairVariaveis, interpolar, normalizarNome,
  type TemplateButton, type TemplateCategoria, type TemplateStatus,
} from '@/lib/templates/core'

const IDIOMAS = [
  { code: 'pt_BR', label: 'Português (Brasil)' },
  { code: 'en_US', label: 'Inglês (EUA)' },
  { code: 'es_ES', label: 'Espanhol' },
]

const TOM_STATUS = {
  neutro: { bg: 'var(--bg-app)', color: 'var(--text-muted)', border: 'var(--border)' },
  espera: { bg: 'var(--warning-soft)', color: 'var(--warning)', border: 'color-mix(in srgb, var(--cat-5) 20%, transparent)' },
  ok:     { bg: 'var(--success-bg)', color: 'var(--success)', border: 'color-mix(in srgb, var(--success) 20%, transparent)' },
  erro:   { bg: 'var(--danger-soft)', color: 'var(--danger)', border: 'color-mix(in srgb, var(--danger) 20%, transparent)' },
} as const

function StatusChip({ status }: { status: TemplateStatus }) {
  const meta = STATUS_META[status]
  const tom  = TOM_STATUS[meta.tom]
  return (
    <span style={{
      fontSize: 'var(--text-overline)', fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      background: tom.bg, color: tom.color, border: `1px solid ${tom.border}`,
      whiteSpace: 'nowrap',
    }}>
      {meta.label}
    </span>
  )
}

/** Rascunho vazio — corpo já com uma variável, que é o caso comum. */
function novoRascunho(): TemplateInput {
  return {
    name: '', category: 'UTILITY', language: 'pt_BR',
    header_text: null, body_text: '', footer_text: null,
    buttons: [], example_values: {},
  }
}

function paraInput(t: MessageTemplate): TemplateInput {
  return {
    id: t.id, name: t.name, category: t.category, language: t.language,
    header_text: t.header_text, body_text: t.body_text, footer_text: t.footer_text,
    buttons: t.buttons ?? [], example_values: t.example_values ?? {},
  }
}

// --- Pré-visualização --------------------------------------------------------

function Previa({ form }: { form: TemplateInput }) {
  const valores = form.example_values ?? {}
  return (
    <div style={{
      background: '#ece5dd', borderRadius: 'var(--radius-field-token)', padding: 14,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <p className="overline" style={{ color: 'var(--text-muted)', margin: 0 }}>Prévia</p>
      <div style={{
        background: 'var(--surface)', borderRadius: '10px 10px 10px 2px',
        padding: '8px 10px', maxWidth: 300,
        boxShadow: 'none',
        fontSize: 'var(--text-base-sz)', lineHeight: 1.45, color: '#111b21',
      }}>
        {form.header_text && (
          <p style={{ margin: '0 0 4px', fontWeight: 800 }}>
            {interpolar(form.header_text, valores)}
          </p>
        )}
        <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {form.body_text
            ? interpolar(form.body_text, valores)
            : <span style={{ color: 'var(--text-faint)' }}>O corpo da mensagem aparece aqui.</span>}
        </p>
        {form.footer_text && (
          <p style={{ margin: '6px 0 0', fontSize: 'var(--text-2xs)', color: '#667781' }}>
            {form.footer_text}
          </p>
        )}
        {form.buttons.length > 0 && (
          <div style={{ marginTop: 8, borderTop: '1px solid #e9edef', paddingTop: 4 }}>
            {form.buttons.map((b, i) => (
              <div key={i} style={{
                textAlign: 'center', color: 'var(--info)', fontSize: 'var(--text-sm-sz)',
                fontWeight: 600, padding: '5px 0',
                borderTop: i > 0 ? '1px solid #e9edef' : 'none',
              }}>
                {b.text || 'Botão'}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Editor ------------------------------------------------------------------

function Campo({
  label, value, onChange, placeholder, max, hint, multiline, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; max?: number; hint?: string
  multiline?: boolean; disabled?: boolean
}) {
  const Tag = multiline ? 'textarea' : 'input'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <label className="overline" style={{ color: 'var(--text-muted)' }}>{label}</label>
        {max && (
          <span style={{
            fontSize: 'var(--text-overline)',
            color: value.length > max ? 'var(--danger)' : 'var(--text-faint)',
            fontWeight: value.length > max ? 700 : 400,
          }}>
            {value.length}/{max}
          </span>
        )}
      </div>
      <Tag
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="field"
        rows={multiline ? 5 : undefined}
        style={{ fontSize: 'var(--text-base-sz)', resize: multiline ? 'vertical' : undefined }}
      />
      {hint && <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', margin: 0 }}>{hint}</p>}
    </div>
  )
}

function Aviso({ tom, children }: { tom: 'erro' | 'ok' | 'espera'; children: React.ReactNode }) {
  const t = TOM_STATUS[tom]
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '9px 12px', borderRadius: 8,
      background: t.bg, border: `1px solid ${t.border}`,
      fontSize: 'var(--text-sm-sz)', color: t.color, fontWeight: 600,
    }}>
      {tom === 'ok' ? <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    : <AlertCircle  size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

// --- Tela --------------------------------------------------------------------

export function TemplatesManager({
  initial, oficialAtivo, temWaba, podeEditar,
}: {
  initial:      MessageTemplate[]
  oficialAtivo: boolean
  temWaba:      boolean
  podeEditar:   boolean
}) {
  const router = useRouter()
  const [selId,  setSelId]  = useState<string | 'novo' | null>(null)
  const [form,   setForm]   = useState<TemplateInput>(novoRascunho)
  const [erros,  setErros]  = useState<string[]>([])
  const [aviso,  setAviso]  = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isSync,    startSync]       = useTransition()

  const selecionado = initial.find(t => t.id === selId) ?? null
  // Nome, idioma e categoria são imutáveis na Meta depois da submissão.
  const jaSubmetido = !!selecionado?.meta_template_id

  const variaveis = useMemo(
    () => extrairVariaveis(form.header_text, form.body_text),
    [form.header_text, form.body_text],
  )

  function abrir(t: MessageTemplate | 'novo') {
    setErros([]); setAviso(null)
    if (t === 'novo') { setSelId('novo'); setForm(novoRascunho()) }
    else              { setSelId(t.id);   setForm(paraInput(t)) }
  }

  function set<K extends keyof TemplateInput>(k: K, v: TemplateInput[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function inserirVariavel() {
    const nome = window.prompt('Nome da variável (ex.: nome, data, horario)')?.trim()
    if (!nome) return
    const slug = normalizarNome(nome)
    if (!slug) return
    set('body_text', `${form.body_text}{{${slug}}}`)
  }

  function salvar(depois?: (id: string) => void) {
    setErros([]); setAviso(null)
    startTransition(async () => {
      const res = await saveTemplate(form)
      if (res.erros) { setErros(res.erros); return }
      if (!res.ok)   { setErros([res.error ?? 'Erro ao salvar']); return }
      setAviso('Template salvo.')
      if (res.id) { setSelId(res.id); if (depois) depois(res.id) }
      router.refresh()
    })
  }

  function enviarParaAprovacao() {
    // Salvar antes é o que garante que a Meta receba o que está na tela, e não
    // a última versão gravada.
    salvar(id => {
      startTransition(async () => {
        const res = await submitTemplate(id)
        if (res.erros) { setErros(res.erros); return }
        if (!res.ok)   { setErros([res.error ?? 'Erro ao enviar']); return }
        setAviso('Enviado para a Meta. A análise costuma sair em até 24 horas.')
        router.refresh()
      })
    })
  }

  function apagar() {
    if (!selecionado) return
    const aviso = selecionado.meta_template_id
      ? `Apagar "${selecionado.name}" aqui e na Meta? Isso não tem volta.`
      : `Apagar o rascunho "${selecionado.name}"?`
    if (!window.confirm(aviso)) return

    startTransition(async () => {
      const res = await deleteTemplate(selecionado.id)
      if (!res.ok) { setErros([res.error ?? 'Erro ao apagar']); return }
      setSelId(null)
      router.refresh()
    })
  }

  function sincronizar() {
    setErros([]); setAviso(null)
    startSync(async () => {
      const res = await syncTemplates()
      if (!res.ok) { setErros([res.error ?? 'Erro ao sincronizar']); return }
      setAviso(res.atualizados
        ? `${res.atualizados} template${res.atualizados > 1 ? 's' : ''} atualizado${res.atualizados > 1 ? 's' : ''}.`
        : 'Tudo já estava em dia.')
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {!oficialAtivo && (
        <Aviso tom="erro">
          Templates são um recurso da <strong>API oficial do WhatsApp</strong>. A rede está
          sem ela conectada — com a uazapi não existe janela de 24 horas para contornar,
          então o envio normal já resolve.{' '}
          <a href="/admin/settings?tab=integrations" style={{ color: 'inherit', fontWeight: 800 }}>
            Ver integrações →
          </a>
        </Aviso>
      )}
      {oficialAtivo && !temWaba && (
        <Aviso tom="espera">
          Falta o <strong>ID da conta do WhatsApp Business (WABA)</strong> nas integrações.
          Dá para escrever e guardar templates, mas não para enviar à Meta sem ele.
        </Aviso>
      )}

      {/* `master-detail` já empilha e vira largura cheia abaixo de 900px — mas
          só se ninguém a sobrescrever. O `display: grid` com colunas fixas que
          estava aqui no estilo inline vencia a classe, e a lista de 280px mais o
          detalhe não cabem em um telefone: era esta linha que quebrava a tela. */}
      <div className="master-detail" style={{ gap: 14 }}>
        {/* Lista */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', width: 280, flexShrink: 0 }}>
          <div style={{
            padding: '11px 14px', borderBottom: '1px solid var(--hairline)',
            display: 'flex', gap: 6,
          }}>
            {podeEditar && (
              <button type="button" onClick={() => abrir('novo')} className="btn-primary"
                style={{ flex: 1, height: 34, fontSize: 'var(--text-sm-sz)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <Plus size={14} /> Novo
              </button>
            )}
            {podeEditar && oficialAtivo && (
              <button type="button" onClick={sincronizar} disabled={isSync} className="btn-ghost"
                title="Reler os status na Meta"
                style={{ height: 34, padding: '0 10px' }}>
                <RefreshCw size={14} className={isSync ? 'animate-spin' : undefined} />
              </button>
            )}
          </div>

          {initial.length === 0 ? (
            <p style={{ padding: 20, fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', margin: 0, lineHeight: 1.5 }}>
              Nenhum template ainda. Eles servem para retomar conversa que passou de
              24 horas — lembrete de consulta, retorno, resposta a quem sumiu.
            </p>
          ) : initial.map(t => {
            const ativo = t.id === selId
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => abrir(t)}
                style={{
                  width: '100%', textAlign: 'left', cursor: 'pointer',
                  padding: '10px 14px', border: 'none',
                  borderBottom: '1px solid var(--hairline)',
                  background: ativo ? 'var(--brand-soft)' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{
                    fontSize: 'var(--text-sm-sz)', fontWeight: 700,
                    color: ativo ? 'var(--brand)' : 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {t.name}
                  </span>
                  <StatusChip status={t.status} />
                </div>
                <p style={{
                  margin: '3px 0 0', fontSize: 'var(--text-2xs)', color: 'var(--text-faint)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {t.body_text}
                </p>
              </button>
            )
          })}
        </div>

        {/* Editor */}
        {selId === null ? (
          <div className="card" style={{
            flex: 1, minWidth: 0,
            padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-base-sz)',
          }}>
            Escolha um template na lista ou crie um novo.
          </div>
        ) : (
          <div className="card" style={{ flex: 1, minWidth: 0, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {selecionado?.status === 'REJECTED' && (
              <Aviso tom="erro">
                A Meta recusou este template
                {selecionado.rejection_reason ? `: ${selecionado.rejection_reason}` : '.'}{' '}
                Ajuste o texto e salve para reabrir a análise.
              </Aviso>
            )}
            {selecionado?.status === 'PENDING' && (
              <Aviso tom="espera">
                Em análise na Meta. Costuma sair em até 24 horas — use “Sincronizar” para
                conferir.
              </Aviso>
            )}
            {erros.length > 0 && (
              <Aviso tom="erro">
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {erros.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </Aviso>
            )}
            {aviso && <Aviso tom="ok">{aviso}</Aviso>}

            {/* Formulário e prévia: lado a lado quando cabe, empilhados quando
                não. A prévia embaixo continua útil no telefone — é ela que
                mostra como a mensagem chega. */}
            <div className="tpl-editor">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Campo
                  label="Nome"
                  value={form.name}
                  onChange={v => set('name', v)}
                  placeholder="lembrete_consulta"
                  disabled={!podeEditar || jaSubmetido}
                  hint={jaSubmetido
                    ? 'Não dá para mudar: a Meta identifica o template por este nome.'
                    : form.name && normalizarNome(form.name) !== form.name
                      ? `Vai ser salvo como "${normalizarNome(form.name)}"`
                      : 'Só minúsculas, números e underscore.'}
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="overline" style={{ color: 'var(--text-muted)' }}>Categoria</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {CATEGORIAS.map(c => {
                      const ativo = form.category === c.value
                      return (
                        <button
                          key={c.value}
                          type="button"
                          disabled={!podeEditar || jaSubmetido}
                          onClick={() => set('category', c.value as TemplateCategoria)}
                          style={{
                            flex: 1, padding: '8px 10px', borderRadius: 9,
                            cursor: podeEditar && !jaSubmetido ? 'pointer' : 'default',
                            border: ativo ? '2px solid var(--brand)' : '1.5px solid var(--border)',
                            background: ativo ? 'var(--brand-soft)' : 'var(--bg-app)',
                            color: ativo ? 'var(--brand)' : 'var(--text-muted)',
                            fontWeight: 700, fontSize: 'var(--text-sm-sz)', textAlign: 'left',
                          }}
                        >
                          {c.label}
                        </button>
                      )
                    })}
                  </div>
                  <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', margin: 0, lineHeight: 1.5 }}>
                    {CATEGORIAS.find(c => c.value === form.category)?.hint}
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label className="overline" style={{ color: 'var(--text-muted)' }}>Idioma</label>
                  <select
                    value={form.language}
                    disabled={!podeEditar || jaSubmetido}
                    onChange={e => set('language', e.target.value)}
                    className="field"
                    style={{ fontSize: 'var(--text-base-sz)' }}
                  >
                    {IDIOMAS.map(i => <option key={i.code} value={i.code}>{i.label}</option>)}
                  </select>
                </div>

                <Campo
                  label="Cabeçalho (opcional)"
                  value={form.header_text ?? ''}
                  onChange={v => set('header_text', v || null)}
                  placeholder="Sua consulta está chegando"
                  max={LIMITES.cabecalho}
                  disabled={!podeEditar}
                  hint="Uma linha em negrito no topo. Aceita no máximo uma variável."
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Campo
                    label="Corpo"
                    value={form.body_text}
                    onChange={v => set('body_text', v)}
                    placeholder="Olá, {{nome}}! Passando para lembrar do seu horário em {{data}}."
                    max={LIMITES.corpo}
                    multiline
                    disabled={!podeEditar}
                  />
                  {podeEditar && (
                    <button type="button" onClick={inserirVariavel} className="btn-ghost"
                      style={{ alignSelf: 'flex-start', height: 28, fontSize: 'var(--text-xs-sz)', padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Braces size={12} /> Inserir variável
                    </button>
                  )}
                </div>

                <Campo
                  label="Rodapé (opcional)"
                  value={form.footer_text ?? ''}
                  onChange={v => set('footer_text', v || null)}
                  placeholder="Responda SAIR para não receber mais"
                  max={LIMITES.rodape}
                  disabled={!podeEditar}
                  hint="Linha pequena e cinza no fim. Não aceita variáveis."
                />

                {/* Botões */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <label className="overline" style={{ color: 'var(--text-muted)' }}>
                    Botões (opcional)
                  </label>
                  {form.buttons.map((b, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select
                        value={b.type}
                        disabled={!podeEditar}
                        onChange={e => {
                          const tipo = e.target.value as TemplateButton['type']
                          set('buttons', form.buttons.map((x, j) =>
                            j === i ? { ...x, type: tipo, url: tipo === 'URL' ? x.url ?? '' : undefined } : x))
                        }}
                        className="field"
                        style={{ fontSize: 'var(--text-sm-sz)', width: 120, flexShrink: 0 }}
                      >
                        <option value="QUICK_REPLY">Resposta</option>
                        <option value="URL">Link</option>
                      </select>
                      <input
                        value={b.text}
                        disabled={!podeEditar}
                        onChange={e => set('buttons', form.buttons.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
                        placeholder="Texto do botão"
                        className="field"
                        style={{ fontSize: 'var(--text-sm-sz)', flex: 1 }}
                      />
                      {b.type === 'URL' && (
                        <input
                          value={b.url ?? ''}
                          disabled={!podeEditar}
                          onChange={e => set('buttons', form.buttons.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                          placeholder="https://"
                          className="field"
                          style={{ fontSize: 'var(--text-sm-sz)', flex: 1 }}
                        />
                      )}
                      {podeEditar && (
                        <button type="button" onClick={() => set('buttons', form.buttons.filter((_, j) => j !== i))}
                          className="btn-ghost" style={{ height: 30, padding: '0 8px' }}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                  {podeEditar && form.buttons.length < LIMITES.botoes && (
                    <button type="button" className="btn-ghost"
                      onClick={() => set('buttons', [...form.buttons, { type: 'QUICK_REPLY', text: '' }])}
                      style={{ alignSelf: 'flex-start', height: 28, fontSize: 'var(--text-xs-sz)', padding: '0 10px' }}>
                      + Adicionar botão
                    </button>
                  )}
                </div>
              </div>

              {/* Coluna direita: prévia e exemplos */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 12 }}>
                <Previa form={form} />

                {variaveis.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <label className="overline" style={{ color: 'var(--text-muted)' }}>
                        Exemplos das variáveis
                      </label>
                      <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', margin: '3px 0 0', lineHeight: 1.5 }}>
                        A Meta precisa ver a mensagem preenchida para revisar. Isto não é o
                        valor que o cliente recebe — esse é digitado na hora de enviar.
                      </p>
                    </div>
                    {variaveis.map(v => (
                      <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <code style={{
                          fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--brand)',
                          background: 'var(--brand-soft)', padding: '3px 7px', borderRadius: 6,
                          whiteSpace: 'nowrap',
                        }}>
                          {`{{${v}}}`}
                        </code>
                        <input
                          value={form.example_values[v] ?? ''}
                          disabled={!podeEditar}
                          onChange={e => set('example_values', { ...form.example_values, [v]: e.target.value })}
                          placeholder="Ex.: Ana"
                          className="field"
                          style={{ fontSize: 'var(--text-sm-sz)', flex: 1 }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Ações */}
            {podeEditar && (
              <div style={{
                display: 'flex', gap: 8, alignItems: 'center',
                borderTop: '1px solid var(--hairline)', paddingTop: 14,
              }}>
                <button type="button" onClick={() => salvar()} disabled={isPending} className="btn-primary">
                  {isPending ? 'Salvando…' : 'Salvar'}
                </button>

                {!jaSubmetido && (
                  <button type="button" onClick={enviarParaAprovacao}
                    disabled={isPending || !oficialAtivo || !temWaba}
                    className="btn-ghost"
                    title={!temWaba ? 'Falta o ID da WABA nas integrações' : undefined}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Send size={14} /> Enviar para aprovação
                  </button>
                )}

                {selId !== 'novo' && (
                  <button type="button" onClick={apagar} disabled={isPending} className="btn-ghost"
                    style={{ marginLeft: 'auto', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Trash2 size={14} /> Apagar
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

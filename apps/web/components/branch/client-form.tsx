'use client'

import { startTransition, useActionState, useEffect, useEffectEvent, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { addClient, conferirTelefoneDoCadastro, type ResultadoDoCadastro } from '@/actions/clients'
import { rotaCliente } from '@/lib/rotas'
import { UserPlus, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { TagBadge } from '@/components/shared/tag-badge'
import { isUnitTag, unitTagName, maskPhone as telefoneParaExibir, maskTelefoneDigitando, telefoneDoCadastro, TIPOS_DE_DOCUMENTO, documentoEstrangeiro } from '@estetica-os/utils'
import { ResponsavelLegal, RESPONSAVEL_VAZIO, type CamposDoResponsavel } from '@/components/shared/responsavel-legal'
import { useTagsDaRede } from '@/components/shared/use-tags-da-rede'
import { avisoDoAcessoCriado, avisoDaUnidadeDeCadastro, oQueFaltaResponder } from '@/lib/clients/textos-do-cadastro'
import { alternarTag, opcoesDeTag, temTag } from '@/lib/tags/escolha'
import { useEnvioUnico } from '@/lib/use-envio-unico'

const GENDERS = [
  { value: 'F', label: 'Feminino' },
  { value: 'M', label: 'Masculino' },
  { value: 'O', label: 'Outro' },
  { value: 'N', label: 'Prefiro não informar' },
]

interface ClientFormProps {
  branchId:   string
  slug:       string
  branchName?: string
  /** quando fornecido, mostra seletor de unidade (uso na conversão de lead pelo CRM) */
  branches?:  { id: string; name: string }[]
  /** pré-preenchimento na criação (ex.: conversão de lead) */
  prefill?:   { name?: string; phone?: string; email?: string }
  /** liga o cliente criado a este lead (conversão) */
  leadId?:    string
  /** Contato de onde veio o cadastro: e nele que o vinculo com o cliente fica. */
  conversationId?: string
  onSuccess?:         (clientId?: string) => void
  showCancelButton?:  boolean
  onCancel?:          () => void
  /**
   * A rede tem mais de uma unidade ativa: só então se explica onde a cliente
   * aparece (J-24). Sem a prop, vale o número de unidades do seletor.
   */
  variasUnidades?:    boolean
}

function maskCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4')
}

/**
 * O rótulo ENVOLVE o campo (2026-10-21): solto, o leitor de tela e o clique no
 * rótulo não chegavam ao campo. `grupo` é para o que não é um campo só (as
 * tags são botões: dentro de um <label>, o clique no rótulo apertaria o
 * primeiro).
 */
function Field({ label, children, grupo }: { label: string; children: React.ReactNode; grupo?: boolean }) {
  const rotulo = (
    <span style={{
      fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)',
      color: 'var(--text-muted)', letterSpacing: '0.04em',
    }}>
      {label}
    </span>
  )
  if (grupo) {
    return <div role="group" aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{rotulo}{children}</div>
  }
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {rotulo}
      {children}
    </label>
  )
}

export function ClientForm({ branchId, slug, branchName, branches, prefill, leadId, conversationId, onSuccess, showCancelButton, onCancel, variasUnidades }: ClientFormProps) {
  const textoDaUnidade = avisoDaUnidadeDeCadastro(variasUnidades ?? (branches?.length ?? 0) > 1)
  // Só cadastro. A edição mora na aba Dados da ficha: manter duas telas para a
  // mesma coisa deixava esta aqui sem nenhuma página que a montasse.
  const [state, formAction, pending] = useActionState(addClient, undefined)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [phone, setPhone] = useState(prefill?.phone ? telefoneParaExibir(prefill.phone) : '')
  const [document, setDocument] = useState('')
  const [email, setEmail] = useState(prefill?.email ?? '')
  // O acesso ao app é escolha (2026-10-21): só com o e-mail e um documento.
  const [comAcesso, setComAcesso] = useState(false)
  // O tipo do documento (D-11). Sem CPF, a senha inicial é o número do
  // passaporte ou do RNE (decisão 1 do Heitor, 2026-11-05).
  const [tipoDoc, setTipoDoc] = useState<string>('CPF')
  // O CPF completo (os verificadores, o servidor confere e diz em português — D12).
  const docValido = tipoDoc === 'CPF' ? document.replace(/\D/g, '').length === 11 : !!documentoEstrangeiro(document)
  const podeAcesso = email.trim().length > 0 && docValido
  const nomeDoDoc = tipoDoc === 'RNE' ? 'o número do RNE' : tipoDoc === 'PASSAPORTE' ? 'o número do passaporte' : 'CPF'
  // Decisão 2 do Heitor (2026-11-05): a menor de idade pede o responsável legal.
  const [nascimento, setNascimento] = useState('')
  const [responsavel, setResponsavel] = useState<CamposDoResponsavel>(RESPONSAVEL_VAZIO)
  // A14 da 8ª simulação: com várias unidades, nenhuma vem escolhida (era a
  // primeira em ordem alfabética); com uma só, ela.
  const [unitId, setUnitId] = useState(branchId || (branches?.length === 1 ? branches[0]!.id : ''))

  const router   = useRouter()
  const pathname = usePathname()

  const digitos = telefoneDoCadastro(phone)?.digitos

  // As RESPOSTAS às perguntas do cadastro ("é a mesma pessoa?", "cadastrar
  // mesmo assim") vão em TODO envio seguinte: uma pergunta pode vir depois da
  // outra, e sem a primeira resposta o servidor a faria de novo. Cada resposta
  // leva a ficha ou o número a que responde — trocou o telefone, o servidor a
  // ignora e pergunta de novo.
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  // A22: o "Cadastrar" com a pergunta sem resposta diz o que falta.
  const [faltaResponder, setFaltaResponder] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const perguntaRef = useRef<HTMLDivElement>(null)
  // A chave do envio (D10): o reenvio do mesmo cadastro — o duplo clique — grava uma vez só.
  const envio = useEnvioUnico()

  // A18 (5ª simulação): as perguntas do telefone só vinham depois do primeiro
  // "Cadastrar", no pé da página — o clique parecia não fazer nada. Agora a
  // tela confere assim que o telefone está completo (e a cada resposta) e
  // pergunta JUNTO ao campo; o servidor confere de novo no envio.
  const [previa, setPrevia] = useState<ResultadoDoCadastro | null>(null)
  useEffect(() => {
    if (!digitos) return
    let vivo = true
    const t = setTimeout(() => {
      conferirTelefoneDoCadastro({ phone, respostas, leadId: leadId ?? null, conversationId: conversationId ?? null, cpf: tipoDoc === 'CPF' ? document : null })
        .then(r => { if (vivo) setPrevia(r) })
        .catch(() => { /* sem a conferência, o envio pergunta */ })
    }, 350)
    return () => { vivo = false; clearTimeout(t) }
  }, [digitos, phone, respostas, leadId, conversationId, tipoDoc, document])

  /** A pergunta do telefone ainda sem resposta, para ESTE número. */
  function perguntaDe(r: ResultadoDoCadastro | null | undefined): Pergunta | null {
    if (!r || !digitos) return null
    if (r.arquivada?.telefone === digitos && respostas._arquivada !== `nova:${digitos}`) return { tipo: 'arquivada', ...r.arquivada }
    // A ficha que JÁ EXISTE (r2-cli-01): o CPF e o nome com o nascimento não dependem do telefone.
    if (r.jaExiste && (r.jaExiste.motivo !== 'TELEFONE' || r.jaExiste.telefone === digitos)
      && !(r.jaExiste.podeCadastrarMesmoAssim && (respostas._jaExiste ?? '').split(' ').includes(`cadastrar:${r.jaExiste.id}`))) return { tipo: 'jaExiste', ...r.jaExiste }
    if (r.mesmaPessoaDoLead?.telefone === digitos && !(respostas._pessoaDoCrm ?? '').endsWith(`:${r.mesmaPessoaDoLead.contatoId}`)) return { tipo: 'lead', ...r.mesmaPessoaDoLead }
    return null
  }
  const doEnvio = perguntaDe(state)
  // Gravado, nenhuma pergunta: a conferência que chega DEPOIS do cadastro acharia a própria ficha nova.
  const pergunta = state?.success ? null : doEnvio ?? perguntaDe(digitos ? previa : null)

  // A pergunta que veio do clique em "Cadastrar" aparece onde a pessoa está olhando.
  useEffect(() => {
    if (state && perguntaDe(state)) perguntaRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando chega a resposta do envio
  }, [state])

  function mandar(dados: FormData, nova?: Record<string, string>, guardar = true) {
    const todas = { ...respostas, ...nova }
    if (nova && guardar) setRespostas(todas)
    for (const [k, v] of Object.entries(todas)) dados.set(k, v)
    dados.set('_envio', envio.chave())
    startTransition(() => formAction(dados))
  }
  /**
   * Responde a pergunta. A que veio do envio reenvia (a pessoa já tinha
   * clicado em "Cadastrar"); a de antes do clique só guarda a resposta — o
   * resto do formulário ainda está sendo preenchido.
   */
  function responder(campo: string, valor: string) {
    // Depois do clique em "Cadastrar" (a pergunta veio do envio, ou o A22 a
    // segurou na tela), responder envia — como sempre foi.
    if ((doEnvio || faltaResponder) && formRef.current) { setFaltaResponder(false); mandar(new FormData(formRef.current), { [campo]: valor }) }
    else setRespostas(r => ({ ...r, [campo]: valor }))
  }
  /** "Reativar a ficha de X" (A20): envia já, e a resposta não fica para os próximos envios. */
  function reativar(id: string) {
    if (formRef.current) mandar(new FormData(formRef.current), { _arquivada: `reativar:${id}` }, false)
  }
  /** "Unificar com a ficha de X" (r2-cli-01, r3-f14-02): envia já, com o que está no formulário, e abre a ficha. */
  function atualizar(id: string) {
    if (formRef.current) mandar(new FormData(formRef.current), { _jaExiste: `atualizar:${id}` }, false)
  }
  /** "Cadastrar mesmo assim": vale para AQUELA ficha, e se junta às outras respostas. */
  function cadastrarMesmoAssim(id: string) {
    responder('_jaExiste', [...(respostas._jaExiste ?? '').split(' ').filter(Boolean), `cadastrar:${id}`].join(' '))
  }

  // Sem o reset automático do formulário: com ele, o aviso do telefone (e todo
  // erro) apagava o nome, o nascimento e as observações já digitados, e
  // confirmar pedia para digitar tudo de novo.
  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // A22 (7ª simulação): com a pergunta do telefone sem resposta, o clique não
    // fazia nada visível. Não envia: diz o que responder e leva até a pergunta.
    if (pergunta) {
      setFaltaResponder(true)
      perguntaRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    mandar(new FormData(e.currentTarget))
  }

  const aoCadastrar = useEffectEvent(() => {
    envio.renovar()
    const clientId = (state as unknown as { clientId?: string }).clientId
    // A confirmação sai antes de a tela mudar: o formulário some no modal ou na navegação.
    const r = state as unknown as { acessoCriado?: boolean; contaLigada?: boolean }
    if (r.acessoCriado) {
      // Quem já tinha conta em outra clínica NÃO tem a senha = CPF (J-22).
      const aviso = avisoDoAcessoCriado({ contaLigada: !!r.contaLigada, email,
        documento: { tipo: tipoDoc as 'CPF' | 'PASSAPORTE' | 'RNE', numero: tipoDoc === 'CPF' ? document : (documentoEstrangeiro(document) ?? document) } })
      toast.success(aviso.titulo, { description: aviso.descricao, duration: 9000 })
    }
    if (onSuccess) {
      onSuccess(clientId)
    } else if (clientId) {
      router.push(rotaCliente(pathname, slug, clientId))
    }
  })
  useEffect(() => {
    if (state?.success) aoCadastrar()
  }, [state?.success])

  // As tags da rede (Configurações → Tags), não mais uma lista fixa.
  const vocabulario = useTagsDaRede()
  function toggleTag(tag: string) {
    setSelectedTags(prev => alternarTag(prev, tag))
  }

  return (
    <form ref={formRef} onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <input type="hidden" name="_branchId" value={branches && branches.length > 0 ? unitId : branchId} />
      <input type="hidden" name="_slug" value={slug} />
      {leadId && <input type="hidden" name="_leadId" value={leadId} />}
      {conversationId && <input type="hidden" name="_conversationId" value={conversationId} />}
      <input type="hidden" name="tags" value={JSON.stringify(selectedTags)} />

      {branches && branches.length > 0 ? (
        <Field label="Unidade de cadastro *">
          <select className="field" value={unitId} onChange={e => setUnitId(e.target.value)} required>
            {!unitId && <option value="">Selecione a unidade…</option>}
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {textoDaUnidade && (
            <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', marginTop: 4, display: 'block' }}>
              {textoDaUnidade}
            </span>
          )}
        </Field>
      ) : branchName ? (
        <div style={{
          fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)',
          background: 'var(--bg-app)', border: '1px solid var(--hairline)',
          borderRadius: 10, padding: '8px 12px', display: 'flex', gap: 6, alignItems: 'center',
        }}>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>Unidade de cadastro:</span> {branchName}
          {textoDaUnidade && <span style={{ color: 'var(--text-faint)' }}>— {textoDaUnidade}</span>}
        </div>
      ) : null}

      {/* Seção 1: Dados essenciais */}
      <div className="form-2col">
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Nome completo *">
            <input
              name="name" type="text" required className="field"
              defaultValue={prefill?.name ?? ''}
              placeholder="Ana Paula Silva"
            />
          </Field>
        </div>

        <Field label="Telefone *">
          <input
            name="phone" type="tel" required className="field"
            value={phone}
            onChange={e => setPhone(maskTelefoneDigitando(e.target.value))}
            placeholder="(00) 00000-0000"
          />
          <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)' }}>
            De outro país? Comece com + e o código (ex.: +351 912 345 678).
          </span>
        </Field>

        <Field label="E-mail">
          <input
            name="email" type="email" className="field"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="ana@email.com"
          />
        </Field>

        {/* A pergunta do telefone, logo abaixo dele (A18). */}
        {pergunta && (
          <div ref={perguntaRef} style={{ gridColumn: '1 / -1' }}>
            <PerguntaDoTelefone pergunta={pergunta} pending={pending} responder={responder} reativar={reativar}
              atualizar={atualizar} cadastrarMesmoAssim={cadastrarMesmoAssim} digitado={{ email, telefone: phone }} />
          </div>
        )}

        {/* O "Documento" tem tipo (D-11): CPF, passaporte ou RNE. */}
        <Field label="Documento" grupo>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              name="document_type" className="field" aria-label="Tipo do documento"
              value={tipoDoc}
              onChange={e => { setTipoDoc(e.target.value); setDocument('') }}
              style={{ width: 'auto', flex: '0 0 auto' }}
            >
              {TIPOS_DE_DOCUMENTO.map(t => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
            </select>
            <input
              name="document" type="text" className="field" aria-label="Número do documento"
              inputMode={tipoDoc === 'CPF' ? 'numeric' : 'text'}
              value={document}
              onChange={e => setDocument(tipoDoc === 'CPF' ? maskCPF(e.target.value) : e.target.value.toUpperCase())}
              placeholder={tipoDoc === 'CPF' ? '000.000.000-00' : tipoDoc === 'RNE' ? 'V123456-7' : 'AB123456'}
              style={{ flex: 1, minWidth: 0 }}
            />
          </div>
        </Field>

        <Field label="Data de nascimento">
          <input
            name="birth_date" type="date" className="field"
            value={nascimento} onChange={e => setNascimento(e.target.value)}
          />
        </Field>

        <Field label="Gênero">
          <select name="gender" className="field" defaultValue=''>
            <option value="">Não informado</option>
            {GENDERS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </Field>
      </div>

      {/* A menor de idade: o responsável legal (decisão 2 do Heitor, 2026-11-05). */}
      <ResponsavelLegal nascimento={nascimento} valor={responsavel} aoMudar={setResponsavel} comNomes />

      {/* Tags */}
      <Field label="Tags" grupo>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {opcoesDeTag(vocabulario ?? [], selectedTags).map(tag => {
            const active = temTag(selectedTags, tag)
            return (
              <button
                key={tag} type="button"
                className={active ? 'chip-filtro is-ativo' : 'chip-filtro'}
                aria-pressed={active}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            )
          })}
        </div>
        {/* Unidades que o cliente frequenta (tags "Unidade: <nome>") — removíveis */}
        {selectedTags.some(isUnitTag) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {selectedTags.filter(isUnitTag).map(tag => (
              <TagBadge
                key={tag}
                label={unitTagName(tag)}
                style={{ bg: 'var(--info-soft)', color: 'var(--info)' }}
                onRemove={() => toggleTag(tag)}
              />
            ))}
          </div>
        )}
      </Field>

      {/* Observações */}
      <Field label="Observações internas">
        <textarea
          name="notes" rows={3} className="field"
          defaultValue=''
          placeholder="Alergias, preferências, histórico relevante…"
          style={{ resize: 'vertical' }}
        />
      </Field>

      {/* Feedback */}
      {state?.error && (
        <p style={{
          color: 'var(--warning)', background: 'var(--warning-soft)',
          borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
          fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
        }}>
          {state.error}
        </p>
      )}
      {state?.success && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)' }}>
          <CheckCircle2 size={14} /> Cliente cadastrado com sucesso.
        </div>
      )}

      <label style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5,
        background: 'var(--bg-app)', border: '1px solid var(--hairline)',
        borderRadius: 10, padding: '10px 12px', cursor: podeAcesso ? 'pointer' : 'default',
      }}>
        <input
          type="checkbox" name="_acesso"
          checked={comAcesso && podeAcesso} disabled={!podeAcesso}
          onChange={e => setComAcesso(e.target.checked)}
          aria-label="Criar o acesso ao app"
          style={{ marginTop: 2, accentColor: 'var(--brand)' }}
        />
        <span>
          <b style={{ color: 'var(--text)' }}>Criar o acesso ao app</b>
          {podeAcesso ? (
            <> — login = e-mail e senha inicial = {nomeDoDoc}{tipoDoc !== 'CPF' ? ' (em maiúsculas, como está aqui)' : ''}. Se ela já
              usa o app em outra clínica, com o mesmo e-mail e documento, esta ficha entra na conta dela, e a senha
              continua a que ela já usa.</>
          ) : (
            <> — precisa do e-mail e de um documento (CPF, passaporte ou RNE). Sem eles, a cliente é cadastrada sem o
              app, e o acesso pode ser dado depois, na aba Dados da ficha.</>
          )}
        </span>
      </label>

      {pergunta && (faltaResponder || doEnvio) && (
        <p data-falta-responder role="status" style={{
          color: 'var(--warning)', background: 'var(--warning-soft)',
          borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
          fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
        }}>
          {oQueFaltaResponder({ tipo: pergunta.tipo, nome: pergunta.nome, ehLead: pergunta.tipo === 'lead' ? pergunta.ehLead : undefined })}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        {showCancelButton && (
          <button type="button" onClick={onCancel} className="btn-secondary" disabled={pending}>
            Cancelar
          </button>
        )}
        <button type="submit" disabled={pending} className="btn-primary">
          <UserPlus size={15} />
          {pending ? 'Cadastrando…' : 'Cadastrar cliente'}
        </button>
      </div>
    </form>
  )
}

type Pergunta =
  | ({ tipo: 'arquivada' } & NonNullable<ResultadoDoCadastro['arquivada']>)
  | ({ tipo: 'jaExiste' } & NonNullable<ResultadoDoCadastro['jaExiste']>)
  | ({ tipo: 'lead' } & NonNullable<ResultadoDoCadastro['mesmaPessoaDoLead']>)

const caixaDaPergunta: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start',
  color: 'var(--warning)', background: 'var(--warning-soft)',
  borderRadius: 'var(--radius-field-token)', padding: '10px 12px',
  fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
}
const explicacao: React.CSSProperties = { fontWeight: 'var(--weight-medium)', color: 'var(--text-muted)' }
const destaque: React.CSSProperties = { color: 'var(--text)' }
const POR_QUE = { CPF: 'com este CPF', TELEFONE: 'com este telefone', NOME_E_NASCIMENTO: 'com este nome e esta data de nascimento' } as const

/**
 * Como a ficha FICA ao unificar (A17 da 6ª simulação: a Daniela ficou com o
 * e-mail da Renata, e a tela não tinha dito). O nome é sempre o da ficha
 * (r3-f14-01); o e-mail e o telefone digitados tomam o lugar dos dela, e o
 * campo vazio deixa o dela — a regra de `atualizarFichaComOPreenchido`.
 */
function ComoFicaAoUnificar({ nome, naFicha, digitado }: {
  nome: string
  naFicha?: { email: string | null; telefone: string | null }
  digitado: { email: string; telefone: string }
}) {
  const linha = (rotulo: string, agora: string, dela: string | null) => {
    const a = agora.trim()
    if (!a) return dela ? `${rotulo}: ${dela} (o da ficha)` : `${rotulo}: — (a ficha não tem)`
    if (!dela) return `${rotulo}: ${a} (o digitado agora)`
    if (dela === a) return `${rotulo}: ${a} (o mesmo da ficha)`
    return `${rotulo}: ${a} (o digitado agora, no lugar de ${dela})`
  }
  const foneDela = naFicha?.telefone ? telefoneParaExibir(naFicha.telefone) : null
  return (
    <span data-unificar-fica style={{ display: 'flex', flexDirection: 'column', gap: 2, fontWeight: 'var(--weight-medium)', color: 'var(--text)' }}>
      <span style={{ color: 'var(--text-muted)' }}>Se unificar, a ficha fica assim:</span>
      <span>Nome: {nome} (o da ficha)</span>
      <span>{linha('Telefone', digitado.telefone, foneDela)}</span>
      <span>{linha('E-mail', digitado.email, naFicha?.email ?? null)}</span>
    </span>
  )
}

/**
 * A pergunta do telefone que já é de alguém (D13, D-9, a ficha rápida e,
 * desde a 5ª simulação, a ficha ARQUIVADA — A20), junto ao campo (A18).
 */
function PerguntaDoTelefone({ pergunta, pending, responder, reativar, atualizar, cadastrarMesmoAssim, digitado }: {
  pergunta: Pergunta; pending: boolean
  responder: (campo: string, valor: string) => void
  reativar: (id: string) => void
  atualizar: (id: string) => void
  cadastrarMesmoAssim: (id: string) => void
  /** O e-mail e o telefone digitados agora (A17: como a ficha fica ao unificar). */
  digitado: { email: string; telefone: string }
}) {
  if (pergunta.tipo === 'arquivada') {
    return (
      <div role="alert" style={caixaDaPergunta}>
        <span>
          O telefone {pergunta.exibir} é da ficha arquivada de <b style={destaque}>{pergunta.nome}</b>. Se é ela, reative a
          ficha em vez de cadastrar de novo.
        </span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => reativar(pergunta.id)}>
            Reativar a ficha de {pergunta.nome}
          </button>
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => responder('_arquivada', `nova:${pergunta.telefone}`)}>
            É outra pessoa
          </button>
        </span>
        <span style={explicacao}>
          Reativar traz a ficha de volta como estava, com o histórico; o que foi digitado aqui não é gravado.
        </span>
      </div>
    )
  }
  if (pergunta.tipo === 'jaExiste') {
    // r2-cli-01 (o Heitor, 2026-11-03): já existe — cadastrar mesmo assim, ou
    // unificar com a ficha que existe (r3-f14-02). Pelo CPF, só unificar: o CPF é único.
    return (
      <div role="alert" data-ja-existe style={caixaDaPergunta}>
        <span>
          Já existe a ficha de <b style={destaque}>{pergunta.nome}</b> {POR_QUE[pergunta.motivo]}.
          {pergunta.podeCadastrarMesmoAssim ? ' Se é outra pessoa (mãe e filha dividem o telefone), cadastre mesmo assim.' : ' O CPF é único na clínica.'}
        </span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {pergunta.podeCadastrarMesmoAssim && (
            <button type="button" className="btn-secondary" disabled={pending} onClick={() => cadastrarMesmoAssim(pergunta.id)}>
              Cadastrar mesmo assim
            </button>
          )}
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => atualizar(pergunta.id)}>
            Unificar com a ficha de {pergunta.nome}
          </button>
        </span>
        <span style={explicacao}>
          Unificar grava na ficha dela só o que foi preenchido aqui, sem apagar o que ela já tem (as observações se somam, as tags se juntam); o nome continua o da ficha. Depois, abre a ficha.
        </span>
        <ComoFicaAoUnificar nome={pergunta.nome} naFicha={pergunta.naFicha} digitado={digitado} />
      </div>
    )
  }
  return (
    <div role="alert" style={caixaDaPergunta}>
      <span>
        {pergunta.ehLead
          ? <>Este telefone é de um lead do CRM{pergunta.perdida ? ' (a oportunidade está perdida)' : ''}. É a mesma pessoa do lead <b style={destaque}>{pergunta.nome}</b>?</>
          : <>Este telefone é de uma conversa do inbox. É a mesma pessoa do contato <b style={destaque}>{pergunta.nome}</b>?</>}
      </span>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => responder('_pessoaDoCrm', `mesma:${pergunta.contatoId}`)}>
          Sim, é a mesma pessoa
        </button>
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => responder('_pessoaDoCrm', `outra:${pergunta.contatoId}`)}>
          Não, é outra pessoa
        </button>
      </span>
      <span style={explicacao}>
        Sim liga a oportunidade e a conversa à ficha nova (o card passa a &ldquo;Já é cliente&rdquo;). Não cadastra sem ligar.
      </span>
    </div>
  )
}

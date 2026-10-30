'use client'

import { startTransition, useActionState, useEffect, useEffectEvent, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { addClient } from '@/actions/clients'
import { rotaCliente } from '@/lib/rotas'
import { UserPlus, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { TagBadge } from '@/components/shared/tag-badge'
import { isUnitTag, unitTagName, maskPhone as telefoneParaExibir, maskTelefoneDigitando, telefoneDoCadastro } from '@estetica-os/utils'
import { useTagsDaRede } from '@/components/shared/use-tags-da-rede'
import { alternarTag, opcoesDeTag, temTag } from '@/lib/tags/escolha'

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

export function ClientForm({ branchId, slug, branchName, branches, prefill, leadId, conversationId, onSuccess, showCancelButton, onCancel }: ClientFormProps) {
  // Só cadastro. A edição mora na aba Dados da ficha: manter duas telas para a
  // mesma coisa deixava esta aqui sem nenhuma página que a montasse.
  const [state, formAction, pending] = useActionState(addClient, undefined)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [phone, setPhone] = useState(prefill?.phone ? telefoneParaExibir(prefill.phone) : '')
  const [document, setDocument] = useState('')
  const [email, setEmail] = useState(prefill?.email ?? '')
  // O acesso ao app é escolha (2026-10-21): só com e-mail e CPF.
  const [comAcesso, setComAcesso] = useState(false)
  const podeAcesso = email.trim().length > 0 && document.replace(/\D/g, '').length === 11
  const [unitId, setUnitId] = useState(branchId || branches?.[0]?.id || '')

  const router   = useRouter()
  const pathname = usePathname()

  // O telefone já é de outra cliente (D13): o aviso vale para ESTE número —
  // trocou o número, ele some (e o servidor confere de novo).
  const digitos = telefoneDoCadastro(phone)?.digitos
  const aviso = state?.avisoTelefone && state.avisoTelefone.telefone === digitos ? state.avisoTelefone : null
  // A ficha rápida do mesmo telefone (frente de cadastro, 2026-10-29): "É a mesma pessoa?".
  const mesmaPessoa = state?.mesmaPessoa && state.mesmaPessoa.telefone === digitos ? state.mesmaPessoa : null

  // As RESPOSTAS às perguntas do cadastro ("é a mesma pessoa?", "cadastrar
  // mesmo assim") vão em TODO envio seguinte: uma pergunta pode vir depois da
  // outra, e sem a primeira resposta o servidor a faria de novo. Cada resposta
  // leva a ficha ou o número a que responde — trocou o telefone, o servidor a
  // ignora e pergunta de novo.
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const formRef = useRef<HTMLFormElement>(null)
  function mandar(dados: FormData, nova?: Record<string, string>) {
    const todas = { ...respostas, ...nova }
    if (nova) setRespostas(todas)
    for (const [k, v] of Object.entries(todas)) dados.set(k, v)
    startTransition(() => formAction(dados))
  }
  function responder(campo: string, valor: string) {
    if (formRef.current) mandar(new FormData(formRef.current), { [campo]: valor })
  }

  // Sem o reset automático do formulário: com ele, o aviso do telefone (e todo
  // erro) apagava o nome, o nascimento e as observações já digitados, e
  // confirmar pedia para digitar tudo de novo.
  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    mandar(new FormData(e.currentTarget))
  }

  const aoCadastrar = useEffectEvent(() => {
    const clientId = (state as unknown as { clientId?: string }).clientId
    // A confirmação sai antes de a tela mudar: o formulário some no modal ou na navegação.
    if ((state as unknown as { acessoCriado?: boolean }).acessoCriado) {
      toast.success('Acesso ao app criado', {
        description: `O login é o e-mail${email.trim() ? ` (${email.trim().toLowerCase()})` : ''} e a senha inicial é o CPF; a cliente a troca no primeiro acesso.`,
        duration: 9000,
      })
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
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', marginTop: 4, display: 'block' }}>
            O cliente pode ser atendido em qualquer unidade.
          </span>
        </Field>
      ) : branchName ? (
        <div style={{
          fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)',
          background: 'var(--bg-app)', border: '1px solid var(--hairline)',
          borderRadius: 10, padding: '8px 12px', display: 'flex', gap: 6, alignItems: 'center',
        }}>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>Unidade de cadastro:</span> {branchName}
          <span style={{ color: 'var(--text-faint)' }}>— o cliente pode ser atendido em qualquer unidade</span>
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
            placeholder="(11) 99999-9999"
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

        <Field label="CPF">
          <input
            name="document" type="text" className="field" inputMode="numeric"
            value={document}
            onChange={e => setDocument(maskCPF(e.target.value))}
            placeholder="000.000.000-00"
          />
        </Field>

        <Field label="Data de nascimento">
          <input
            name="birth_date" type="date" className="field"
            defaultValue=''
          />
        </Field>

        <Field label="Gênero">
          <select name="gender" className="field" defaultValue=''>
            <option value="">Não informado</option>
            {GENDERS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </Field>
      </div>

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
      {aviso && (
        <div role="alert" style={{
          display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start',
          color: 'var(--warning)', background: 'var(--warning-soft)',
          borderRadius: 'var(--radius-field-token)', padding: '10px 12px',
          fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
        }}>
          <span>
            O telefone {aviso.exibir} já é de <b style={{ color: 'var(--text)' }}>{aviso.nome}</b> nesta
            clínica. Se é o mesmo número mesmo (mãe e filha, por exemplo), confirme.
          </span>
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => responder('_telefoneConfirmado', aviso.telefone)}>
            Cadastrar mesmo assim
          </button>
        </div>
      )}
      {mesmaPessoa && (
        <div role="alert" style={{
          display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start',
          color: 'var(--warning)', background: 'var(--warning-soft)',
          borderRadius: 'var(--radius-field-token)', padding: '10px 12px',
          fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
        }}>
          <span>
            Já existe a ficha de <b style={{ color: 'var(--text)' }}>{mesmaPessoa.nome}</b> com este telefone, sem CPF
            (cadastrada às pressas, ao agendar). É a mesma pessoa?
          </span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="btn-secondary" disabled={pending} onClick={() => responder('_fichaRapida', `mesma:${mesmaPessoa.id}`)}>
              Sim, é a mesma pessoa
            </button>
            <button type="button" className="btn-secondary" disabled={pending} onClick={() => responder('_fichaRapida', `outra:${mesmaPessoa.id}`)}>
              Não, é outra pessoa
            </button>
          </span>
          <span style={{ fontWeight: 'var(--weight-medium)', color: 'var(--text-muted)' }}>
            Sim completa a ficha dela com estes dados (o histórico fica junto). Não cadastra uma ficha nova.
          </span>
        </div>
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
            <> — login = e-mail e senha inicial = CPF. Se ela já usa o app em outra clínica, com o mesmo e-mail e
              CPF, esta ficha entra na conta dela, e a senha continua a que ela já usa.</>
          ) : (
            <> — precisa do e-mail e do CPF. Sem eles, a cliente é cadastrada sem o app, e o acesso pode ser dado
              depois, na aba Dados da ficha.</>
          )}
        </span>
      </label>

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

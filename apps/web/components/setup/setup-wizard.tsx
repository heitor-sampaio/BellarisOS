'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { normalizarHorario, type Horario } from '@/lib/agenda/horario'
import { Check, Loader2, AlertTriangle } from 'lucide-react'
import { updateTenantProfile, completeOnboarding } from '@/actions/setup'
import { createBranch } from '@/actions/branches'
import { fetchCep } from '@/lib/cep'
import { maskCNPJDigitando, maskCPFouCNPJDigitando, maskCEPDigitando, maskPhoneDigitando } from '@estetica-os/utils'
import { EditorDeHorario } from '@/components/shared/editor-de-horario'
import { useEnvioUnico } from '@/lib/use-envio-unico'

const ESTADOS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO',
]

function toSlug(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

// -- Stepper ------------------------------------------------------------------

// O setup nasce com UMA unidade: a clínica não fala "rede" (F8).
const STEPS = ['Sua clínica', 'Primeira unidade', 'Pronto!']

function Stepper({ current }: { current: number }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 0,
      marginBottom: 32,
    }}>
      {STEPS.map((label, i) => {
        const done   = i < current
        const active = i === current
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
            {/* Bullet */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: done ? 'var(--success)' : active ? 'var(--brand)' : 'transparent',
                border: done || active ? 'none' : '2px solid var(--border)',
                color: done || active ? 'var(--on-brand)' : 'var(--text-faint)',
                fontSize: 'var(--text-xs-sz)',
                fontWeight: 'var(--weight-bold)',
                transition: 'all 200ms',
                flexShrink: 0,
              }}>
                {done ? <Check size={15} strokeWidth={2.5} /> : i + 1}
              </div>
              <span style={{
                fontSize: 'var(--text-2xs)',
                fontWeight: active ? 'var(--weight-bold)' : 'var(--weight-medium)',
                color: active ? 'var(--text)' : done ? 'var(--success)' : 'var(--text-faint)',
                whiteSpace: 'nowrap',
              }}>
                {label}
              </span>
            </div>
            {/* Connector */}
            {i < STEPS.length - 1 && (
              <div style={{
                width: 56,
                height: 2,
                background: i < current ? 'var(--success)' : 'var(--border)',
                marginBottom: 22,
                transition: 'background 200ms',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// -- Step 1 — Dados da rede ----------------------------------------------------

interface DadosDaRede { nome: string; documento: string; telefone: string; site: string }

function StepNetwork({
  inicial,
  onNext,
}: {
  inicial: DadosDaRede
  onNext: (salvos: DadosDaRede) => void
}) {
  const [name,     setName]     = useState(inicial.nome)
  const [document, setDocument] = useState(maskCNPJDigitando(inicial.documento))
  const [phone,    setPhone]    = useState(maskPhoneDigitando(inicial.telefone))
  const [website,  setWebsite]  = useState(inicial.site)
  const [error,    setError]    = useState<string | null>(null)
  const [pending,  startTransition] = useTransition()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await updateTenantProfile({ name, document, phone, website })
      if (result && 'error' in result) {
        setError(result.error ?? null)
      } else {
        onNext({ nome: name, documento: document, telefone: phone, site: website })
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ marginBottom: 4 }}>
        <h2 style={{
          fontSize: 'var(--text-title)',
          fontWeight: 'var(--weight-extrabold)',
          letterSpacing: 'var(--tracking-tight)',
          color: 'var(--text)',
          marginBottom: 4,
        }}>
          Dados da sua clínica
        </h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          Essas informações identificam sua clínica no sistema.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="overline" htmlFor="net-name">Nome da clínica *</label>
        <input
          id="net-name"
          type="text"
          className="field"
          required
          placeholder="Ex: BellarisOS Estética"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="overline" htmlFor="net-doc">CNPJ</label>
        <input
          id="net-doc"
          type="text"
          className="field"
          placeholder="00.000.000/0001-00"
          value={document}
          onChange={e => setDocument(maskCNPJDigitando(e.target.value))}
        />
      </div>

      <div className="form-2col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline" htmlFor="net-phone">Telefone</label>
          <input
            id="net-phone"
            type="text"
            className="field"
            placeholder="(00) 00000-0000"
            value={phone}
            onChange={e => setPhone(maskPhoneDigitando(e.target.value))}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline" htmlFor="net-site">Site</label>
          <input
            id="net-site"
            type="url"
            className="field"
            placeholder="https://bellaris.com"
            value={website}
            onChange={e => setWebsite(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <p style={{
          color: 'var(--warning)', background: 'var(--warning-soft)',
          borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
          fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
        }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Salvando…</> : 'Continuar →'}
        </button>
      </div>
    </form>
  )
}

// -- Step 2 — Primeira unidade -------------------------------------------------

/**
 * O rascunho do passo da unidade (A1 da 5ª simulação, 2026-11-02): recarregar
 * mantinha o passo (J-3) e apagava o nome, o telefone e o horário digitados.
 * Fica no sessionStorage da aba — conveniência de quem digita, não estado: sem
 * ele (aba privada, armazenamento bloqueado), o passo abre vazio, como antes.
 */
const RASCUNHO_DA_UNIDADE = 'bellaris:setup:unidade'
interface RascunhoDaUnidade {
  name: string; document: string; slug: string; slugTouched: boolean
  phone: string; email: string; zipCode: string; address: string; city: string; uf: string
  horario: string | null
}
function lerRascunho(): RascunhoDaUnidade | null {
  try {
    const t = window.sessionStorage.getItem(RASCUNHO_DA_UNIDADE)
    return t ? JSON.parse(t) as RascunhoDaUnidade : null
  } catch { return null }
}
function gravarRascunho(r: RascunhoDaUnidade | null) {
  try {
    if (r) window.sessionStorage.setItem(RASCUNHO_DA_UNIDADE, JSON.stringify(r))
    else window.sessionStorage.removeItem(RASCUNHO_DA_UNIDADE)
  } catch { /* sem armazenamento: o passo só não lembra */ }
}

function StepBranch({ onNext, onBack, documentoDaRede }: {
  onNext: () => void; onBack: () => void
  /** O CNPJ da rede: a primeira unidade o herda, editável (J-6). */
  documentoDaRede: string
}) {
  const [name,       setName]       = useState('')
  const [document,   setDocument]   = useState(maskCPFouCNPJDigitando(documentoDaRede))
  const [slugDigitado, setSlug]     = useState('')
  const [slugTouched,setSlugTouched]= useState(false)
  // Até a pessoa mexer no endereço, ele acompanha o nome — derivado, não copiado.
  const slug = slugTouched ? slugDigitado : toSlug(name)
  const [phone,      setPhone]      = useState('')
  const [email,      setEmail]      = useState('')
  const [zipCode,    setZipCode]    = useState('')
  const [address,    setAddress]    = useState('')
  const [numero,     setNumero]     = useState('')
  const [city,       setCity]       = useState('')
  const [uf,         setUf]         = useState('')
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError,   setCepError]   = useState<string | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  // O CNPJ apagado pergunta antes de criar (cfg-01): "sem CNPJ" ou o da clínica.
  const [perguntaCnpj, setPerguntaCnpj] = useState<{ cnpjDaRede: string | null } | null>(null)
  const [pending,    startTransition] = useTransition()
  const envio = useEnvioUnico()
  // O horário do rascunho remonta o editor (ele lê o valor só ao nascer).
  const [horarioSalvo, setHorarioSalvo] = useState<{ chave: number; valor: Horario | null }>({ chave: 0, valor: null })
  const formRef = useRef<HTMLFormElement>(null)
  const restaurado = useRef(false)

  // Volta o rascunho depois de montar (no servidor não há sessionStorage).
  useEffect(() => {
    const r = lerRascunho()
    restaurado.current = true
    if (!r) return
    /* eslint-disable react-hooks/set-state-in-effect -- o rascunho só existe no navegador */
    setName(r.name); setDocument(r.document); setSlug(r.slug); setSlugTouched(r.slugTouched)
    setPhone(r.phone); setEmail(r.email); setZipCode(r.zipCode); setAddress(r.address); setCity(r.city); setUf(r.uf)
    if (r.horario) {
      try { setHorarioSalvo({ chave: 1, valor: normalizarHorario(JSON.parse(r.horario)) }) } catch { /* horário ilegível: o padrão */ }
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  // O horário mora no campo oculto do editor: lido do formulário a cada mexida.
  const horarioDoFormulario = () => {
    const v = formRef.current ? new FormData(formRef.current).get('horario') : null
    return typeof v === 'string' && v ? v : null
  }
  const [horarioMexido, setHorarioMexido] = useState<string | null>(null)
  useEffect(() => {
    if (!restaurado.current) return
    // Nada digitado não apaga o rascunho: o efeito roda ANTES de o rascunho
    // voltar ao estado (e duas vezes no modo estrito), com os campos vazios.
    if (!name && !slugDigitado && !phone && !email && !zipCode && !address && !city && !uf && !horarioMexido) return
    gravarRascunho({
      name, document, slug: slugDigitado, slugTouched, phone, email, zipCode, address, city, uf,
      horario: horarioMexido ?? (horarioSalvo.valor ? JSON.stringify(horarioSalvo.valor) : null),
    })
  }, [name, document, slugDigitado, slugTouched, phone, email, zipCode, address, city, uf, horarioMexido, horarioSalvo])
  // Depois do clique ou da troca dentro do editor, o campo oculto já mudou no próximo quadro.
  const lerHorarioDepois = () => requestAnimationFrame(() => setHorarioMexido(horarioDoFormulario()))

  // Busca o endereço assim que o CEP chega a 8 dígitos (sem esperar sair do campo).
  const [cepBuscado, setCepBuscado] = useState('')
  async function buscarCep(valor: string) {
    const digits = valor.replace(/\D/g, '')
    if (digits.length !== 8 || digits === cepBuscado) return
    setCepBuscado(digits)
    setCepLoading(true)
    setCepError(null)
    const result = await fetchCep(valor)
    setCepLoading(false)
    if (!result) { setCepError('CEP não encontrado.'); return }
    if (result.address) setAddress(result.address)
    setCity(result.city)
    setUf(result.uf)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    enviar()
  }

  function enviar(opcoes: { documento?: string; semCnpj?: boolean } = {}) {
    setError(null)

    const formData = new FormData()
    formData.set('name',     name)
    formData.set('slug',     slug)
    formData.set('document', opcoes.documento ?? document)
    if (opcoes.semCnpj) formData.set('_cnpj', 'sem')
    formData.set('_envio', envio.chave())
    formData.set('phone',    phone)
    formData.set('email',    email)
    formData.set('zip_code', zipCode)
    formData.set('address',  address)
    formData.set('address_number', numero)
    formData.set('city',     city)
    formData.set('state',    uf)
    // O horário vem do editor (campo oculto do formulário).
    const horario = formRef.current ? new FormData(formRef.current).get('horario') : null
    if (typeof horario === 'string') formData.set('horario', horario)

    startTransition(async () => {
      const result = await createBranch(undefined, formData)
      if ('error' in result) {
        setError(result.error ?? null)
      } else if ('perguntaCnpj' in result) {
        setPerguntaCnpj(result.perguntaCnpj)
      } else {
        envio.renovar()
        gravarRascunho(null)
        onNext()
      }
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ marginBottom: 4 }}>
        <h2 style={{
          fontSize: 'var(--text-title)',
          fontWeight: 'var(--weight-extrabold)',
          letterSpacing: 'var(--tracking-tight)',
          color: 'var(--text)',
          marginBottom: 4,
        }}>
          Primeira unidade
        </h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          Cadastre a primeira unidade da sua clínica. Você poderá adicionar mais depois.
        </p>
      </div>

      {/* Identificação */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="overline" htmlFor="br-name">Nome da unidade *</label>
        <input
          id="br-name"
          type="text"
          className="field"
          required
          placeholder="Ex: BellarisOS Pinheiros"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="overline" htmlFor="br-slug">
          Endereço da unidade
          <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: 4, textTransform: 'none' }}>
            — /{slug || 'nome-da-unidade'}
          </span>
        </label>
        <input
          id="br-slug"
          type="text"
          className="field"
          placeholder="nome-da-unidade"
          value={slug}
          onChange={e => { setSlugTouched(true); setSlug(e.target.value) }}
        />
        <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          O endereço é único entre todas as clínicas: se já estiver em uso, o sistema completa com o nome da sua.
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="overline" htmlFor="br-doc">CNPJ da unidade</label>
        <input
          id="br-doc"
          type="text"
          className="field"
          inputMode="numeric"
          placeholder="00.000.000/0001-00"
          value={document}
          onChange={e => setDocument(maskCPFouCNPJDigitando(e.target.value))}
        />
        <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          O mesmo da clínica, já preenchido. Troque se a unidade tiver CNPJ próprio.
        </span>
        {perguntaCnpj && !document.trim() && (
          <div role="alertdialog" aria-label="Unidade sem CNPJ" style={{
            display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6, padding: '12px 14px',
            borderRadius: 'var(--radius-field-token)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <AlertTriangle size={15} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} aria-hidden />
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', lineHeight: 1.45 }}>
                A unidade vai ficar sem CNPJ, e os documentos e o recibo dela saem sem ele.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary" disabled={pending} onClick={() => enviar({ semCnpj: true })}>
                Criar sem CNPJ
              </button>
              {perguntaCnpj.cnpjDaRede && (
                <button type="button" className="btn-primary" disabled={pending}
                  onClick={() => { const doc = perguntaCnpj.cnpjDaRede!; setDocument(doc); enviar({ documento: doc }) }}>
                  {`Usar o CNPJ da clínica (${perguntaCnpj.cnpjDaRede})`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="form-2col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline" htmlFor="br-phone">Telefone</label>
          <input
            id="br-phone"
            type="text"
            className="field"
            placeholder="(00) 00000-0000"
            value={phone}
            onChange={e => setPhone(maskPhoneDigitando(e.target.value))}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline" htmlFor="br-email">E-mail</label>
          <input
            id="br-email"
            type="email"
            className="field"
            placeholder="contato@clinica.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>
      </div>

      {/* Endereço */}
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline" htmlFor="br-zip">
            CEP
            {cepLoading && (
              <Loader2 size={11} style={{ marginLeft: 6, display: 'inline', animation: 'spin 1s linear infinite', verticalAlign: 'middle' }} />
            )}
          </label>
          <input
            id="br-zip"
            type="text"
            className="field"
            value={zipCode}
            onChange={e => { const v = maskCEPDigitando(e.target.value); setZipCode(v); setCepError(null); void buscarCep(v) }}
            onBlur={() => void buscarCep(zipCode)}
            placeholder="00000-000"
            maxLength={9}
          />
        </div>
        {cepError && (
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', marginBottom: 2 }}>
            {cepError}
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline" htmlFor="br-address">Logradouro</label>
          <input
            id="br-address"
            type="text"
            className="field"
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="Rua das Flores — Bairro"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {/* A7 da 9ª: o CEP preenche só o logradouro, e não havia onde pôr o número. */}
          <label className="overline" htmlFor="br-number">Número</label>
          <input id="br-number" type="text" className="field" inputMode="numeric" placeholder="123" value={numero} onChange={e => setNumero(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline" htmlFor="br-city">Cidade</label>
          <input
            id="br-city"
            type="text"
            className="field"
            value={city}
            onChange={e => setCity(e.target.value)}
            placeholder="Nome da cidade"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline" htmlFor="br-state">UF</label>
          <select
            id="br-state"
            className="field"
            value={uf}
            onChange={e => setUf(e.target.value)}
          >
            <option value="">—</option>
            {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p className="overline">Horário de funcionamento</p>
        <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          O padrão é segunda a sábado, das 8h às 20h. Ajuste o que for diferente — dá para mudar depois em Configurações.
        </span>
        {/* A2 da 7ª simulação: a clínica 24h não achava o domingo fechado no meio da lista. */}
        <p data-domingo-fechado role="note" style={{
          display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 12px', borderRadius: 'var(--radius-field-token)',
          background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
          fontSize: 'var(--text-xs-sz)', color: 'var(--text)', lineHeight: 1.45,
        }}>
          <AlertTriangle size={13} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} aria-hidden />
          <span>O domingo vem fechado. Se a clínica abre aos domingos (ou 24 horas), marque o domingo na lista abaixo e ajuste o horário de cada dia.</span>
        </p>
        <div onChange={lerHorarioDepois} onClick={lerHorarioDepois}>
          <EditorDeHorario key={horarioSalvo.chave} nome="horario" valor={horarioSalvo.valor} />
        </div>
      </div>

      {error && (
        <p style={{
          color: 'var(--warning)', background: 'var(--warning-soft)',
          borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
          fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
        }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <button type="button" onClick={onBack} disabled={pending} className="btn-secondary">← Voltar</button>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Criando…</> : 'Continuar →'}
        </button>
      </div>
    </form>
  )
}

// -- Step 3 — Concluído --------------------------------------------------------

function StepDone({ tenantName, foraDoPlano = [] }: { tenantName: string; foraDoPlano?: readonly string[] }) {
  // O passo de uma funcionalidade fora do plano da rede não aparece.
  const passosDoPlano = PROXIMOS_PASSOS.filter(p => !('recurso' in p) || !foraDoPlano.includes(p.recurso))
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleFinish(destino = '/admin/dashboard') {
    startTransition(async () => {
      await completeOnboarding()
      router.push(destino)
    })
  }

  return (
    <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
      {/* Check animado */}
      <div style={{
        width: 72,
        height: 72,
        borderRadius: '50%',
        background: 'var(--success-soft, var(--success-soft))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 24px',
        animation: 'popIn 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      }}>
        <Check size={32} style={{ color: 'var(--success)' }} strokeWidth={2.5} />
      </div>

      <h2 style={{
        fontSize: 'var(--text-title)',
        fontWeight: 'var(--weight-extrabold)',
        letterSpacing: 'var(--tracking-tight)',
        color: 'var(--text)',
        marginBottom: 8,
      }}>
        Tudo pronto!
      </h2>

      <p style={{
        fontSize: 'var(--text-sm-sz)',
        color: 'var(--text-muted)',
        lineHeight: 1.6,
        maxWidth: 340,
        margin: '0 auto 32px',
      }}>
        A clínica <strong style={{ color: 'var(--text)' }}>{tenantName}</strong> está configurada. Você já pode começar a usar o painel completo.
      </p>

      {/* A1 da 8ª simulação: o "Acessar o painel" ficava no fim, sem destaque, depois da lista. */}
      <button
        onClick={() => handleFinish()}
        disabled={pending}
        className="btn-primary"
        style={{ justifyContent: 'center', padding: '12px 28px', fontSize: 'var(--text-base-sz)', marginBottom: 28 }}
      >
        {pending ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Abrindo painel…</> : 'Acessar o painel →'}
      </button>

      {/* A3 da 6ª simulação: a ordem que evita o "ninguém atende" e o "o insumo precisa existir antes". */}
      <div data-proximos-passos style={{ textAlign: 'left', maxWidth: 380, margin: '0 auto 28px' }}>
        <p className="overline" style={{ marginBottom: 10 }}>Ou comece pelos próximos passos, nesta ordem</p>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {passosDoPlano.map((passo, i) => (
            <li key={passo.titulo}>
              {/* A1 da 7ª simulação: um LINK de verdade (o endereço aparece, abre
                  em outra aba); o clique comum conclui o setup antes de ir. */}
              <a href={passo.href} aria-disabled={pending || undefined} className="card card-hover"
                onClick={e => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                  e.preventDefault()
                  if (!pending) handleFinish(passo.href)
                }}
                style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', textAlign: 'left', cursor: 'pointer', textDecoration: 'none' }}>
                <span style={{ fontWeight: 'var(--weight-extrabold)', color: 'var(--brand)', minWidth: 16 }}>{i + 1}</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>{passo.titulo}</span>
                  <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>{passo.porque}</span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      </div>


      <style>{`
        @keyframes popIn {
          from { transform: scale(0.6); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  )
}

/**
 * Os próximos passos do fim do setup (A3 da 6ª simulação), na ordem em que um
 * depende do outro: o procedimento pede quem o realiza e os insumos que
 * consome, e a taxa da maquininha vale desde a primeira venda no cartão.
 */
const PROXIMOS_PASSOS = [
  // A1 da 8ª simulação: a 2ª unidade e as salas não apareciam (com duas
  // unidades, as salas passam ao "Ver detalhes" de cada uma, sem pista).
  { titulo: 'Outra unidade (se houver)', porque: 'A segunda unidade vem antes da equipe: quem atende se marca em cada unidade.', href: '/admin/settings?tab=unidades' },
  { titulo: 'Equipe', porque: 'Quem atende, e em quais unidades: sem profissional, o procedimento não tem quem o realize.', href: '/admin/team' },
  { titulo: 'Salas', porque: 'As salas ou cabines: o agendar oferece a livre. Com duas unidades, ficam no “Ver detalhes” de cada uma.', href: '/admin/settings?tab=unidades#salas' },
  { titulo: 'Estoque', porque: 'Os insumos: o procedimento só baixa o que já está cadastrado.', href: '/admin/estoque' },
  // A1 da 7ª simulação: o procedimento pede a ficha e o termo JÁ existentes.
  { titulo: 'Fichas', porque: 'A anamnese de cada procedimento: ele escolhe uma ficha que já existe.', href: '/admin/settings?tab=fichas', recurso: 'fichas' },
  { titulo: 'Termos e contratos', porque: 'O termo que o procedimento pede antes de começar — também escolhido de um que já existe.', href: '/admin/settings?tab=documentos', recurso: 'documentos' },
  { titulo: 'Procedimentos', porque: 'O catálogo, com quem realiza, os insumos, a ficha, o termo e o preço.', href: '/admin/procedures' },
  { titulo: 'Taxas da maquininha', porque: 'O que a operadora desconta em cada forma e bandeira.', href: '/admin/settings?tab=comissoes' },
  { titulo: 'Fidelidade', porque: 'Os pontos e as recompensas: o programa nasce desligado, e a clínica liga se quiser.', href: '/admin/settings?tab=fidelidade', recurso: 'fidelidade' },
  { titulo: 'Funil de oportunidades', porque: 'As etapas, as origens dos leads e os motivos de perda do comercial.', href: '/admin/oportunidades', recurso: 'oportunidades' },
] as const

// -- Wizard root ---------------------------------------------------------------

/**
 * O passo na URL NA HORA, pelo history do navegador (o Next o acompanha). Com
 * router.replace a URL só mudava quando a ida ao servidor voltava: recarregar
 * logo depois de continuar (no build, ~50 ms) ainda pegava /setup e voltava ao
 * passo 1 — e a página não tem nada a buscar para trocar de passo.
 */
function passoNaUrl(passo: 'unidade' | null) {
  window.history.replaceState(null, '', passo ? `/setup?passo=${passo}` : '/setup')
}

export function SetupWizard({ rede: inicial, temUnidade, noPassoDaUnidade = false, foraDoPlano = [] }: {
  rede: DadosDaRede; temUnidade: boolean
  /** As funcionalidades que o plano da rede não tem: o passo delas não aparece. */
  foraDoPlano?: readonly string[]
  /** A rede já foi salva neste setup (`?passo=unidade`): recarregar fica na unidade (J-3). */
  noPassoDaUnidade?: boolean
}) {
  // A rede que já tem unidade (saiu no meio e voltou) vai direto ao fim; a
  // que já salvou a rede e recarregou fica no passo da unidade (J-3: voltava
  // ao passo 1). O passo mora na URL, que o recarregar mantém.
  const [step, setStep] = useState(temUnidade ? 2 : noPassoDaUnidade ? 1 : 0)
  const [rede, setRede] = useState(inicial)

  return (
    <div className="card" style={{ padding: '32px 28px' }}>
      <Stepper current={step} />

      {step === 0 && (
        <StepNetwork
          inicial={rede}
          onNext={(salvos) => { setRede(salvos); setStep(1); passoNaUrl('unidade') }}
        />
      )}
      {step === 1 && (
        <StepBranch documentoDaRede={rede.documento}
          // Concluída a unidade, a URL sai do passo (A1): recarregar o fim já
          // cai no fim, pela unidade que existe.
          onNext={() => { setStep(2); passoNaUrl(null) }} onBack={() => { setStep(0); passoNaUrl(null) }} />
      )}
      {step === 2 && (
        <StepDone tenantName={rede.nome} foraDoPlano={foraDoPlano} />
      )}
    </div>
  )
}

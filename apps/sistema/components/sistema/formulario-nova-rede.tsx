'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { criarRede } from '@/actions/sistema'
import { centavosDe, campoDeReais, reaisDe } from '@estetica-os/nucleo/lib/redes/valor'
import { SegSelect } from '@estetica-os/nucleo/components/shared/seg-select'

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

/** O formulário do "Nova rede" (só ADMIN; a action confere de novo). */
export function FormularioNovaRede({ planos, diasDeTeste }: {
  planos: { id: string; nome: string; valorCentavos: number }[]
  diasDeTeste: number
}) {
  const router = useRouter()
  const [planoId, setPlanoId] = useState(planos[0]?.id ?? '')
  const [valor, setValor] = useState(planos[0] ? campoDeReais(planos[0].valorCentavos) : '')
  const [inicio, setInicio] = useState<'teste' | 'cobrando'>('teste')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function escolherPlano(id: string) {
    setPlanoId(id)
    const p = planos.find(x => x.id === id)
    setValor(p ? campoDeReais(p.valorCentavos) : '')
  }

  function enviar(form: FormData) {
    setErro(null)
    const centavos = valor.trim() ? centavosDe(valor) : null
    if (valor.trim() && centavos == null) { setErro('Valor inválido.'); return }
    iniciar(async () => {
      const r = await criarRede({
        nomeDaRede: String(form.get('nome') ?? ''),
        documento: String(form.get('documento') ?? ''),
        emailDoResponsavel: String(form.get('email') ?? ''),
        nomeDoResponsavel: String(form.get('responsavel') ?? ''),
        telefone: String(form.get('telefone') ?? '') || null,
        planoId: planoId || null,
        valorCentavos: centavos,
        inicio,
        diasDeTeste: inicio === 'teste' ? Number(form.get('dias') ?? diasDeTeste) : null,
        primeiroVencimento: inicio === 'cobrando' ? String(form.get('vencimento') ?? '') || null : null,
      })
      if (!r.ok) { setErro(r.error); return }
      if (r.aviso) toast.warning(r.aviso)
      else toast.success('Rede criada. O convite foi para o e-mail do responsável.')
      router.push(`/redes/${r.tenantId}`)
    })
  }

  return (
    <form action={enviar} className="card suporte-secao">
      <div className="sistema-form">
        <label className="suporte-campo"><span className="field-label">Nome da rede</span>
          <input className="field" name="nome" required minLength={2} maxLength={100} placeholder="Ex.: Clínica Bella" />
        </label>
        <label className="suporte-campo"><span className="field-label">CPF ou CNPJ</span>
          <input className="field" name="documento" required inputMode="numeric" placeholder="Só os números" />
        </label>
        <label className="suporte-campo"><span className="field-label">Telefone</span>
          <input className="field" name="telefone" inputMode="tel" placeholder="(11) 99999-9999" />
        </label>
        <label className="suporte-campo"><span className="field-label">Nome do responsável</span>
          <input className="field" name="responsavel" required maxLength={100} />
        </label>
        <label className="suporte-campo"><span className="field-label">E-mail do responsável</span>
          <input className="field" name="email" type="email" required placeholder="quem vai administrar a rede" />
        </label>
        <label className="suporte-campo"><span className="field-label">Plano</span>
          <select className="filtro-select" value={planoId} onChange={e => escolherPlano(e.target.value)}>
            <option value="">Sem plano por enquanto</option>
            {planos.map(p => <option key={p.id} value={p.id}>{p.nome} · {reaisDe(p.valorCentavos)}</option>)}
          </select>
        </label>
        <label className="suporte-campo"><span className="field-label">Valor mensal (R$)</span>
          <input className="field" value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal"
            placeholder="o do plano" aria-describedby="valor-nota" />
          <span id="valor-nota" className="suporte-texto-fraco">Mude só para um preço especial desta rede.</span>
        </label>
        <div className="suporte-campo"><span className="field-label">Como começa</span>
          <SegSelect options={[{ key: 'teste', label: 'Em teste' }, { key: 'cobrando', label: 'Já cobrando' }]}
            value={inicio} onSelect={k => setInicio(k as 'teste' | 'cobrando')} ariaLabel="Como começa" />
        </div>
        {inicio === 'cobrando' && (
          <label className="suporte-campo"><span className="field-label">Primeiro vencimento</span>
            <input className="field" name="vencimento" type="date" defaultValue={hoje()} />
          </label>
        )}
        {inicio === 'teste' && (
          <label className="suporte-campo"><span className="field-label">Dias de teste</span>
            <input className="field" name="dias" type="number" min={1} max={90} defaultValue={diasDeTeste} />
          </label>
        )}
      </div>
      {inicio === 'cobrando' && (
        <p className="suporte-texto-fraco">A rede começa em dia, e a cobrança mensal liga no Asaas com este primeiro vencimento (se o Asaas estiver configurado; senão, ligue no detalhe dela).</p>
      )}
      {erro && <p className="suporte-erro" role="alert">{erro}</p>}
      <div className="sistema-acoes">
        <button type="submit" className="btn-primary" disabled={pendente}>{pendente ? 'Criando…' : 'Criar rede'}</button>
      </div>
    </form>
  )
}

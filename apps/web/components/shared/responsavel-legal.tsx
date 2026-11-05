'use client'

import { useId } from 'react'
import { ShieldAlert } from 'lucide-react'
import { maskCPF, maskTelefoneDigitando, idadeEm } from '@estetica-os/utils'
import { PARENTESCOS } from '@/lib/clients/menor'

/**
 * O responsável legal da menor de idade, no cadastro e na aba Dados da ficha
 * (decisão 2 do Heitor, 2026-11-05: "concordo"). Aparece quando a data de
 * nascimento diz menos de 18 anos. Nada é obrigatório (princípio 2: avisar,
 * não barrar): sem o nome, o aviso diz que é ele quem assina o termo.
 *
 * `comNomes`: os campos levam `name` (o formulário do cadastro, que envia o
 * FormData); na aba Dados, a tela manda o estado.
 */

export interface CamposDoResponsavel { nome: string; cpf: string; parentesco: string; telefone: string }
export const RESPONSAVEL_VAZIO: CamposDoResponsavel = { nome: '', cpf: '', parentesco: '', telefone: '' }

export function ResponsavelLegal({ nascimento, valor, aoMudar, comNomes = false }: {
  /** "AAAA-MM-DD": a idade se calcula no dia de Brasília. */
  nascimento: string
  valor:      CamposDoResponsavel
  aoMudar:    (v: CamposDoResponsavel) => void
  comNomes?:  boolean
}) {
  const id = useId()
  const idade = idadeEm(nascimento)
  if (idade == null || idade >= 18) return null
  const mudar = (campo: keyof CamposDoResponsavel, v: string) => aoMudar({ ...valor, [campo]: v })
  const outro = !!valor.parentesco && !(PARENTESCOS as readonly string[]).includes(valor.parentesco)

  return (
    <section data-responsavel-legal aria-labelledby={`${id}-titulo`} style={{
      display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 16px',
      borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)', background: 'var(--bg-app)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <ShieldAlert size={15} color="var(--brand)" aria-hidden="true" />
        <h3 id={`${id}-titulo`} style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
          Responsável legal
        </h3>
        <span className="chip chip-brand">Menor · {idade} anos</span>
      </div>
      <p style={{ fontSize: 'var(--text-xs-sz)', color: valor.nome.trim() ? 'var(--text-muted)' : 'var(--warning)', fontWeight: valor.nome.trim() ? 'var(--weight-regular)' : 'var(--weight-semibold)', lineHeight: 1.5 }}>
        {valor.nome.trim()
          ? 'O responsável assina o termo pela menor, e o termo pode citá-lo.'
          : 'Menor de idade: cadastre o responsável legal — é ele quem assina o termo. Dá para salvar sem ele.'}
      </p>
      <div className="form-2col">
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span className="field-label">Nome do responsável</span>
          <input className="field" name={comNomes ? 'responsavel_nome' : undefined} value={valor.nome}
            onChange={e => mudar('nome', e.target.value)} placeholder="Nome completo" maxLength={120} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span className="field-label">CPF do responsável</span>
          <input className="field" name={comNomes ? 'responsavel_cpf' : undefined} inputMode="numeric" value={valor.cpf}
            onChange={e => mudar('cpf', maskCPF(e.target.value).slice(0, 14))} placeholder="000.000.000-00" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span className="field-label">Parentesco</span>
          <select className="field" value={outro ? 'Outro' : valor.parentesco}
            onChange={e => mudar('parentesco', e.target.value === 'Outro' ? ' ' : e.target.value)}>
            <option value="">Selecione…</option>
            {PARENTESCOS.map(p => <option key={p} value={p}>{p}</option>)}
            <option value="Outro">Outro</option>
          </select>
          {outro && (
            <input className="field" aria-label="Qual parentesco" value={valor.parentesco.trimStart()}
              onChange={e => mudar('parentesco', e.target.value || ' ')} placeholder="Qual?" maxLength={40} />
          )}
          {comNomes && <input type="hidden" name="responsavel_parentesco" value={valor.parentesco.trim()} />}
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span className="field-label">Telefone do responsável</span>
          <input className="field" type="tel" name={comNomes ? 'responsavel_telefone' : undefined} value={valor.telefone}
            onChange={e => mudar('telefone', maskTelefoneDigitando(e.target.value))} placeholder="(00) 00000-0000" />
        </label>
      </div>
    </section>
  )
}

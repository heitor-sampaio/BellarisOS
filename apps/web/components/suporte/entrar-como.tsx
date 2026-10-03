'use client'

import { useState } from 'react'

/**
 * "Entrar como" um membro — só aparece com autorização vigente da clínica.
 * O motivo é obrigatório e fica no registro que a clínica vê. É um POST de
 * formulário de verdade (não fetch): a rota troca os cookies da sessão e
 * redireciona para o portal do membro.
 */
export function EntrarComo({ tenantId, userId, nome, expiraEm, clinico, chamadoId }: {
  tenantId: string; userId: string; nome: string; expiraEm: string; clinico: boolean; chamadoId?: string | null
}) {
  const [aberto, setAberto] = useState(false)
  const ate = new Date(expiraEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })
  if (!aberto) {
    return (
      <div className="suporte-acoes">
        <span className="suporte-texto-fraco">Autorizado até {ate}{clinico ? ' · com prontuário' : ''}</span>
        <button type="button" className="btn-primary" onClick={() => setAberto(true)}>Entrar como</button>
      </div>
    )
  }
  return (
    <form method="post" action="/api/suporte/entrar" className="suporte-acoes">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="userId" value={userId} />
      {chamadoId && <input type="hidden" name="chamadoId" value={chamadoId} />}
      <input
        name="motivo" className="field" required minLength={3} maxLength={300} autoFocus
        placeholder={`Motivo para entrar como ${nome}`} aria-label="Motivo do acesso" style={{ minWidth: 220 }}
      />
      <button type="submit" className="btn-primary">Entrar</button>
      <button type="button" className="btn-ghost" onClick={() => setAberto(false)}>Cancelar</button>
    </form>
  )
}

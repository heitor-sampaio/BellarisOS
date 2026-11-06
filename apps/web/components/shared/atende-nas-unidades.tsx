'use client'

interface Unidade { id: string; name: string }

/**
 * O "Atende" do membro (decisão 2 do Heitor sobre a 8ª simulação, 2026-11-06:
 * "Inves de atende também em, o atende vira um checklist com todas as
 * unidades, as que estiverem marcadas ficam disponiveis"). Marcada, a unidade
 * tem a pessoa como profissional: agenda, agendar, repasse, comissão. Não é
 * abrangência — o acesso continua o da unidade (ou da rede) dela.
 *
 * Numa clínica de UMA unidade é a caixa de sempre ("Atende clientes…"). A
 * lista vai ao servidor num campo só (`atendeEm`, ids separados por vírgula,
 * com `_atendeEm=1`): controlada, porque o React 19 limpa o campo solto do
 * formulário a cada envio. A unidade fora do alcance de quem edita (a gerente
 * de unidade fixa) aparece travada — o servidor também só muda a dela.
 */
export function AtendeNasUnidades({ unidades, marcadas, aoMudar, editaveis = null, id = 'atende' }: {
  unidades: Unidade[]
  marcadas: string[]
  aoMudar:  (ids: string[]) => void
  /** As que quem edita pode mudar; null = todas. */
  editaveis?: string[] | null
  id?: string
}) {
  const pode = (u: string) => editaveis === null || editaveis.includes(u)
  const alternar = (u: string, ligar: boolean) =>
    aoMudar(ligar ? [...new Set([...marcadas, u])] : marcadas.filter(x => x !== u))
  const campos = (
    <>
      <input type="hidden" name="_atendeEm" value="1" />
      <input type="hidden" name="atendeEm" value={marcadas.join(',')} />
    </>
  )

  if (unidades.length <= 1) {
    const u = unidades[0]
    return (
      <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        {campos}
        <input type="checkbox" checked={!!u && marcadas.includes(u.id)} disabled={!u || !pode(u.id)}
          onChange={e => u && alternar(u.id, e.target.checked)}
          style={{ width: 16, height: 16, accentColor: 'var(--brand)' }} />
        <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
          Atende clientes (aparece na agenda como profissional e gera comissão)
        </span>
      </label>
    )
  }

  const titulo = `${id}-titulo`
  return (
    <div role="group" aria-labelledby={titulo} data-atende-nas-unidades
      style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {campos}
      <span id={titulo} className="field-label">Atende clientes em</span>
      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
        Nas unidades marcadas ela aparece na agenda como profissional e gera comissão. O acesso não muda: numa
        unidade que não é a dela, ela vê só os próprios atendimentos.
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
        {unidades.map(u => (
          <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: pode(u.id) ? 'pointer' : 'default' }}
            title={pode(u.id) ? undefined : 'Quem marca outra unidade é a Equipe da rede.'}>
            <input type="checkbox" checked={marcadas.includes(u.id)} disabled={!pode(u.id)}
              onChange={e => alternar(u.id, e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--brand)' }} />
            <span style={{ fontSize: 'var(--text-sm-sz)', color: pode(u.id) ? 'var(--text)' : 'var(--text-muted)' }}>{u.name}</span>
          </label>
        ))}
      </div>
    </div>
  )
}


'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { EVENTOS, NODES, INTERVALO_MINIMO_MIN, rotuloDoEvento } from '@estetica-os/types'
import type {
  NoDoGrafo, GrafoDeAutomacao, TipoDeNo,
  GrupoDeCondicao, RegraDeCondicao, OperadorDeCondicao,
} from '@estetica-os/types'
import { ROTULOS } from '@/lib/automacoes/validar'
import { RelogioDaRede } from '@/components/shared/fuso'
import { Dica as DicaDoTexto } from '@/components/shared/dica'
import {
  variaveisDisponiveis, eventoDoGatilhoDe, rotulosUnicos, CAMPOS_DE_PROCEDIMENTO, CAMPOS_DE_ETAPA,
  type GrupoDeVariaveis, type CampoVisto,
} from '@/lib/automacoes/disponiveis'
import { nomeDoPasso } from '@/lib/automacoes/passos'
import { partesDoDeslocamento, minutosDoDeslocamento, type PartesDoDeslocamento } from '@/lib/automacoes/deslocamento'
import { semPedirResposta } from '@/lib/automacoes/modelos'
import { SITUACOES_DO_AGENDAMENTO, ehSituacaoDoAgendamento, DESFECHOS_DA_ETAPA, ehDesfechoDaEtapa } from '@/lib/automacoes/resumo'
import { conferirExpressao, ehCaminhoSimples, NOMES_DE_FUNCAO } from '@/lib/automacoes/expressao'
import { conferirLimiteDaBusca, avisoDoLimiteDaBusca, LIMITE_PADRAO_DA_BUSCA } from '@/lib/automacoes/busca-do-passo'
import { recusaDoDiaDoMes, dicaDoDiaDoMes } from '@/lib/automacoes/dia-do-mes'
import { amostraDoEvento, contarBuscaDeClientes } from '@/actions/automacoes'
import type { OpcoesDoEditor } from '@/actions/automacoes'
import { TagPicker } from '@/components/shared/tag-picker'
import { useTagsDaRede } from '@/components/shared/use-tags-da-rede'
import { opcoesDeTag } from '@/lib/tags/escolha'

/**
 * O painel de configuração do node selecionado.
 *
 * Cada tipo pede coisas diferentes, e o formulário é montado a partir do tipo —
 * um formulário genérico com "chave/valor" transferiria para a recepção da
 * clínica a tarefa de saber o nome interno dos campos.
 */

const OPERADORES: { valor: OperadorDeCondicao; rotulo: string; semValor?: boolean }[] = [
  { valor: 'igual',      rotulo: 'é igual a' },
  { valor: 'diferente',  rotulo: 'é diferente de' },
  { valor: 'contem',     rotulo: 'contém' },
  { valor: 'nao_contem', rotulo: 'não contém' },
  { valor: 'maior',      rotulo: 'é maior que' },
  { valor: 'menor',      rotulo: 'é menor que' },
  { valor: 'preenchido', rotulo: 'está preenchido', semValor: true },
  { valor: 'vazio',      rotulo: 'está vazio',      semValor: true },
]

interface Props {
  no:       NoDoGrafo
  /** O grafo inteiro: a lista de campos depende de ONDE o node está. */
  grafo:    GrafoDeAutomacao
  /** Etapas, cargos, pessoas e tags da rede — carregadas uma vez pelo editor. */
  opcoes:   OpcoesDoEditor | null
  onChange: (config: Record<string, unknown>) => void
  onRenomear: (nome: string) => void
  onExcluir: () => void
  onFechar:  () => void
  somenteLeitura?: boolean
}

export function PainelDoNo({
  no, grafo, opcoes, onChange, onRenomear, onExcluir, onFechar, somenteLeitura,
}: Props) {
  const c = (no.config ?? {}) as Record<string, unknown>
  const set = (patch: Record<string, unknown>) => onChange({ ...c, ...patch })

  /**
   * O que o último fato real daquele evento trouxe.
   *
   * O catálogo declara o que o evento deveria carregar; isto mostra o que ELE
   * de fato carregou, com um exemplo ao lado. É a diferença entre oferecer uma
   * lista teórica e oferecer o dado que chega — e é o que responde "é este
   * campo mesmo?" sem abrir o banco.
   */
  const evento = eventoDoGatilhoDe(grafo, no.id)
  // Guardada COM o evento a que pertence, e usada só quando os dois batem.
  // Gatilho trocado no meio do caminho não pode deixar a amostra antiga na
  // tela: seriam campos de outro evento, oferecidos como se fossem deste.
  const [amostra, setAmostra] = useState<{ evento: string; campos: CampoVisto[] } | null>(null)

  useEffect(() => {
    if (!evento) return
    let valeu = true
    amostraDoEvento(evento)
      .then(campos => { if (valeu) setAmostra({ evento, campos }) })
      .catch(() => {})
    return () => { valeu = false }
  }, [evento])

  const vistos = amostra?.evento === evento ? amostra.campos : []

  // O painel remonta a cada node (`key` no editor), então o rascunho nasce
  // sempre com o nome do passo que está aberto.
  const [rascunhoNome, setRascunhoNome] = useState(nomeDoPasso(no, grafo))
  // O nome também muda por fora (a espera que acompanha o deslocamento, D8 da
  // 30ª): o rascunho segue o nome gravado quando ele muda.
  const nomeGravado = nomeDoPasso(no, grafo)
  const [nomeVisto, setNomeVisto] = useState(nomeGravado)
  if (nomeVisto !== nomeGravado) { setNomeVisto(nomeGravado); setRascunhoNome(nomeGravado) }

  const variaveis = variaveisDisponiveis(grafo, no.id, { vistos })

  // O gatilho de tempo tem duas famílias de frequência: a que repete de tempos
  // em tempos ("a cada 30 minutos") e a que acontece num horário do dia. Os
  // campos de uma não fazem sentido na outra.
  const porIntervalo = c.frequencia === 'minutos' || c.frequencia === 'horas'

  return (
    <aside
      className="auto-gaveta"
      aria-label="Configuração do node"
      style={{
        width: 320, flexShrink: 0, background: 'var(--surface)',
        borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: '1px solid var(--hairline)', gap: 8,
      }}>
        <span style={{ fontWeight: 'var(--weight-extrabold)', fontSize: 'var(--text-sm-sz)' }}>
          {ROTULOS[no.tipo as TipoDeNo]}
        </span>
        <button type="button" onClick={onFechar} className="btn-ghost" aria-label="Fechar" style={{ padding: 4 }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        {/* O nome vem primeiro porque é por ele que os passos seguintes leem o
            que este deixou — é identidade, não enfeite. */}
        <Campo rotulo="Nome do passo">
          {/* Rascunho local, aplicado ao sair do campo: renomear a cada tecla
              faria o nome passar por "" no meio da digitação, e as referências
              dos outros passos seriam reescritas para um nome pela metade. */}
          <input
            className="field" value={rascunhoNome}
            disabled={somenteLeitura}
            onChange={e => setRascunhoNome(e.target.value)}
            onBlur={() => { if (rascunhoNome !== nomeDoPasso(no, grafo)) onRenomear(rascunhoNome) }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            placeholder={ROTULOS[no.tipo as TipoDeNo]}
          />
          {/* A11 da 14ª: era jargão ({{passos.um_dia_antes.…}}). O que importa
              a quem monta é que o nome aparece na lista de campos dos passos
              seguintes. */}
          <Dica>
            Os passos seguintes usam o que este deixou pela lista de campos,
            onde ele aparece com este nome. Renomear atualiza quem o usa.
          </Dica>
        </Campo>

        {no.tipo === NODES.GATILHO_EVENTO && (
          <Campo rotulo="Quando acontecer">
            <select
              className="field" value={(c.evento as string) ?? ''}
              disabled={somenteLeitura}
              onChange={e => set({ evento: e.target.value })}
            >
              <option value="">Escolha o evento…</option>
              {agruparEventos().map(([entidade, nomes]) => (
                <optgroup key={entidade} label={entidade}>
                  {nomes.map(n => <option key={n} value={n}>{rotuloDoEvento(n)}</option>)}
                </optgroup>
              ))}
            </select>
            <Dica>
              Mudar o evento troca o gatilho da automação inteira — o que vier
              depois passa a receber outro contexto.
            </Dica>
          </Campo>
        )}

        {no.tipo === NODES.CONDICAO_SE && (
          <EditorDeGrupo
            grupo={(c.grupo as GrupoDeCondicao) ?? { juncao: 'e', regras: [] }}
            variaveis={variaveis}
            procedimentos={opcoes?.procedimentos ?? []}
            etapas={opcoes?.etapas ?? []}
            onChange={g => set({ grupo: g })}
            somenteLeitura={somenteLeitura}
          />
        )}
        {/* A18 da 11ª: o lado sem ligação que termina DE PROPÓSITO (o modelo de
            lembrete: cancelado, nada a mandar) não é engano — a clínica diz. */}
        {no.tipo === NODES.CONDICAO_SE && (
          <label data-outro-lado-termina style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" disabled={somenteLeitura} checked={!!c.outroLadoTerminaDeProposito}
              onChange={e => set({ outroLadoTerminaDeProposito: e.target.checked || undefined })} style={{ marginTop: 2 }} />
            <span>Com só uma saída ligada, o outro caminho termina aqui de propósito (não avisar).</span>
          </label>
        )}

        {no.tipo === NODES.CONDICAO_ESCOLHA && (
          <>
            <Campo rotulo="Comparar o campo">
              <SelectDeCampo
                valor={(c.campo as string) ?? ''}
                grupos={variaveis}
                onChange={v => set({ campo: v })}
                somenteLeitura={somenteLeitura}
              />
            </Campo>
            <EditorDeCasos
              casos={(c.casos as { chave: string; valor: string }[]) ?? []}
              onChange={casos => set({ casos })}
              somenteLeitura={somenteLeitura}
            />
          </>
        )}

        {no.tipo === NODES.ACAO_NOTIFICAR_EQUIPE && (
          <>
            <Campo rotulo="Avisar">
              <select
                className="field" value={(c.alvo as string) ?? 'unidade'}
                disabled={somenteLeitura}
                onChange={e => set({ alvo: e.target.value, alvoId: null })}
              >
                <option value="unidade">A unidade do fato</option>
                <option value="cargo">Um cargo</option>
                <option value="usuario">Uma pessoa</option>
                {/* O modelo "Marque o ganho" (2026-11-18): o responsável do card. */}
                <option value="responsavel">Quem cuida da oportunidade</option>
              </select>
              {c.alvo === 'cargo' && (
                <select
                  className="field" style={{ marginTop: 6 }} value={(c.alvoId as string) ?? ''}
                  disabled={somenteLeitura}
                  onChange={e => set({ alvoId: e.target.value || null })}
                >
                  <option value="">Escolha o cargo…</option>
                  {(opcoes?.cargos ?? []).map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>
              )}
              {c.alvo === 'usuario' && (
                <select
                  className="field" style={{ marginTop: 6 }} value={(c.alvoId as string) ?? ''}
                  disabled={somenteLeitura}
                  onChange={e => set({ alvoId: e.target.value || null })}
                >
                  <option value="">Escolha a pessoa…</option>
                  {(opcoes?.pessoas ?? []).map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              )}
            </Campo>
            <Campo rotulo="Título">
              <input
                className="field" value={(c.titulo as string) ?? ''}
                disabled={somenteLeitura}
                onChange={e => set({ titulo: e.target.value })}
                placeholder="Cliente novo: {{cliente.nome}}"
              />
            </Campo>
            <Campo rotulo="Mensagem">
              <TextoComVariaveis
                valor={(c.corpo as string) ?? ''}
                grupos={variaveis}
                onChange={v => set({ corpo: v })}
                somenteLeitura={somenteLeitura}
                placeholder="Telefone {{cliente.telefone}}"
              />
              <Dica>
                A lista acima insere a variável no lugar do cursor. Ela traz o
                que este ponto do fluxo tem: o que chegou no gatilho, o cliente
                e o que os passos anteriores deixaram.
              </Dica>
            </Campo>
          </>
        )}

        {no.tipo === NODES.ACAO_ANOTAR && (
          <Campo rotulo="Texto da anotação">
            <TextoComVariaveis
              valor={(c.texto as string) ?? ''}
              grupos={variaveis}
              onChange={v => set({ texto: v })}
              somenteLeitura={somenteLeitura}
              placeholder="Cliente voltou pelo anúncio de {{evento.dados.campanhaNome}}"
            />
            <Dica>A anotação entra na linha do tempo da oportunidade, com o nome da automação.</Dica>
          </Campo>
        )}

        {no.tipo === NODES.ACAO_MENSAGEM && (
          <>
            <Campo rotulo="Canal">
              <select
                className="field" value={(c.canal as string) ?? ''}
                disabled={somenteLeitura}
                onChange={e => set({ canal: e.target.value })}
              >
                {/* O seletor mostra o que está NA CONFIG (D16, 2026-10-28): o passo
                    novo nasce com 'whatsapp' gravado (configPadrao); o salvo sem
                    canal mostra isto, e não um WhatsApp que ninguém escolheu. */}
                {!c.canal && <option value="" disabled>Escolha o canal…</option>}
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
                <option value="messenger">Messenger</option>
                <option value="push">Aviso no celular (push)</option>
              </select>
            </Campo>
            {c.canal === 'whatsapp' && opcoes && !opcoes.whatsappConectado && (
              // A14: o passo em WhatsApp numa rede sem número não manda nada.
              <div data-sem-whatsapp role="note" style={{
                display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px',
                borderRadius: 'var(--radius-field-token)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
              }}>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
                  A rede não tem WhatsApp conectado: por este canal, a mensagem não sai.
                  {somenteLeitura
                    ? ' Quem conecta é a Admin da rede, em Configurações → Integrações.'
                    : ' Conecte em Configurações → Integrações, ou mande como aviso no celular da cliente.'}
                </p>
                {!somenteLeitura && (
                  <button type="button" className="btn-secondary" style={{ alignSelf: 'flex-start', fontSize: 'var(--text-xs-sz)' }}
                    // A10 da 17ª: o aviso no celular não se responde — o pedido de resposta do modelo sai junto.
                    onClick={() => set({ canal: 'push', texto: semPedirResposta((c.texto as string) ?? '') })}>
                    Mandar como aviso no celular
                  </button>
                )}
              </div>
            )}
            {/* A18 da 38ª (princípio 7, "intuitivo não é explicativo"): a
                mensagem logo depois do canal, sem parágrafo — o canal "Aviso no
                celular (push)" e o modelo "(fora das 24 horas)" dizem o resto. */}
            <Campo rotulo="Mensagem">
              <TextoComVariaveis
                valor={(c.texto as string) ?? ''}
                grupos={variaveis}
                onChange={v => set({ texto: v })}
                linhas={4}
                somenteLeitura={somenteLeitura}
                placeholder="Oi {{cliente.nome}}, tudo bem?"
              />
            </Campo>
            {/* AX-06 (o Heitor, 2026-11-11, H1; D6 da 32ª; R10, 26/11): desligado
                por padrão (princípio 6). A automação só abre conversa nova se a
                rede escolher "Abrir pelo número padrão" (só no WhatsApp). */}
            {c.canal && c.canal !== 'push' && (
              <div data-sem-conversa>
                <Campo rotulo="Para quem não tem conversa aberta">
                  <select
                    className="field" value={(c.semConversa as string) ?? 'nao_mandar'}
                    disabled={somenteLeitura}
                    onChange={e => set({ semConversa: e.target.value === 'nao_mandar' ? undefined : e.target.value })}
                  >
                    <option value="nao_mandar">Não mandar</option>
                    {(c.canal === 'whatsapp' || c.semConversa === 'abrir_pelo_padrao') && (
                      <option value="abrir_pelo_padrao">Abrir pelo número padrão</option>
                    )}
                    <option value="aviso_no_celular">Mandar como aviso no celular</option>
                  </select>
                </Campo>
                {/* A18 da 38ª: só o estado do número padrão e o risco (AX-06). */}
                {c.semConversa === 'abrir_pelo_padrao' && (
                  <Dica>{textoDoAbrirPeloPadrao(opcoes?.numeroPadrao ?? null)}</Dica>
                )}
              </div>
            )}
            {/* R10: o modelo aprovado da conta do número padrão oficial — o que
                abre a conversa e o que sai fora das 24 horas. */}
            {c.canal === 'whatsapp' && opcoes?.numeroPadrao?.oficial && (
              <ModeloDoPasso
                config={c} set={set} somenteLeitura={somenteLeitura}
                modelos={opcoes.modelosDoPadrao} grupos={variaveis}
                exigido={c.semConversa === 'abrir_pelo_padrao'}
              />
            )}
          </>
        )}

        {no.tipo === NODES.ACAO_MOVER_ETAPA && (
          <MoverDeEtapa
            config={c} opcoes={opcoes} set={set} somenteLeitura={somenteLeitura}
          />
        )}

        {no.tipo === NODES.ACAO_DESFECHO && (
          <Campo rotulo="Marcar como">
            <select
              className="field" value={(c.desfecho as string) ?? 'ganho'}
              disabled={somenteLeitura}
              onChange={e => set({ desfecho: e.target.value })}
            >
              <option value="ganho">Ganho</option>
              <option value="perdido">Perdido</option>
            </select>
            <Dica>
              Move a oportunidade para a etapa de desfecho do funil em que ela
              está — é assim que o sistema representa ganho e perdido.
            </Dica>
          </Campo>
        )}

        {/* T4 do Bloco Tags: uma das tags cadastradas da rede. A "Remover tag"
            (de volta em 2026-11-18) usa o mesmo seletor. */}
        {(no.tipo === NODES.ACAO_TAG_CLIENTE || no.tipo === NODES.ACAO_REMOVER_TAG) && (
          <Campo rotulo="Tag">
            <select
              className="field" value={(c.tag as string) ?? ''}
              disabled={somenteLeitura}
              onChange={e => set({ tag: e.target.value })}
            >
              <option value="">Escolha a tag…</option>
              {(opcoes?.tags ?? []).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <Dica>{no.tipo === NODES.ACAO_REMOVER_TAG
              ? 'A tag é tirada do cliente. Se ele não a tem, o passo não faz nada.'
              : 'A tag é adicionada ao cliente. Para tirar, use o passo "Remover tag".'}</Dica>
          </Campo>
        )}

        {no.tipo === NODES.ACAO_ATRIBUIR && (
          <Campo rotulo="Responsável">
            <select
              className="field" value={(c.usuarioId as string) ?? ''}
              disabled={somenteLeitura}
              onChange={e => {
                const op = opcoes?.pessoas.find(x => x.id === e.target.value)
                set({ usuarioId: e.target.value || null, usuarioNome: op?.nome ?? null })
              }}
            >
              <option value="">Tirar o responsável</option>
              {(opcoes?.pessoas ?? []).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Campo>
        )}

        {no.tipo === NODES.GATILHO_AGENDA && (
          <>
            <Campo rotulo="Com que frequência">
              <select
                className="field" value={(c.frequencia as string) ?? 'diaria'}
                disabled={somenteLeitura}
                onChange={e => {
                  const f = e.target.value
                  const porIntervalo = f === 'minutos' || f === 'horas'
                  // Cada família tem o seu campo, e o da outra é apagado: um
                  // `hora: '09:00'` esquecido numa automação "a cada 30
                  // minutos" ficaria no JSON parecendo que ela respeita um
                  // horário que ninguém lê.
                  set({
                    frequencia: f,
                    hora:      porIntervalo ? undefined : (c.hora as string) ?? '09:00',
                    intervalo: porIntervalo
                      ? Number(c.intervalo ?? 0) || (f === 'minutos' ? 30 : 1)
                      : undefined,
                  })
                }}
              >
                <option value="minutos">A cada X minutos</option>
                <option value="horas">A cada X horas</option>
                <option value="diaria">Todo dia</option>
                <option value="semanal">Toda semana</option>
                <option value="mensal">Todo mês</option>
              </select>
            </Campo>

            {porIntervalo && (
              <Campo rotulo={c.frequencia === 'horas' ? 'A cada (horas)' : 'A cada (minutos)'}>
                <input
                  type="number"
                  min={c.frequencia === 'horas' ? 1 : INTERVALO_MINIMO_MIN}
                  step={c.frequencia === 'horas' ? 1 : INTERVALO_MINIMO_MIN}
                  className="field"
                  value={String(c.intervalo ?? '')}
                  disabled={somenteLeitura}
                  onChange={e => set({ intervalo: e.target.value ? Number(e.target.value) : undefined })}
                />
                <Dica>
                  A conta é a partir do último disparo, não do relógio: ligar às
                  9:07 com &quot;a cada 30 minutos&quot; dá 9:37, 10:07…{' '}
                  {c.frequencia === 'minutos' && (
                    <>O mínimo é {INTERVALO_MINIMO_MIN} minutos, que é de quanto
                    em quanto o relógio do sistema passa.</>
                  )}
                </Dica>
              </Campo>
            )}

            {c.frequencia === 'semanal' && (
              <Campo rotulo="No dia">
                <select
                  className="field" value={String(c.diaDaSemana ?? 1)}
                  disabled={somenteLeitura}
                  onChange={e => set({ diaDaSemana: Number(e.target.value) })}
                >
                  {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
                    .map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </Campo>
            )}

            {c.frequencia === 'mensal' && (
              <Campo rotulo="No dia do mês">
                {/* De 1 a 31 (princípios 2 e 3; decisão do Claude, 25/11): ia só
                    até 28. No mês sem o dia, o motor não dispara — e a dica diz. */}
                <input
                  type="number" min={1} max={31} step={1} className="field"
                  value={String(c.diaDoMes ?? 1)}
                  disabled={somenteLeitura}
                  onChange={e => set({ diaDoMes: Number(e.target.value) })}
                />
                {recusaDoDiaDoMes(c.diaDoMes ?? 1)
                  ? <Dica>{recusaDoDiaDoMes(c.diaDoMes ?? 1)}</Dica>
                  : dicaDoDiaDoMes(Number(c.diaDoMes ?? 1)) && <Dica>{dicaDoDiaDoMes(Number(c.diaDoMes ?? 1))}</Dica>}
              </Campo>
            )}

            {!porIntervalo && (
              <Campo rotulo="Às">
                <input
                  type="time" className="field" value={(c.hora as string) ?? '09:00'}
                  disabled={somenteLeitura}
                  onChange={e => set({ hora: e.target.value })}
                />
                <Dica>
                  {/* A7 da 13ª: em que relógio (o da rede, o do cron — F62). */}
                  <RelogioDaRede embutido />{' '}
                  O relógio roda de cinco em cinco minutos, então o disparo
                  acontece na primeira passagem depois do horário.
                </Dica>
              </Campo>
            )}
          </>
        )}

        {no.tipo === NODES.BUSCAR_CLIENTES && (
          <>
            <Campo rotulo="Sem retorno há (dias)">
              <input
                type="number" min={1} className="field"
                value={String(c.semRetornoHaDias ?? '')}
                disabled={somenteLeitura}
                onChange={e => set({ semRetornoHaDias: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="deixe vazio para não filtrar"
              />
            </Campo>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox" checked={!!c.aniversarioHoje}
                disabled={somenteLeitura}
                onChange={e => set({ aniversarioHoje: e.target.checked })}
                style={{ accentColor: 'var(--brand)', width: 15, height: 15 }}
              />
              <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-soft)' }}>
                Só quem faz aniversário hoje
              </span>
            </label>
            {!!c.aniversarioHoje && (
              <Dica>O dia e o mês da data de nascimento da ficha, no relógio da rede.</Dica>
            )}
            <Campo rotulo="Pacote vence daqui a (dias)">
              <input
                type="number" min={1} className="field"
                value={String(c.pacoteVenceEmDias ?? '')}
                disabled={somenteLeitura}
                onChange={e => set({ pacoteVenceEmDias: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="deixe vazio para não filtrar"
              />
              <Dica>
                Quem tem um pacote, não cancelado, que vence exatamente nesse
                dia (no relógio da rede).
              </Dica>
            </Campo>
            <TagsDaBusca
              marcadas={Array.isArray(c.tags) ? (c.tags as string[]) : []}
              somenteLeitura={somenteLeitura}
              onChange={tags => set({ tags: tags.length > 0 ? tags : undefined })}
            />
            <Campo rotulo="No máximo">
              {/* Vale o número gravado (princípios 2 e 3; o Heitor, 25/11: "Se não
                  for impossível, ainda que improvável, pode ser feito."): o
                  teto de 500 era só do HTML, e a prévia e o motor cortavam calados. */}
              <input
                type="number" min={1} step={1} className="field"
                value={String(c.limite ?? LIMITE_PADRAO_DA_BUSCA)}
                disabled={somenteLeitura}
                onChange={e => set({ limite: Number(e.target.value) })}
              />
              <AvisoDoLimite valor={c.limite} />
              <Dica>
                Cada cliente encontrado vira uma execução própria. O teto é a
                diferença entre a campanha que você quis e um disparo em massa
                que ninguém revisou.
              </Dica>
            </Campo>
            <QuemAchariaHoje cfg={c} />
          </>
        )}

        {no.tipo === NODES.ESPERA_DURACAO && (
          <Campo rotulo="Esperar">
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number" min={1} className="field" style={{ width: 90 }}
                value={String(c.quantidade ?? 1)}
                disabled={somenteLeitura}
                onChange={e => set({ quantidade: Number(e.target.value) })}
              />
              <select
                className="field" value={(c.unidade as string) ?? 'dias'}
                disabled={somenteLeitura}
                onChange={e => set({ unidade: e.target.value })}
              >
                <option value="minutos">minutos</option>
                <option value="horas">horas</option>
                <option value="dias">dias</option>
              </select>
            </div>
            <Dica>
              A espera não segura nada rodando: o fluxo fica guardado e volta
              sozinho, mesmo que o sistema reinicie no meio.
            </Dica>
          </Campo>
        )}

        {no.tipo === NODES.ESPERA_ATE && (
          <>
            <Campo rotulo="Esperar até a data em">
              {/* Contextual como o resto: a data que interessa muitas vezes é a
                  que veio no próprio gatilho (`evento.dados.agendadoPara`), e
                  antes a lista tinha duas opções fixas que não a incluíam. */}
              <SelectDeCampo
                valor={(c.campo as string) ?? ''}
                grupos={variaveis}
                onChange={v => set({ campo: v })}
                somenteLeitura={somenteLeitura}
              />
            </Campo>
            <Campo rotulo="Com deslocamento">
              {/* A27 da 30ª (princípios 1 e 2: o prazo é da rede): era uma lista
                  fixa (2 dias, 1 dia, 3 h, 1 h…), sem "6 horas antes". Zero é
                  "no momento exato". */}
              <DeslocamentoDaEspera
                minutos={Number(c.minutos ?? -1440)}
                somenteLeitura={somenteLeitura}
                onChange={minutos => set({ minutos })}
              />
              {/* A11 da 14ª: o motor segue na hora quando o momento já passou
                  (quandoChegarEm, lib/automacoes/tempo.ts), e a tela não dizia —
                  o lembrete de "1 dia antes" do agendamento marcado para hoje. */}
              <Dica>{dicaDaEsperaAte(Number(c.minutos ?? -1440))}</Dica>
            </Campo>
          </>
        )}

        {NODES_SEM_EDITOR.includes(no.tipo as TipoDeNo) && (
          <div className="card-sm" style={{ background: 'var(--bg-app)' }}>
            {/* O estado fica à vista; o "e enquanto isso" mora na dica (2026-11-16). */}
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Este node já existe no fluxo, mas ainda não roda.</span>
              <DicaDoTexto rotulo="O que acontece com este passo">
                Ele chega numa próxima entrega. Enquanto isso, uma automação que passe por ele
                para com o motivo registrado, em vez de seguir fingindo que a ação
                aconteceu.
              </DicaDoTexto>
            </p>
          </div>
        )}
      </div>

      {!somenteLeitura && (
        // `auto-rodape` afasta do botão flutuante do app, que no celular fica
        // no canto de baixo à esquerda — bem em cima deste botão.
        <div className="auto-rodape" style={{ padding: 16, borderTop: '1px solid var(--hairline)' }}>
          <button
            type="button" onClick={onExcluir} className="btn-ghost"
            style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs-sz)' }}
          >
            <Trash2 size={14} /> Remover do fluxo
          </button>
        </div>
      )}
    </aside>
  )
}

/** Os que estão no catálogo e no quadro, mas ainda sem executor. */
// Todos os tipos do catálogo têm editor e executor. A lista fica aqui,
// vazia, porque é ela que o painel consulta — e um tipo novo sem editor
// precisa aparecer explicitamente, não sumir num `else` silencioso.
const NODES_SEM_EDITOR: TipoDeNo[] = []

// ─── Peças ──────────────────────────────────────────────────────────────────

/**
 * Rótulo + controle.
 *
 * `<label>` de verdade, e não um `<p>` por cima: clicar no rótulo passa a focar
 * o campo, e cada controle deste painel passa a ter nome — que é o que permite
 * procurá-lo por "Título" em vez de "o terceiro input", tanto para quem usa
 * leitor de tela quanto para o teste.
 */
/**
 * A escolha da etapa de destino.
 *
 * Com mais de um funil na rede, uma lista única de "Funil · Etapa" cresce pelo
 * produto das duas coisas e obriga a ler o prefixo de cada linha para achar o
 * funil certo. Então o funil vira o primeiro passo da escolha e a lista de
 * etapas passa a ser a dele. Com um funil só o seletor não aparece: seria uma
 * escolha de uma opção.
 *
 * **O funil não é gravado como destino** — quem manda é o `etapaId`, e a etapa
 * já pertence a um funil. Ele é só o caminho até ela, e por isso nasce
 * derivado da etapa que já estava escolhida, sem campo novo no grafo.
 */
function MoverDeEtapa({ config, opcoes, set, somenteLeitura }: {
  config:  Record<string, unknown>
  opcoes:  OpcoesDoEditor | null
  set:     (patch: Record<string, unknown>) => void
  somenteLeitura?: boolean
}) {
  const etapas    = opcoes?.etapas ?? []
  const escolhida = etapas.find(e => e.id === ((config.etapaId as string) ?? ''))

  // Só o funil TROCADO À MÃO vira estado; o resto se deriva da etapa gravada.
  // Um `useState` inicializado de uma vez nasceria vazio, porque as opções
  // chegam depois do primeiro render e a etapa ainda não teria funil conhecido.
  const [funilTrocado, setFunilTrocado] = useState<string | null>(null)

  // Funil arquivado some da lista, menos quando é o destino que já está
  // gravado: aí esconder o funil apagaria da tela para onde a automação move.
  const funis  = (opcoes?.funis ?? []).filter(f => !f.arquivado || f.id === escolhida?.funilId)
  const varios = funis.length > 1
  const funilId = funilTrocado ?? escolhida?.funilId ?? ''

  // Com um funil só (ou nenhum, em rede cujas etapas nasceram antes dos funis)
  // a lista não é filtrada: todas as etapas são dele.
  const daEtapa = varios ? etapas.filter(e => e.funilId === funilId) : etapas

  const escolher = (id: string) => {
    const op = etapas.find(x => x.id === id)
    // Os nomes vão junto só para o card do quadro dizer "para Fechamento" sem
    // consultar nada. Quem manda é o id. O nome do funil só entra quando há
    // mais de um — senão o card repetiria em toda automação a mesma palavra.
    set({
      etapaId:   id,
      etapaNome: op?.nome ?? null,
      funilNome: varios ? op?.funil ?? null : null,
    })
  }

  return (
    <>
      {varios && (
        <Campo rotulo="Funil">
          <select
            className="field" value={funilId}
            disabled={somenteLeitura}
            onChange={e => {
              setFunilTrocado(e.target.value)
              // Trocar de funil zera a etapa: a que estava escolhida é de
              // outro funil, e deixá-la gravada faria o seletor mostrar vazio
              // enquanto a automação continuava movendo para o lugar antigo.
              escolher('')
            }}
          >
            <option value="">Escolha o funil…</option>
            {funis.map(f => (
              <option key={f.id} value={f.id}>
                {f.nome}{f.arquivado ? ' (arquivado)' : ''}
              </option>
            ))}
          </select>
        </Campo>
      )}

      <Campo rotulo="Mover para">
        <select
          className="field" value={(config.etapaId as string) ?? ''}
          disabled={somenteLeitura || (varios && !funilId)}
          onChange={e => escolher(e.target.value)}
        >
          <option value="">
            {varios && !funilId ? 'Escolha o funil primeiro…' : 'Escolha a etapa…'}
          </option>
          {daEtapa.map(e => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>
      </Campo>
    </>
  )
}

/** O que o "Abrir pelo número padrão" faz com o número padrão desta rede (R10). */
function textoDoAbrirPeloPadrao(padrao: OpcoesDoEditor['numeroPadrao']): string {
  // A18 da 38ª: curto — por onde abre, e o risco que a rede escolhe correr (AX-06).
  if (!padrao) return 'A rede não tem número padrão de WhatsApp (Configurações → Integrações).'
  if (padrao.oficial) return `Abre pelo número ${padrao.label} (API oficial), com o modelo aprovado.`
  return `Abre pelo número ${padrao.label} (WhatsApp Web). Risco de o WhatsApp banir o número.`
}

/**
 * O modelo (template) aprovado do passo e o valor de cada variável dele, com
 * as variáveis da automação (R10 — o Heitor, 26/11: "construir (com os
 * modelos aprovados pela Meta na automação)").
 */
function ModeloDoPasso({
  config: c, set, somenteLeitura, modelos, grupos, exigido,
}: {
  config: Record<string, unknown>
  set: (patch: Record<string, unknown>) => void
  somenteLeitura?: boolean
  modelos: OpcoesDoEditor['modelosDoPadrao']
  grupos: GrupoDeVariaveis[]
  exigido: boolean
}) {
  const escolhido = modelos.find(m => m.id === c.templateId) ?? null
  const valores = (c.variaveisDoTemplate as Record<string, string> | undefined) ?? {}
  return (
    <div data-modelo-do-passo style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Campo rotulo={exigido ? 'Modelo aprovado pela Meta' : 'Modelo aprovado pela Meta (fora das 24 horas)'}>
        <select
          className="field" value={(c.templateId as string) ?? ''}
          disabled={somenteLeitura}
          onChange={e => {
            const novo = modelos.find(m => m.id === e.target.value)
            if (!novo) { set({ templateId: undefined, variaveisDoTemplate: undefined }); return }
            // Fica o valor já escrito da variável de mesmo nome; o nome da cliente se sugere.
            const proximos: Record<string, string> = {}
            for (const v of novo.variaveis) {
              proximos[v] = valores[v] ?? (['nome', 'nome_cliente', 'cliente'].includes(v) ? '{{cliente.nome}}' : '')
            }
            set({ templateId: novo.id, variaveisDoTemplate: proximos })
          }}
        >
          <option value="">{exigido ? 'Escolha o modelo…' : 'Nenhum: fora das 24 horas, não manda'}</option>
          {modelos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          {!!c.templateId && !escolhido && (
            <option value={c.templateId as string}>Modelo que não está mais aprovado</option>
          )}
        </select>
      </Campo>
      {modelos.length === 0 && (
        <Dica>A conta do número padrão não tem modelo aprovado pela Meta. Crie um na tela de Templates.</Dica>
      )}
      {escolhido && (
        <>
          <p style={{
            margin: 0, padding: '8px 10px', whiteSpace: 'pre-wrap',
            fontSize: 'var(--text-2xs)', color: 'var(--text-soft)', lineHeight: 1.5,
            background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 'var(--radius-field-token)',
          }}>
            {escolhido.texto}
          </p>
          {escolhido.variaveis.map(v => (
            <Campo key={v} rotulo={`{{${v}}}`}>
              <TextoComVariaveis
                valor={valores[v] ?? ''}
                grupos={grupos}
                onChange={novo => set({ variaveisDoTemplate: { ...valores, [v]: novo } })}
                linhas={1}
                somenteLeitura={somenteLeitura}
                placeholder="{{cliente.nome}}"
              />
            </Campo>
          ))}
        </>
      )}
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'block',
        fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-soft)',
        marginBottom: 5,
      }}>
        {rotulo}
      </span>
      {children}
    </label>
  )
}

/**
 * O deslocamento do "Esperar até": quanto, em que unidade, antes ou depois (A27
 * da 30ª: o prazo é da rede — era uma lista fixa, sem "6 horas antes"). Zero
 * é "no momento exato". A unidade escolhida fica enquanto dividir os minutos.
 */
function DeslocamentoDaEspera({ minutos, somenteLeitura, onChange }: {
  minutos: number; somenteLeitura?: boolean; onChange: (minutos: number) => void
}) {
  const [unidade, setUnidade] = useState<PartesDoDeslocamento['unidade'] | undefined>(undefined)
  const p = partesDoDeslocamento(minutos, unidade)
  const mudar = (patch: Partial<PartesDoDeslocamento>) => {
    if (patch.unidade) setUnidade(patch.unidade)
    onChange(minutosDoDeslocamento({ ...p, ...patch }))
  }
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input
        type="number" min={0} className="field" style={{ width: 80 }}
        aria-label="Quanto"
        value={String(p.quantidade)}
        disabled={somenteLeitura}
        onChange={e => mudar({ quantidade: Number(e.target.value) })}
      />
      <select className="field" aria-label="Unidade do deslocamento" value={p.unidade}
        disabled={somenteLeitura} onChange={e => mudar({ unidade: e.target.value as PartesDoDeslocamento['unidade'] })}>
        <option value="minutos">minutos</option>
        <option value="horas">horas</option>
        <option value="dias">dias</option>
      </select>
      <select className="field" aria-label="Antes ou depois" value={p.sentido}
        disabled={somenteLeitura || p.quantidade === 0} onChange={e => mudar({ sentido: e.target.value as PartesDoDeslocamento['sentido'] })}>
        <option value="antes">antes</option>
        <option value="depois">depois</option>
      </select>
    </div>
  )
}

/** O que a espera "até a data" faz quando o momento já passou — dito em português. */
function dicaDaEsperaAte(minutos: number): string {
  const seguir = 'Se o momento já passou quando o fluxo chega aqui, ele segue sem esperar.'
  if (!(minutos < 0)) return seguir
  const m = Math.abs(minutos)
  const [n, um, varios] = m % 1440 === 0 ? [m / 1440, 'dia', 'dias']
    : m % 60 === 0 ? [m / 60, 'hora', 'horas'] : [m, 'minuto', 'minutos']
  return `Marcado com menos de ${n} ${n === 1 ? um : varios} de antecedência: sai na hora. ${seguir}`
}

function Dica({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.5 }}>
      {children}
    </p>
  )
}

/** Valor do item que abre o campo escrito à mão. */
const OUTRO = '__outro__'

/**
 * A escolha do campo a comparar.
 *
 * A lista é montada a partir de onde o node está no grafo: o payload do evento
 * que dispara, as entidades e o que cada passo anterior deixou. O exemplo ao
 * lado vem do último fato real — é ele que dá a certeza de estar pegando o
 * campo certo antes de a automação rodar.
 *
 * **"Outro campo…"** existe porque nenhuma lista cobre tudo: `dados` aceita
 * campo que ninguém declarou, e sem esta saída a automação ficaria bloqueada
 * esperando alguém mexer no código. Continua sendo um CAMINHO, não expressão —
 * quem monta isto é a recepção da clínica.
 */
function SelectDeCampo({
  valor, grupos, onChange, somenteLeitura, rotulo,
}: {
  valor:   string
  grupos:  GrupoDeVariaveis[]
  onChange: (v: string) => void
  somenteLeitura?: boolean
  /** O nome acessível do seletor ("Campo da regra 1"). */
  rotulo?: string
}) {
  // A14: "Situação" ×3 e "Procedimento" ×2 na mesma lista — o repetido leva de onde vem.
  const rotulos = useMemo(() => rotulosUnicos(grupos), [grupos])
  const naLista = grupos.some(g => g.itens.some(i => i.caminho === valor))
  // Campo escrito à mão (ou herdado de um grafo antigo) abre já no modo livre:
  // cair na lista mostraria "Escolha o campo…" com um valor salvo por baixo.
  const [livre, setLivre] = useState(!!valor && !naLista)

  if (livre) {
    // Conferida enquanto se digita: no motor, expressão quebrada devolve vazio
    // em silêncio — o erro tem de aparecer aqui, onde dá para consertar.
    const erro = valor.trim() && !ehCaminhoSimples(valor) ? conferirExpressao(valor) : null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <input
          className="field" value={valor} disabled={somenteLeitura}
          aria-label={rotulo}
          onChange={e => onChange(e.target.value)}
          placeholder="evento.dados.algumCampo"
          // O mesmo vermelho da lista de problemas do editor: um terceiro tom
          // de erro na mesma tela seria ruído.
          style={erro ? { borderColor: 'var(--danger)' } : undefined}
        />
        {erro && (
          <p style={{ fontSize: 'var(--text-overline)', color: 'var(--danger)', lineHeight: 1.5 }}>{erro}</p>
        )}
        <Dica>
          Um caminho (<code>evento.dados.texto</code>) ou uma expressão:{' '}
          <code>{"contem(evento.dados.texto, 'preço')"}</code>,{' '}
          <code>{"cliente.email ?? 'sem e-mail'"}</code>.{' '}
          Funções: {NOMES_DE_FUNCAO.join(', ')}.
        </Dica>
        {!somenteLeitura && (
          <button
            type="button" className="btn-ghost"
            style={{ alignSelf: 'flex-start', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}
            onClick={() => { setLivre(false); onChange('') }}
          >
            Voltar para a lista
          </button>
        )}
      </div>
    )
  }

  return (
    <select
      className="field" value={valor} disabled={somenteLeitura}
      aria-label={rotulo}
      onChange={e => {
        if (e.target.value === OUTRO) { setLivre(true); return }
        onChange(e.target.value)
      }}
    >
      <option value="">Escolha o campo…</option>
      {grupos.map(g => (
        <optgroup key={g.grupo} label={g.rotulo ?? g.grupo}>
          {g.itens.map(i => (
            <option key={i.caminho} value={i.caminho}>
              {i.exemplo ? `${rotulos.get(i.caminho) ?? i.rotulo} — ${i.exemplo}` : (rotulos.get(i.caminho) ?? i.rotulo)}
            </option>
          ))}
        </optgroup>
      ))}
      <option value={OUTRO}>Outro campo ou expressão…</option>
    </select>
  )
}

/**
 * Um texto que aceita variáveis, com a lista ao lado.
 *
 * Sem isto, usar uma variável exigia decorar o caminho e digitar as chaves
 * duplas na mão — e um `{{cliete.nome}}` com erro de digitação vira string
 * vazia na mensagem do cliente, sem nada avisar. Aqui a variável é escolhida e
 * escrita na posição do cursor.
 */
function TextoComVariaveis({
  valor, grupos, onChange, linhas, placeholder, somenteLeitura,
}: {
  valor:  string
  grupos: GrupoDeVariaveis[]
  onChange: (v: string) => void
  linhas?: number
  placeholder?: string
  somenteLeitura?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  function inserir(caminho: string) {
    if (!caminho) return
    const trecho = `{{${caminho}}}`
    const campo = ref.current
    // Sem o campo montado (ou sem cursor), vai para o fim: melhor um texto
    // para ajeitar do que um clique que não faz nada.
    const corte = campo?.selectionStart ?? valor.length
    const fim   = campo?.selectionEnd   ?? valor.length
    const novo  = `${valor.slice(0, corte)}${trecho}${valor.slice(fim)}`
    onChange(novo)
    requestAnimationFrame(() => {
      if (!campo) return
      campo.focus()
      const posicao = corte + trecho.length
      campo.setSelectionRange(posicao, posicao)
    })
  }

  return (
    <>
      <textarea
        ref={ref}
        className="field" rows={linhas ?? 3} value={valor}
        disabled={somenteLeitura}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {!somenteLeitura && (
        <select
          className="field"
          style={{ marginTop: 6, fontSize: 'var(--text-2xs)' }}
          value=""
          onChange={e => { inserir(e.target.value); e.target.value = '' }}
        >
          <option value="">Inserir variável…</option>
          {grupos.map(g => (
            <optgroup key={g.grupo} label={g.rotulo ?? g.grupo}>
              {g.itens.map(i => (
                <option key={i.caminho} value={i.caminho}>
                  {i.exemplo ? `${i.rotulo} — ${i.exemplo}` : i.rotulo}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
    </>
  )
}

function EditorDeGrupo({
  grupo, variaveis, onChange, somenteLeitura, procedimentos = [], etapas = [],
}: {
  grupo: GrupoDeCondicao
  variaveis: GrupoDeVariaveis[]
  /** Os procedimentos da rede: o valor de uma regra de procedimento sai daqui (A14). */
  procedimentos?: string[]
  /** As etapas dos funis da rede: o valor de uma regra de etapa sai daqui (A27 da 32ª). */
  etapas?: { nome: string; funil: string }[]
  onChange: (g: GrupoDeCondicao) => void
  somenteLeitura?: boolean
}) {
  const regras = grupo.regras ?? []

  const mudarRegra = (i: number, patch: Partial<RegraDeCondicao>) => {
    onChange({ ...grupo, regras: regras.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Campo rotulo="Quando">
        <select
          className="field" value={grupo.juncao} disabled={somenteLeitura}
          onChange={e => onChange({ ...grupo, juncao: e.target.value as 'e' | 'ou' })}
        >
          <option value="e">Todas as regras abaixo</option>
          <option value="ou">Qualquer uma das regras</option>
        </select>
      </Campo>

      {regras.map((r, i) => {
        const op = OPERADORES.find(o => o.valor === r.operador)
        return (
          <div key={i} className="card-sm" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <SelectDeCampo
              valor={r.campo} grupos={variaveis} somenteLeitura={somenteLeitura}
              rotulo={`Campo da regra ${i + 1}`}
              onChange={v => mudarRegra(i, { campo: v })}
            />
            <select
              className="field" value={r.operador} disabled={somenteLeitura}
              onChange={e => mudarRegra(i, { operador: e.target.value as OperadorDeCondicao })}
            >
              {OPERADORES.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
            {!op?.semValor && ehSituacaoDoAgendamento(r.campo) && ['em', 'nao_em'].includes(r.operador) ? (
              // A18 da 11ª: a situação pelo nome ("Cancelado"), não o código
              // (o campo dizia "CANCELLED,NO_SHOW,COMPLETED").
              <div role="group" aria-label={`Valores da regra ${i + 1}`} data-situacoes-da-regra style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SITUACOES_DO_AGENDAMENTO.map(s => {
                  const lista = Array.isArray(r.valor) ? (r.valor as string[]) : []
                  const marcado = lista.includes(s.valor)
                  return (
                    <button key={s.valor} type="button" className="chip-filtro" aria-pressed={marcado} disabled={somenteLeitura}
                      onClick={() => mudarRegra(i, { valor: marcado ? lista.filter(v => v !== s.valor) : [...lista, s.valor] })}>
                      {s.rotulo}
                    </button>
                  )
                })}
              </div>
            ) : !op?.semValor && ehSituacaoDoAgendamento(r.campo) && ['igual', 'diferente'].includes(r.operador) ? (
              <select
                className="field" value={String(r.valor ?? '')} disabled={somenteLeitura}
                aria-label={`Valor da regra ${i + 1}`}
                onChange={e => mudarRegra(i, { valor: e.target.value })}
              >
                <option value="">Escolha a situação…</option>
                {SITUACOES_DO_AGENDAMENTO.map(s => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
              </select>
            ) : !op?.semValor && ehDesfechoDaEtapa(r.campo) && ['igual', 'diferente'].includes(r.operador) ? (
              // A27 da 32ª: "Aberta, Ganha, Perdida" — o campo dizia
              // "(OPEN, WON, LOST)". O valor gravado é o código que o motor compara.
              <select
                className="field" value={String(r.valor ?? '')} disabled={somenteLeitura}
                aria-label={`Valor da regra ${i + 1}`}
                onChange={e => mudarRegra(i, { valor: e.target.value })}
              >
                <option value="">Escolha o desfecho…</option>
                {DESFECHOS_DA_ETAPA.map(d => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
              </select>
            ) : !op?.semValor && CAMPOS_DE_ETAPA.has(r.campo) && ['igual', 'diferente'].includes(r.operador) ? (
              // A27 da 32ª: a etapa era texto livre (o nome exato). Sai da lista
              // dos funis da rede; o valor gravado é o nome, o que o motor
              // compara. O salvo que não está mais na lista continua visível.
              <select
                className="field" value={String(r.valor ?? '')} disabled={somenteLeitura}
                aria-label={`Valor da regra ${i + 1}`}
                onChange={e => mudarRegra(i, { valor: e.target.value })}
              >
                <option value="">Escolha a etapa…</option>
                {r.valor && !etapas.some(e => e.nome === String(r.valor)) && (
                  <option value={String(r.valor)}>{String(r.valor)} (fora da lista)</option>
                )}
                {[...new Set(etapas.map(e => e.funil))].map(funil => (
                  <optgroup key={funil} label={funil}>
                    {etapas.filter(e => e.funil === funil).map(e => (
                      <option key={`${funil}:${e.nome}`} value={e.nome}>{e.nome}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            ) : !op?.semValor && (CAMPOS_DE_PROCEDIMENTO.has(r.campo) && ['igual', 'diferente'].includes(r.operador) ? (
              // A14: o procedimento era texto livre — "botox" não casava com
              // "Botox". O nome sai da lista da clínica; o salvo que não está
              // mais nela (renomeado, desativado) continua visível.
              <select
                className="field" value={String(r.valor ?? '')} disabled={somenteLeitura}
                aria-label={`Valor da regra ${i + 1}`}
                onChange={e => mudarRegra(i, { valor: e.target.value })}
              >
                <option value="">Escolha o procedimento…</option>
                {r.valor && !procedimentos.includes(String(r.valor)) && (
                  <option value={String(r.valor)}>{String(r.valor)} (fora da lista)</option>
                )}
                {procedimentos.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : (
              <input
                className="field" value={String(r.valor ?? '')} disabled={somenteLeitura}
                aria-label={`Valor da regra ${i + 1}`}
                onChange={e => mudarRegra(i, { valor: e.target.value })}
                placeholder="valor"
              />
            ))}
            {!somenteLeitura && (
              <button
                type="button" className="btn-ghost"
                style={{ alignSelf: 'flex-start', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}
                onClick={() => onChange({ ...grupo, regras: regras.filter((_, j) => j !== i) })}
              >
                Remover regra
              </button>
            )}
          </div>
        )
      })}

      {!somenteLeitura && (
        <button
          type="button" className="btn-secondary" style={{ fontSize: 'var(--text-xs-sz)' }}
          // Nasce com o primeiro campo do gatilho, não com `cliente.nome`
          // fixo: num fluxo de estoque não existe cliente nenhum, e a regra
          // apareceria perguntando por um campo que nunca terá valor.
          onClick={() => onChange({
            ...grupo,
            regras: [...regras, {
              campo: variaveis[0]?.itens[0]?.caminho ?? '',
              operador: 'preenchido',
            }],
          })}
        >
          + Adicionar regra
        </button>
      )}

      {regras.length === 0 && (
        <Dica>Sem nenhuma regra, a condição deixa tudo passar pelo caminho &quot;sim&quot;.</Dica>
      )}
    </div>
  )
}

function EditorDeCasos({
  casos, onChange, somenteLeitura,
}: {
  casos: { chave: string; valor: string }[]
  onChange: (c: { chave: string; valor: string }[]) => void
  somenteLeitura?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Campo rotulo="Caminhos">
        <Dica>
          Cada caso vira uma saída no quadro. O que não bater com nenhum sai
          pelo <strong>padrao</strong>.
        </Dica>
      </Campo>

      {casos.map((caso, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            className="field" value={caso.valor} disabled={somenteLeitura}
            placeholder="valor" style={{ flex: 1, minWidth: 0 }}
            onChange={e => onChange(casos.map((c, j) => (
              j === i
                // A chave da saída acompanha o valor: duas saídas com o mesmo
                // nome no quadro seriam indistinguíveis ao ligar.
                ? { valor: e.target.value, chave: chaveDeSaida(e.target.value, i) }
                : c
            )))}
          />
          {!somenteLeitura && (
            <button
              type="button" className="btn-ghost" aria-label="Remover caso"
              style={{ padding: 4, color: 'var(--text-muted)' }}
              onClick={() => onChange(casos.filter((_, j) => j !== i))}
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}

      {!somenteLeitura && (
        <button
          type="button" className="btn-secondary" style={{ fontSize: 'var(--text-xs-sz)' }}
          onClick={() => onChange([...casos, { valor: '', chave: chaveDeSaida('', casos.length) }])}
        >
          + Adicionar caso
        </button>
      )}
    </div>
  )
}

function chaveDeSaida(valor: string, i: number): string {
  const limpo = valor.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return limpo || `caso_${i + 1}`
}

function agruparEventos(): [string, string[]][] {
  const mapa = new Map<string, string[]>()
  for (const nome of Object.values(EVENTOS)) {
    const entidade = nome.split('.')[0]!
    mapa.set(entidade, [...(mapa.get(entidade) ?? []), nome])
  }
  return [...mapa.entries()]
}

/**
 * Ao lado do "No máximo": a recusa do impossível (zero, negativo, fracionário,
 * acima do registro) ou, acima de 500, o aviso de que o valor vale como está.
 */
function AvisoDoLimite({ valor }: { valor: unknown }) {
  const conferido = conferirLimiteDaBusca(valor)
  if ('recusa' in conferido) {
    return <span role="alert" style={{ fontSize: 'var(--text-2xs)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{conferido.recusa}</span>
  }
  const aviso = avisoDoLimiteDaBusca(valor)
  return aviso
    ? <span role="status" data-acima-do-comum="limite-da-busca" style={{ fontSize: 'var(--text-2xs)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)' }}>{aviso}</span>
    : null
}

/**
 * As tags do "Buscar clientes" (D4 da 40ª; TG-12, AX-12): o seletor das outras
 * telas que filtram (o do público da campanha), com a lista do FILTRO — as
 * ativas e as arquivadas que alguém tem (TG-14) — e a marcada que saiu dela,
 * para poder tirar. Com mais de uma, entra quem tem todas (E).
 */
function TagsDaBusca({ marcadas, somenteLeitura, onChange }: {
  marcadas: string[]; somenteLeitura?: boolean; onChange: (tags: string[]) => void
}) {
  const daRede = useTagsDaRede(true, 'filtro')
  // Um grupo, não um <label>: dentro do rótulo, o clique no texto acionaria o primeiro botão.
  return (
    <div data-tags-da-busca role="group" aria-label="Tags">
      <span style={{
        display: 'block',
        fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-soft)',
        marginBottom: 5,
      }}>
        {marcadas.length > 1 ? 'Tags (todas)' : 'Tags'}
      </span>
      {marcadas.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {marcadas.map(t => (
            <span key={t} className="chip-filtro is-ativo" style={{ cursor: 'default', paddingRight: 6 }}>
              {t}
              {!somenteLeitura && (
                <button type="button" aria-label={`Tirar a tag ${t}`} onClick={() => onChange(marcadas.filter(x => x !== t))}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: 'inherit', display: 'inline-flex' }}>
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      <TagPicker selecionadas={marcadas} disponiveis={opcoesDeTag(daRede ?? [], marcadas)} disabled={somenteLeitura} onChange={onChange} />
    </div>
  )
}

/**
 * "Hoje, a busca acharia N clientes" (A21 da 11ª simulação: a automação não
 * dizia quem receberia). A mesma busca do motor (`contarBuscaDeClientes`),
 * pedida 600 ms depois da última mudança do passo.
 */
function QuemAchariaHoje({ cfg }: { cfg: Record<string, unknown> }) {
  const chave = JSON.stringify({ d: cfg.semRetornoHaDias, a: cfg.aniversarioHoje, p: cfg.pacoteVenceEmDias, t: cfg.tags, l: cfg.limite })
  const [conta, setConta] = useState<{ chave: string; texto: string } | null>(null)
  useEffect(() => {
    let vivo = true
    const t = setTimeout(() => {
      contarBuscaDeClientes(cfg)
        .then(r => {
          if (!vivo) return
          const texto = 'error' in r
            ? r.error
            : r.quantas === 0 ? 'Hoje, a busca não acharia nenhuma cliente.'
              : `Hoje, a busca acharia ${r.quantas.toLocaleString('pt-BR')} ${r.quantas === 1 ? 'cliente' : 'clientes'}${r.truncado ? ' (o teto deste passo cortou o resto)' : ''}.`
          // A26 da 30ª: o aniversário vem da data de nascimento da ficha; quem não a tem nunca entra.
          const semNascimento = !('error' in r) && r.semNascimento
            ? ` ${r.semNascimento.toLocaleString('pt-BR')} ${r.semNascimento === 1 ? 'ficha ativa não tem' : 'fichas ativas não têm'} a data de nascimento e não ${r.semNascimento === 1 ? 'entra' : 'entram'}.`
            : ''
          setConta({ chave, texto: texto + semNascimento })
        })
        .catch(() => { /* sem a conta, o passo segue */ })
    }, 600)
    return () => { vivo = false; clearTimeout(t) }
    // `chave` resume o que a busca lê; o `cfg` muda de identidade a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])
  return (
    <p data-quem-acharia-hoje style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
      {conta?.chave === chave ? conta.texto : 'Contando quem a busca acharia hoje…'}
    </p>
  )
}

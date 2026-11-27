import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * A18 da 38ª: o painel do passo "Mandar mensagem" tinha parágrafos que
 * explicavam como o passo funciona (o Heitor, 26/11: "isso não é ser
 * intuitivo, é ser explicativo e não isso que eu quero. Ser intuitivo é
 * justamente o contrario, ser facil de usar mesmo sem muitas explicações.";
 * CLAUDE.md, princípio 7). A tela fica óbvia pela ordem e pelos nomes: o canal,
 * a mensagem, para quem não tem conversa aberta e o modelo aprovado. Fica o
 * que é estado (a rede sem WhatsApp, o número padrão que vai abrir a conversa
 * e o risco de banimento, que a regra manda dizer — automacoes.md, AX-06).
 */
const painel = fs.readFileSync(path.join(__dirname, '..', 'components/admin/automacoes/painel-do-no.tsx'), 'utf8')
const doPasso = painel.slice(painel.indexOf('no.tipo === NODES.ACAO_MENSAGEM && ('), painel.indexOf('no.tipo === NODES.ACAO_MOVER_ETAPA && ('))

describe('A18: o painel do "Mandar mensagem" sem parágrafo explicativo', () => {
  it('a mensagem vem logo depois do canal, antes de "Para quem não tem conversa aberta"', () => {
    const canal = doPasso.indexOf('<option value="push">')
    const mensagem = doPasso.indexOf('<Campo rotulo="Mensagem">')
    const semConversa = doPasso.indexOf('Para quem não tem conversa aberta')
    expect(canal).toBeGreaterThan(-1)
    expect(mensagem).toBeGreaterThan(canal)
    expect(semConversa).toBeGreaterThan(mensagem)
  })

  it('sem os parágrafos que explicam o passo', () => {
    for (const frase of [
      'A mensagem vai para a conversa aberta do cliente',
      'O aviso chega no celular da cliente',
      'não recebe nada, e a execução diz',
      'recebe o texto como aviso no celular (o app e os avisos do navegador)',
    ]) expect(doPasso, frase).not.toContain(frase)
    expect(painel).not.toContain('Cada variável do modelo recebe o que a automação conhece')
  })

  it('o "Abrir pelo número padrão" diz, curto, por onde abre e o risco', () => {
    const inicio = painel.indexOf('function textoDoAbrirPeloPadrao')
    const corpo = painel.slice(inicio, painel.indexOf('\n}\n', inicio))
    expect(corpo).toMatch(/risco/)
    // Cada frase cabe numa linha do painel: nada de parágrafo.
    for (const texto of corpo.match(/`[^`]*`|'[^']*'/g) ?? []) expect(texto.length, texto).toBeLessThanOrEqual(90)
  })
})

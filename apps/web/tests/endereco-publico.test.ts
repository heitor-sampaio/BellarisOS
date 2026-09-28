import { describe, it, expect } from 'vitest'
import { enderecoPublico } from '@/lib/whatsapp/endereco-publico'

/**
 * O servidor uazapi próprio da clínica: endereço público e em https, ou nada.
 * Sem a trava, quem tem `settings: MANAGE` apontava o servidor do app para a
 * rede interna dele — e a chamada levava o token da caixa (SSRF).
 */
describe('enderecoPublico', () => {
  it('aceita https com domínio público, inclusive com porta e caminho', () => {
    for (const url of [
      'https://bellarisos.uazapi.com',
      'https://api.minhaclinica.com.br:8443/uazapi',
      'https://fcservidor.com.br',          // começa com "fc", mas é domínio
      'https://8.8.8.8',
    ]) expect(enderecoPublico(url), url).toBe(true)
  })

  it('recusa o que não é https', () => {
    for (const url of ['http://bellarisos.uazapi.com', 'ftp://x.com', 'file:///etc/passwd', 'não é url'])
      expect(enderecoPublico(url), url).toBe(false)
  })

  it('recusa a rede interna: localhost, IPs privados, link-local e metadados de nuvem', () => {
    for (const url of [
      'https://localhost', 'https://api.localhost', 'https://servico.internal', 'https://impressora.local',
      'https://127.0.0.1', 'https://0.0.0.0', 'https://10.0.0.5', 'https://172.16.0.1', 'https://172.31.255.255',
      'https://192.168.0.171', 'https://169.254.169.254', 'https://100.64.0.1',
      'https://[::1]', 'https://[fd00::1]', 'https://[fe80::1]',
    ]) expect(enderecoPublico(url), url).toBe(false)
  })

  it('não confunde a vizinhança das faixas privadas com elas', () => {
    for (const url of ['https://172.15.0.1', 'https://172.32.0.1', 'https://192.169.0.1', 'https://11.0.0.1'])
      expect(enderecoPublico(url), url).toBe(true)
  })
})

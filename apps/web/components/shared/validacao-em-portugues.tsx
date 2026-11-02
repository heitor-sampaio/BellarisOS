'use client'

import { useEffect } from 'react'

/**
 * As mensagens da validação do navegador em português (2026-10-21). O
 * navegador escreve na língua DELE, não na da página: a simulação de um dia de
 * clínica viu "Please fill out this field" no cadastro. Um ouvinte só, na
 * página inteira: no `invalid`, a mensagem pelo motivo; ao mexer no campo, ela
 * sai (senão o campo ficaria inválido para sempre).
 */
type Campo = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

/**
 * O mínimo/máximo como se lê (A26 da 5ª simulação: "O mínimo é
 * 2026-11-01T10:40."): data e hora em dd/mm/aaaa às hh:mm, número com vírgula.
 */
export function limiteLegivel(tipo: string, valor: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(valor)
  if (m && (tipo === 'datetime-local' || tipo === 'date')) {
    const dia = `${m[3]}/${m[2]}/${m[1]}`
    return tipo === 'datetime-local' && m[4] ? `${dia} às ${m[4]}` : dia
  }
  return valor.replace('.', ',')
}

function mensagem(c: Campo): string {
  const v = c.validity
  if (v.valueMissing) {
    if (c instanceof HTMLSelectElement) return 'Escolha uma opção.'
    if (c instanceof HTMLInputElement && (c.type === 'checkbox' || c.type === 'radio')) return 'Marque esta opção para continuar.'
    return 'Preencha este campo.'
  }
  if (v.typeMismatch) {
    if (c instanceof HTMLInputElement && c.type === 'email') return 'Informe um e-mail válido.'
    if (c instanceof HTMLInputElement && c.type === 'url') return 'Informe um endereço válido (https://…).'
    return 'Valor inválido.'
  }
  if (v.tooShort && 'minLength' in c) return `Use pelo menos ${c.minLength} caracteres.`
  if (v.tooLong && 'maxLength' in c) return `Use no máximo ${c.maxLength} caracteres.`
  if (v.rangeUnderflow && c instanceof HTMLInputElement) {
    return c.type === 'datetime-local' || c.type === 'date' || c.type === 'time'
      ? `Escolha a partir de ${limiteLegivel(c.type, c.min)}.`
      : `O mínimo é ${limiteLegivel(c.type, c.min)}.`
  }
  if (v.rangeOverflow && c instanceof HTMLInputElement) {
    return c.type === 'datetime-local' || c.type === 'date' || c.type === 'time'
      ? `Escolha até ${limiteLegivel(c.type, c.max)}.`
      : `O máximo é ${limiteLegivel(c.type, c.max)}.`
  }
  if (v.stepMismatch || v.badInput) return 'Valor inválido.'
  if (v.patternMismatch) return c.title || 'Formato inválido.'
  return ''
}

export function ValidacaoEmPortugues() {
  useEffect(() => {
    const aoInvalidar = (e: Event) => {
      const c = e.target as Campo
      if (!c?.setCustomValidity || !c.validity) return
      if (c.validity.customError) return
      const texto = mensagem(c)
      if (texto) c.setCustomValidity(texto)
    }
    const aoMexer = (e: Event) => {
      const c = e.target as Campo
      if (c?.setCustomValidity) c.setCustomValidity('')
    }
    document.addEventListener('invalid', aoInvalidar, true)
    document.addEventListener('input', aoMexer, true)
    document.addEventListener('change', aoMexer, true)
    return () => {
      document.removeEventListener('invalid', aoInvalidar, true)
      document.removeEventListener('input', aoMexer, true)
      document.removeEventListener('change', aoMexer, true)
    }
  }, [])
  return null
}

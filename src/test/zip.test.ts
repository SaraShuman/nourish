import { describe, it, expect } from 'vitest'
import { isValidZip, normalizeZipInput } from '../lib/zip'

describe('isValidZip', () => {
  it('accepts exactly five digits', () => {
    expect(isValidZip('90401')).toBe(true)
    expect(isValidZip(' 10001 ')).toBe(true) // trimmed
  })

  it('rejects wrong lengths and non-digits', () => {
    expect(isValidZip('9040')).toBe(false)
    expect(isValidZip('904011')).toBe(false)
    expect(isValidZip('9040a')).toBe(false)
    expect(isValidZip('')).toBe(false)
    expect(isValidZip('abcde')).toBe(false)
  })
})

describe('normalizeZipInput', () => {
  it('keeps only digits and caps at five', () => {
    expect(normalizeZipInput('90401')).toBe('90401')
    expect(normalizeZipInput('9040123')).toBe('90401')
    expect(normalizeZipInput('9a0b4c0d1')).toBe('90401')
    expect(normalizeZipInput('90-401')).toBe('90401')
  })
})

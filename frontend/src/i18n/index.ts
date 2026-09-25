import { Fragment, ReactNode, createElement, useMemo } from 'react'
import { useLocaleStore } from '../store/useLocaleStore'
import { en, MessageKey } from './en'
import { el } from './el'
import { INTL_LOCALE, Locale } from './locales'

export * from './locales'
export type { MessageKey }

// A typed dictionary: a key missing from el.ts, or a typo'd key, fails `tsc`.

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { en, el }

export type Params = Record<string, string | number>

/** Keys with `_one` and `_other` forms, named without the suffix. */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer B}_one` ? (`${B}_other` extends MessageKey ? B : never) : never
}[MessageKey]

const interpolate = (template: string, params?: Params): string =>
  params
    ? template.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in params ? String(params[name]) : whole)
    : template

export const translate = (locale: Locale, key: MessageKey, params?: Params): string =>
  interpolate(DICTIONARIES[locale][key] ?? en[key], params)

const PLURAL_RULES: Record<Locale, Intl.PluralRules> = {
  en: new Intl.PluralRules(INTL_LOCALE.en),
  el: new Intl.PluralRules(INTL_LOCALE.el),
}

export const translatePlural = (
  locale: Locale, key: PluralKey, count: number, params?: Params
): string => {
  const form = PLURAL_RULES[locale].select(count) === 'one' ? 'one' : 'other'
  return translate(locale, `${key}_${form}` as MessageKey, { count, ...params })
}

/** A message with React nodes in its placeholders, keeping each language's word order. */
export const translateRich = (
  locale: Locale, key: MessageKey, nodes: Record<string, ReactNode>
): ReactNode =>
  createElement(Fragment, null,
    ...(DICTIONARIES[locale][key] ?? en[key]).split(/(\{\w+\})/).map((part, i) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1]
      return name && name in nodes ? createElement(Fragment, { key: i }, nodes[name]) : part
    })
  )

const DECIMALS = new Map<string, Intl.NumberFormat>()

/** A fixed-precision number in the reader's notation (7,5 in Greek), no grouping. */
export const formatDecimal = (locale: Locale, value: number, digits = 1): string => {
  const id = `${locale}:${digits}`
  let format = DECIMALS.get(id)
  if (!format) {
    format = new Intl.NumberFormat(INTL_LOCALE[locale], {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: false,
    })
    DECIMALS.set(id, format)
  }
  return format.format(value)
}

/** Translation for components; re-renders on a language switch. */
export const useT = () => {
  const locale = useLocaleStore(s => s.locale)
  return useMemo(() => ({
    locale,
    /** For toLocaleDateString and friends. */
    intl: INTL_LOCALE[locale],
    t: (key: MessageKey, params?: Params) => translate(locale, key, params),
    tn: (key: PluralKey, count: number, params?: Params) =>
      translatePlural(locale, key, count, params),
    tx: (key: MessageKey, nodes: Record<string, ReactNode>) => translateRich(locale, key, nodes),
    num: (value: number, digits = 1) => formatDecimal(locale, value, digits),
    /** Locale-aware uppercase (Greek drops accents when uppercased). */
    upper: (text: string) => text.toLocaleUpperCase(INTL_LOCALE[locale]),
  }), [locale])
}

/** Translation outside React; reads the language at call time and subscribes to nothing. */
export const t = (key: MessageKey, params?: Params): string =>
  translate(useLocaleStore.getState().locale, key, params)

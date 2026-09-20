import { Fragment, ReactNode, createElement, useMemo } from 'react'
import { useLocaleStore } from '../store/useLocaleStore'
import { en, MessageKey } from './en'
import { el } from './el'
import { INTL_LOCALE, Locale } from './locales'

export * from './locales'
export type { MessageKey }

// A typed dictionary rather than i18next. With two languages the library's
// runtime buys nothing, and this way a key missing from el.ts — or a typo'd
// key at a call site — fails `tsc` instead of rendering the key on a phone.

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { en, el }

export type Params = Record<string, string | number>

/**
 * Keys with both a `_one` and an `_other` form, named without the suffix.
 * English and Greek pluralise the same way (one / everything else), so two
 * forms cover both; Intl.PluralRules still picks, so a third language with
 * more forms would only need its own keys.
 */
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

/**
 * A message with React nodes in its placeholders — a bold email address, a
 * link. Splitting the sentence into "before" and "after" keys instead would
 * fix the English word order into the Greek, and Greek puts the object
 * somewhere else.
 */
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

/**
 * A fixed-precision number in the reader's notation — 7,5 in Greek. Grouping
 * is off so a value that printed "2500" before still does; only the decimal
 * separator changes.
 */
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

/**
 * Translation for components. Subscribes to the language, so a switch in
 * Profile re-renders every screen that called it.
 */
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
    /**
     * Uppercase for an eyebrow label. Locale-aware because Greek drops the
     * accent when uppercased — ΤΡΙ, not ΤΡΊ — and a plain toUpperCase() keeps
     * it, which reads as a typo to a Greek reader.
     */
    upper: (text: string) => text.toLocaleUpperCase(INTL_LOCALE[locale]),
  }), [locale])
}

/**
 * Translation outside React — stores, plain helpers. Reads the language at
 * call time and subscribes to nothing: whatever renders the result must use
 * `useT` itself, or it will keep the old language until something else
 * re-renders it.
 */
export const t = (key: MessageKey, params?: Params): string =>
  translate(useLocaleStore.getState().locale, key, params)

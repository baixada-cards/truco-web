'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'

import { LOCALE_OPTIONS, type AppLocale } from '../../i18n/locales'
import { Link, usePathname } from '../../i18n/navigation'

import './LanguagePicker.css'

export function LanguagePicker({
  variant = 'settings',
}: {
  variant?: 'guide' | 'launcher' | 'settings'
}) {
  const locale = useLocale() as AppLocale
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('Language')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const query = useMemo(() => Object.fromEntries(searchParams.entries()), [searchParams])
  const currentOption = LOCALE_OPTIONS.find((option) => option.locale === locale) ?? LOCALE_OPTIONS[0]
  const menuId = `language-picker-${variant}-menu`
  const closeAndFocusTrigger = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])
  const focusMenuItem = useCallback((index: number) => {
    window.requestAnimationFrame(() => {
      itemRefs.current[index]?.focus()
    })
  }, [])

  useEffect(() => {
    if (!open) return undefined

    function onDocumentMouseDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function onDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        closeAndFocusTrigger()
      }
    }

    document.addEventListener('mousedown', onDocumentMouseDown)
    document.addEventListener('keydown', onDocumentKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown)
      document.removeEventListener('keydown', onDocumentKeyDown)
    }
  }, [closeAndFocusTrigger, open, variant])

  function openMenuAt(index: number) {
    setOpen(true)
    focusMenuItem(index)
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openMenuAt(event.key === 'ArrowUp' ? LOCALE_OPTIONS.length - 1 : 0)
    }
  }

  function handleItemKeyDown(
    event: KeyboardEvent<HTMLAnchorElement>,
    index: number,
  ) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusMenuItem((index + 1) % LOCALE_OPTIONS.length)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusMenuItem((index - 1 + LOCALE_OPTIONS.length) % LOCALE_OPTIONS.length)
        break
      case 'Home':
        event.preventDefault()
        focusMenuItem(0)
        break
      case 'End':
        event.preventDefault()
        focusMenuItem(LOCALE_OPTIONS.length - 1)
        break
      case 'Escape':
        event.preventDefault()
        closeAndFocusTrigger()
        break
      case 'Tab':
        setOpen(false)
        break
      case ' ':
        event.preventDefault()
        event.currentTarget.click()
        break
      default:
        break
    }
  }

  if (variant === 'launcher' || variant === 'guide') {
    return (
      <div
        className={`language-picker language-picker--${variant}`}
        ref={rootRef}
        data-testid={`language-picker-${variant}`}
      >
        <button
          className="language-picker__stamp"
          type="button"
          ref={triggerRef}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`${t('label')}: ${currentOption.label}`}
          onClick={() => {
            setOpen((current) => !current)
          }}
          onKeyDown={handleTriggerKeyDown}
        >
          <span className="language-picker__stamp-code">{currentOption.shortLabel}</span>
          <span className="language-picker__stamp-caret" aria-hidden="true">▾</span>
        </button>

        {open && (
          <div
            className="language-picker__stamp-menu"
            id={menuId}
            role="listbox"
            aria-label={t('label')}
          >
            {LOCALE_OPTIONS.map((option, index) => {
              const isCurrent = option.locale === locale

              return (
                <Link
                  key={option.locale}
                  href={{ pathname, query }}
                  locale={option.locale}
                  replace
                  scroll={false}
                  role="option"
                  aria-selected={isCurrent}
                  className={`language-picker__stamp-item ${isCurrent ? 'is-current' : ''}`}
                  ref={(node) => {
                    itemRefs.current[index] = node
                  }}
                  data-testid={`language-picker-option-${option.locale}`}
                  onClick={() => {
                    setOpen(false)
                  }}
                  onKeyDown={(event) => {
                    handleItemKeyDown(event, index)
                  }}
                >
                  <span className="language-picker__stamp-item-code">{option.shortLabel}</span>
                  <span className="language-picker__stamp-item-name">{option.label}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="language-picker language-picker--settings match-setup-field"
      ref={rootRef}
      aria-label={t('ariaLabel')}
      data-testid="language-picker-settings"
    >
      <span className="match-setup-field__label">{t('label')}</span>
      <button
        type="button"
        ref={triggerRef}
        className={`match-setup-select language-picker__settings-trigger ${open ? 'is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-testid="language-picker-settings-trigger"
        onClick={() => {
          setOpen((current) => !current)
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="match-setup-select__content">
          <span className="match-setup-select__value">{currentOption.label}</span>
        </span>
        <span className="match-setup-select__chevron" aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div
          className="match-setup-select__menu language-picker__settings-menu"
          id={menuId}
          role="listbox"
          aria-label={t('label')}
          data-testid="language-picker-settings-menu"
        >
          {LOCALE_OPTIONS.map((option, index) => {
            const isCurrent = option.locale === locale

            return (
              <Link
                key={option.locale}
                href={{ pathname, query }}
                locale={option.locale}
                replace
                scroll={false}
                role="option"
                aria-selected={isCurrent}
                className={`match-setup-select__option language-picker__settings-option ${isCurrent ? 'is-selected' : ''}`}
                ref={(node) => {
                  itemRefs.current[index] = node
                }}
                data-testid={`language-picker-option-${option.locale}`}
                onClick={() => {
                  setOpen(false)
                }}
                onKeyDown={(event) => {
                  handleItemKeyDown(event, index)
                }}
              >
                <span className="match-setup-select__option-label">{option.label}</span>
                <span className="match-setup-select__option-copy">{option.shortLabel}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

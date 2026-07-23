'use client'

import './OverlaySelectField.css'

import { useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The set of menu IDs that can be open at any time in the live game launcher
 * and settings drawer.
 */
export type OverlayMenuId =
  | 'launcher-bot'
  | 'launcher-profile'
  | 'launcher-model'
  | 'launcher-dealer'
  | 'replace-bot'
  | 'replace-profile'
  | 'replace-model'
  | 'replace-dealer'
  | 'settings-bot'
  | 'settings-profile'
  | 'settings-model'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OverlaySelectField<T extends string>({
  menuId,
  label,
  valueLabel,
  valueMeta,
  triggerTestId,
  menuTestId,
  optionTestIdPrefix,
  disabled,
  fieldClassName,
  labelClassName,
  selectClassName,
  optionDescriptions,
  items,
  selectedValue,
  onSelect,
  overlayMenuOpen,
  setOverlayMenuOpen,
  setOverlayMenuRef,
}: {
  menuId: OverlayMenuId
  label: string
  valueLabel: string
  valueMeta?: string | null
  triggerTestId: string
  menuTestId: string
  optionTestIdPrefix: string
  disabled?: boolean
  fieldClassName?: string
  labelClassName?: string
  selectClassName?: string
  optionDescriptions?: Partial<Record<T, string | null>>
  items: Array<{ value: T; label: string }>
  selectedValue: T
  onSelect: (value: T) => void
  // Panel layout plumbing
  overlayMenuOpen: OverlayMenuId | null
  setOverlayMenuOpen: Dispatch<SetStateAction<OverlayMenuId | null>>
  setOverlayMenuRef: (menuId: OverlayMenuId, node: HTMLDivElement | null) => void
}) {
  const isOpen = overlayMenuOpen === menuId
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menuPlacement, setMenuPlacement] = useState<'below' | 'above'>('below')
  const [menuMaxHeight, setMenuMaxHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !menuRef.current) {
      setMenuPlacement('below')
      setMenuMaxHeight(null)
      return
    }

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const fieldRect = triggerRef.current.closest('.match-setup-field')?.getBoundingClientRect() ?? triggerRect
    const boundaryElement = triggerRef.current.closest('.live-settings-drawer')
    const boundaryRect = boundaryElement instanceof HTMLElement
      ? boundaryElement.getBoundingClientRect()
      : null
    const boundaryInset = 22
    const boundaryTop = (boundaryRect?.top ?? 0) + boundaryInset
    const boundaryBottom = (boundaryRect?.bottom ?? window.innerHeight) - boundaryInset
    const belowSpace = Math.max(0, Math.floor(boundaryBottom - fieldRect.bottom - 10))
    const aboveSpace = Math.max(0, Math.floor(fieldRect.top - boundaryTop - 10))
    const desiredHeight = Math.min(menuRef.current.scrollHeight, 320)
    const nextPlacement = belowSpace >= desiredHeight || belowSpace >= aboveSpace ? 'below' : 'above'
    const availableSpace = nextPlacement === 'below' ? belowSpace : aboveSpace

    setMenuPlacement(nextPlacement)
    setMenuMaxHeight(Math.min(320, availableSpace))
  }, [isOpen])

  return (
    <div
      className={['match-setup-field', fieldClassName, isOpen ? 'has-open-menu' : ''].filter(Boolean).join(' ')}
      ref={(node) => {
        setOverlayMenuRef(menuId, node)
      }}
    >
      <span className={['match-setup-field__label', labelClassName].filter(Boolean).join(' ')}>
        {label}
      </span>
      <button
        type="button"
        ref={triggerRef}
        className={['match-setup-select', selectClassName, isOpen ? 'is-open' : ''].filter(Boolean).join(' ')}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        data-testid={triggerTestId}
        disabled={disabled}
        onClick={() => {
          setOverlayMenuOpen((current) => current === menuId ? null : menuId)
        }}
      >
        <span className="match-setup-select__content">
          <span className="match-setup-select__value">{valueLabel}</span>
          {valueMeta && (
            <span className="match-setup-select__meta">{valueMeta}</span>
          )}
        </span>
        <span className="match-setup-select__chevron" aria-hidden="true">⌄</span>
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className={['match-setup-select__menu', menuPlacement === 'above' ? 'match-setup-select__menu--above' : ''].filter(Boolean).join(' ')}
          role="listbox"
          aria-label={label}
          data-testid={menuTestId}
          style={menuMaxHeight ? { maxHeight: `${menuMaxHeight}px` } : undefined}
        >
          {items.map((item) => {
            const isSelected = item.value === selectedValue
            const description = optionDescriptions?.[item.value] ?? null

            return (
              <button
                key={item.value}
                type="button"
                className={`match-setup-select__option ${isSelected ? 'is-selected' : ''}`}
                aria-pressed={isSelected}
                data-testid={`${optionTestIdPrefix}-${item.value}`}
                onClick={() => {
                  onSelect(item.value)
                  setOverlayMenuOpen(null)
                }}
              >
                <span className="match-setup-select__option-label">{item.label}</span>
                {description && (
                  <span className="match-setup-select__option-copy">{description}</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

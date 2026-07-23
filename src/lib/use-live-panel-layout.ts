'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'

// ---------------------------------------------------------------------------
// Types (mirrored from LiveGame.tsx — kept local to avoid a shared types file)
// ---------------------------------------------------------------------------

type Seat = 0 | 1
type DealerChoice = Seat | 'random'
type UtilitySurface = 'settings' | 'coach'
type SettingsDrawerSection = 'match' | 'experience' | 'shortcuts'
type OverlayMenuId =
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

// Re-export so callers that need the types can import them from here.
export type {
  DealerChoice,
  OverlayMenuId,
  SettingsDrawerSection,
  UtilitySurface,
}

// ---------------------------------------------------------------------------
// Exported return type
// ---------------------------------------------------------------------------

export type LivePanelLayoutState = {
  // Overlay dropdown menus
  overlayMenuOpen: OverlayMenuId | null
  setOverlayMenuOpen: Dispatch<SetStateAction<OverlayMenuId | null>>
  overlayMenuRefs: MutableRefObject<Partial<Record<OverlayMenuId, HTMLDivElement | null>>>
  setOverlayMenuRef: (menuId: OverlayMenuId, node: HTMLDivElement | null) => void
  closeOverlayMenus: () => void

  // Active utility surface (settings drawer / coach dock)
  activeUtilitySurface: UtilitySurface | null
  setActiveUtilitySurface: Dispatch<SetStateAction<UtilitySurface | null>>
  toggleUtilitySurface: (surface: UtilitySurface) => void
  openSettingsDrawer: (section?: SettingsDrawerSection) => void
  toggleSettingsDrawer: () => void

  // Settings drawer section accordion
  expandedSettingsSection: SettingsDrawerSection | null
  setExpandedSettingsSection: Dispatch<SetStateAction<SettingsDrawerSection | null>>
  toggleSettingsSection: (section: SettingsDrawerSection) => void

  // Launcher animation
  launcherTransitioningOut: boolean
  setLauncherTransitioningOut: Dispatch<SetStateAction<boolean>>

  // Compact viewport / footer
  compactViewport: boolean
  setCompactViewport: Dispatch<SetStateAction<boolean>>
  compactFooterOpen: boolean
  setCompactFooterOpen: Dispatch<SetStateAction<boolean>>
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function isCompactLiveViewport(width: number, height: number) {
  return width <= 420 || (width <= 540 && height <= 760)
}

function readCompactLiveViewport() {
  if (typeof window === 'undefined') return false
  return isCompactLiveViewport(window.innerWidth, window.innerHeight)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Owns all panel-layout UI state for LiveGame.tsx.
 *
 * Self-contained effects handled here:
 * - Overlay menu closes on Escape key or outside click.
 * - Active utility surface closes on Escape key.
 * - Compact footer closes on Escape key.
 * - Compact viewport flag updates on window resize.
 *
 * Effects that depend on engine/session state (e.g. clearing the footer when
 * the viewport switches to desktop or the session ends) remain in LiveGame.tsx,
 * where the session is already in scope.
 */
export function useLivePanelLayout(): LivePanelLayoutState {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const [overlayMenuOpen, setOverlayMenuOpen] = useState<OverlayMenuId | null>(null)
  const [activeUtilitySurface, setActiveUtilitySurface] = useState<UtilitySurface | null>(null)
  const [expandedSettingsSection, setExpandedSettingsSection] = useState<SettingsDrawerSection | null>(null)
  const [launcherTransitioningOut, setLauncherTransitioningOut] = useState(false)
  const [compactViewport, setCompactViewport] = useState(() => readCompactLiveViewport())
  const [compactFooterOpen, setCompactFooterOpen] = useState(false)

  // -------------------------------------------------------------------------
  // Refs
  // -------------------------------------------------------------------------

  const overlayMenuRefs = useRef<Partial<Record<OverlayMenuId, HTMLDivElement | null>>>({})

  // -------------------------------------------------------------------------
  // Callbacks
  // -------------------------------------------------------------------------

  const closeOverlayMenus = useCallback(() => {
    setOverlayMenuOpen(null)
  }, [])

  const setOverlayMenuRef = useCallback((menuId: OverlayMenuId, node: HTMLDivElement | null) => {
    overlayMenuRefs.current[menuId] = node
  }, [])

  const toggleUtilitySurface = useCallback((surface: UtilitySurface) => {
    setOverlayMenuOpen(null)
    setActiveUtilitySurface((current) => current === surface ? null : surface)
  }, [])

  const openSettingsDrawer = useCallback((section: SettingsDrawerSection = 'match') => {
    setOverlayMenuOpen(null)
    setExpandedSettingsSection(section)
    setActiveUtilitySurface('settings')
  }, [])

  const toggleSettingsDrawer = useCallback(() => {
    setOverlayMenuOpen(null)
    if (activeUtilitySurface === 'settings') {
      setActiveUtilitySurface(null)
      return
    }
    setActiveUtilitySurface('settings')
  }, [activeUtilitySurface])

  const toggleSettingsSection = useCallback((section: SettingsDrawerSection) => {
    setExpandedSettingsSection((current) => current === section ? null : section)
  }, [])

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  // Compact viewport — update on resize.
  useEffect(() => {
    const updateCompactViewport = () => {
      setCompactViewport(readCompactLiveViewport())
    }

    updateCompactViewport()
    window.addEventListener('resize', updateCompactViewport)

    return () => {
      window.removeEventListener('resize', updateCompactViewport)
    }
  }, [])

  // Close the active overlay menu on outside click or Escape.
  useEffect(() => {
    if (!overlayMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!overlayMenuRefs.current[overlayMenuOpen]?.contains(event.target as Node)) {
        setOverlayMenuOpen(null)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOverlayMenuOpen(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [overlayMenuOpen])

  // Close the utility surface (settings drawer / coach dock) on Escape.
  useEffect(() => {
    if (!activeUtilitySurface) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveUtilitySurface(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeUtilitySurface])

  // Close the compact coach flyout on Escape.
  useEffect(() => {
    if (!compactFooterOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCompactFooterOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [compactFooterOpen])

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    overlayMenuOpen,
    setOverlayMenuOpen,
    overlayMenuRefs,
    setOverlayMenuRef,
    closeOverlayMenus,

    activeUtilitySurface,
    setActiveUtilitySurface,
    toggleUtilitySurface,
    openSettingsDrawer,
    toggleSettingsDrawer,

    expandedSettingsSection,
    setExpandedSettingsSection,
    toggleSettingsSection,

    launcherTransitioningOut,
    setLauncherTransitioningOut,

    compactViewport,
    setCompactViewport,
    compactFooterOpen,
    setCompactFooterOpen,
  }
}

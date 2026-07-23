'use client'

function FarolSettingsCogIcon() {
  return (
    <svg
      className="ft-settings-cog__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}

export function FarolSettingsButton({
  className = '',
  variant = 'brass',
  isOpen,
  hasAlert,
  onClick,
  testId = 'live-game-settings-button',
  ariaLabel = 'Open match settings',
}: {
  className?: string
  variant?: 'brass' | 'outline'
  isOpen: boolean
  hasAlert: boolean
  onClick: () => void
  testId?: string | null
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      className={[
        'ft-settings-cog',
        `ft-settings-cog--${variant}`,
        className,
        isOpen ? 'is-active' : '',
      ].filter(Boolean).join(' ')}
      data-testid={testId ?? undefined}
      data-has-alert={hasAlert ? 'true' : 'false'}
      aria-label={ariaLabel}
      aria-expanded={isOpen}
      onClick={onClick}
    >
      <FarolSettingsCogIcon />
    </button>
  )
}

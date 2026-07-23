'use client'

function FarolStudyLensIcon() {
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
      <circle cx="10.5" cy="10.5" r="5.8" />
      <path d="m14.8 14.8 5.2 5.2" />
      <path d="M8.2 10.5h4.6M10.5 8.2v4.6" />
    </svg>
  )
}

export type FarolStudyButtonState = {
  label: string
  href?: string | null
  disabledReason?: string | null
}

// Same visual family as FarolSettingsButton: a bare lens that lights up on
// hover, with a handwritten label underneath (via the data-label attribute).
// Enabled it is a link into the study lab; when the current spot cannot be
// studied it stays visible but inert, with the reason as its tooltip so the
// solved-from-10x10 boundary is a story rather than a missing button.
export function FarolStudyButton({
  className = '',
  variant = 'brass',
  label,
  href,
  disabledReason,
  testId = 'live-game-study-hand-button',
}: {
  className?: string
  variant?: 'brass' | 'outline'
  label: string
  href?: string | null
  disabledReason?: string | null
  testId?: string | null
}) {
  const classes = [
    'ft-settings-cog',
    `ft-settings-cog--${variant}`,
    'ft-study-lens',
    className,
  ]
  if (href) {
    return (
      <a
        className={classes.filter(Boolean).join(' ')}
        data-testid={testId ?? undefined}
        data-label={label}
        aria-label={label}
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        <FarolStudyLensIcon />
      </a>
    )
  }
  return (
    <button
      type="button"
      className={[...classes, 'is-disabled'].filter(Boolean).join(' ')}
      data-testid={testId ?? undefined}
      data-label={label}
      aria-label={label}
      aria-disabled="true"
      title={disabledReason ?? undefined}
    >
      <FarolStudyLensIcon />
    </button>
  )
}

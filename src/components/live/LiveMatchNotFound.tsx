import { useState } from 'react'
import { useTranslations } from 'next-intl'

import './LiveMatchNotFound.css'

export type MatchNotFoundReason = 'expired' | 'notfound' | 'offline'

export type MatchNotFoundRecent = {
  opponent: string
  youScore: number
  themScore: number
  when: string
  matchId: string
}

type LiveMatchNotFoundProps = {
  reason: MatchNotFoundReason
  link: string
  recent?: MatchNotFoundRecent | null
  isStartDisabled?: boolean
  isRetryDisabled?: boolean
  onStartFresh: () => void
  onRejoinLocal?: (matchId: string) => void
  onPasteLink?: (link: string) => boolean
  onRetry?: () => void
}

function truncateMatchId(value: string, visible = 12) {
  return value.length > visible ? `${value.slice(0, visible)}…` : value
}

function abbreviateLink(link: string) {
  try {
    const url = new URL(link, 'https://farol.local')
    const matchId = url.searchParams.get('match')
    if (matchId) {
      return `${url.pathname}?match=${truncateMatchId(matchId)}`
    }

    const pathMatch = url.pathname.match(/^(\/m\/)([^/?#]+)/)
    if (pathMatch) {
      return `${pathMatch[1]}${truncateMatchId(decodeURIComponent(pathMatch[2]))}`
    }
  } catch {
    return truncateMatchId(link)
  }

  return link
}

function MatchExplanation({ reason, link }: { reason: MatchNotFoundReason; link: string }) {
  const t = useTranslations('Live.notFound')
  const shortLink = abbreviateLink(link)

  return t.rich(`${reason}.explanation`, {
    link: () => <code>{shortLink}</code>,
  })
}

function RecentMatchLine({ recent }: { recent: MatchNotFoundRecent }) {
  const tCommon = useTranslations('Common')

  return (
    <>
      <strong>{recent.opponent}</strong> · {tCommon('you').toLowerCase()} {recent.youScore} ·{' '}
      {tCommon('them').toLowerCase()} {recent.themScore} · <em>{recent.when}</em>
    </>
  )
}

export function LiveMatchNotFound({
  reason,
  link,
  recent,
  isStartDisabled = false,
  isRetryDisabled = false,
  onStartFresh,
  onRejoinLocal,
  onPasteLink,
  onRetry,
}: LiveMatchNotFoundProps) {
  const t = useTranslations('Live.notFound')
  const [isPasteOpen, setIsPasteOpen] = useState(false)
  const [pastedLink, setPastedLink] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const hasRecent = Boolean(recent && onRejoinLocal)

  const submitPastedLink = () => {
    const didAccept = onPasteLink?.(pastedLink) ?? false
    if (!didAccept) {
      setPasteError(t('pasteError'))
      return
    }

    setPasteError(null)
  }

  return (
    <section
      className="mnf-stage"
      role="alert"
      aria-labelledby="match-not-found-title"
      data-testid="live-session-failure"
    >
      <div className="mnfa-pad" data-testid="live-match-not-found">
        <div className="mnfa-pad-tack" />
        <div className="mnfa-folio">
          <span>folio · vii</span>
          <code>{abbreviateLink(link)}</code>
        </div>

        <div className="mnfa-stamp-mark">{t(`${reason}.stamp`)}</div>

        <div className="mnfa-verdict" id="match-not-found-title">{t(`${reason}.headline`)}</div>
        <div className="mnfa-explain">
          <MatchExplanation reason={reason} link={link} />
        </div>

        {hasRecent && (
          <>
            <div className="mnfa-rule" />

            <button
              type="button"
              className="mnfa-recent"
              onClick={() => { onRejoinLocal?.(recent!.matchId) }}
            >
              <span className="mnfa-recent-label">{t('lastEntry')}</span>
              <span className="mnfa-recent-line">
                <RecentMatchLine recent={recent!} />
              </span>
            </button>
          </>
        )}

        <div className="mnfa-cta-row">
          <button
            className="mnfa-cta"
            type="button"
            disabled={isStartDisabled}
            onClick={onStartFresh}
          >
            {t('startFresh')}
          </button>
          {hasRecent && (
            <button
              className="mnfa-cta-secondary"
              type="button"
              onClick={() => { onRejoinLocal?.(recent!.matchId) }}
            >
              {t('rejoinLast')}
            </button>
          )}
        </div>

        <div className="mnfa-tertiary-row">
          {reason === 'offline' ? (
            <button
              className="mnfa-cta-tertiary"
              type="button"
              disabled={isRetryDisabled}
              onClick={onRetry}
            >
              {t('retryConnection')}
            </button>
          ) : (
            <button
              className="mnfa-cta-tertiary"
              type="button"
              onClick={() => {
                setIsPasteOpen((current) => !current)
                setPasteError(null)
              }}
            >
              {t('pasteAgain')}
            </button>
          )}
        </div>

        {isPasteOpen && reason !== 'offline' && (
          <form
            className="mnfa-paste-form"
            onSubmit={(event) => {
              event.preventDefault()
              submitPastedLink()
            }}
          >
            <input
              aria-label={t('matchLinkAria')}
              className="mnfa-paste-input"
              value={pastedLink}
              onChange={(event) => {
                setPastedLink(event.target.value)
                setPasteError(null)
              }}
              placeholder={t('placeholder')}
            />
            <button className="mnfa-paste-submit" type="submit">{t('try')}</button>
            {pasteError && <div className="mnfa-paste-error">{pasteError}</div>}
          </form>
        )}
      </div>
    </section>
  )
}

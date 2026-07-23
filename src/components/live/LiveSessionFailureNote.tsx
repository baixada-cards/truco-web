import { useTranslations } from 'next-intl'

import type { SessionFailureState } from '../../lib/use-live-game-session'
import './LiveSessionFailureNote.css'

type LiveSessionFailureNoteProps = {
  failure: SessionFailureState
  hasSession: boolean
  isStartDisabled?: boolean
  onRetry: () => void
  onStartFresh: () => void
  onDismiss: () => void
  // Bring-your-own-key, shown inline when the shared key is exhausted so the fix
  // is one step away instead of buried in Settings.
  apiKeyValue?: string
  onApiKeyChange?: (value: string) => void
  onUseApiKey?: () => void
}

function copyKeyForFailure(failure: SessionFailureState) {
  switch (failure.code) {
    case 'ENGINE_REJECTED_REQUEST':
    case 'ENGINE_TIMEOUT':
    case 'ENGINE_UNAVAILABLE':
    case 'SESSION_LIMIT_REACHED':
    case 'BOT_PROVIDER_UNAVAILABLE':
    case 'BOT_MODEL_REQUIRED':
    case 'BOT_MODEL_UNAVAILABLE':
    case 'LLM_PROVIDER_EXHAUSTED':
      return failure.code
    default:
      return 'UNKNOWN'
  }
}

function shouldUseInlineCopy(failure: SessionFailureState, hasSession: boolean) {
  return hasSession && (
    failure.code === 'ENGINE_REJECTED_REQUEST' ||
    failure.code === 'UNKNOWN'
  )
}

function retryLabelKey(failure: SessionFailureState) {
  switch (failure.retryAction) {
    case 'continue-match':
      return 'retryNextHand'
    case 'start-match':
      return 'tryAgain'
    default:
      return 'retryLoading'
  }
}

export function LiveSessionFailureNote({
  failure,
  hasSession,
  isStartDisabled = false,
  onRetry,
  onStartFresh,
  onDismiss,
  apiKeyValue,
  onApiKeyChange,
  onUseApiKey,
}: LiveSessionFailureNoteProps) {
  const tCommon = useTranslations('Common')
  const t = useTranslations('Live.failure')
  const copyKey = copyKeyForFailure(failure)
  // When the shared key is exhausted, offer the key inline instead of a retry
  // that would just hit the same 402.
  const showByok = failure.code === 'LLM_PROVIDER_EXHAUSTED' && Boolean(onUseApiKey)
  const trimmedKey = (apiKeyValue ?? '').trim()
  const copyScope = shouldUseInlineCopy(failure, hasSession) ? 'inline' : 'default'
  const label = hasSession ? t('note.inlineLabel') : t('note.stageLabel')
  const stamp = failure.code === 'ENGINE_REJECTED_REQUEST'
    ? t('note.rejectedStamp')
    : t('note.reviewStamp')
  const hasTechnicalDetails = Boolean(
    failure.detail ||
    failure.status != null ||
    failure.code !== 'UNKNOWN',
  )

  return (
    <section
      className={[
        'farol-session-failure',
        hasSession ? 'is-inline' : 'is-stage',
      ].join(' ')}
      role="alert"
      aria-labelledby="live-session-failure-title"
      data-testid="live-session-failure"
    >
      <div className="fsfn-note paper">
        <div className="fsfn-note__pin" aria-hidden="true" />
        <div className="fsfn-note__folio">
          <span>{label}</span>
          <span>{failure.status ? t('note.statusFolio', { status: failure.status }) : t('note.serviceFolio')}</span>
        </div>

        <div className="fsfn-note__stamp" aria-hidden="true">{stamp}</div>

        <h2 id="live-session-failure-title" className="fsfn-note__title">
          {t(`copy.${copyKey}.${copyScope}.title`)}
        </h2>
        <p className="fsfn-note__copy">
          {t(`copy.${copyKey}.${copyScope}.description`)}
        </p>

        {showByok && (
          <div className="fsfn-byok">
            <label className="fsfn-byok__label" htmlFor="fsfn-byok-input">
              {t('byok.label')}
            </label>
            <div className="fsfn-byok__row">
              <input
                id="fsfn-byok-input"
                type="password"
                className="fsfn-byok__input"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={t('byok.placeholder')}
                value={apiKeyValue ?? ''}
                onChange={(event) => onApiKeyChange?.(event.target.value)}
                data-testid="live-failure-byok-input"
              />
              <button
                type="button"
                className="fsfn-button fsfn-button--primary"
                disabled={!trimmedKey}
                onClick={onUseApiKey}
                data-testid="live-failure-byok-use"
              >
                {t('byok.action')}
              </button>
            </div>
            <p className="fsfn-byok__hint">{t('byok.hint')}</p>
          </div>
        )}

        <div className="fsfn-note__actions">
          {failure.retryAction && !showByok && (
            <button
              type="button"
              className="fsfn-button fsfn-button--primary"
              disabled={failure.retryAction === 'start-match' && isStartDisabled}
              onClick={onRetry}
            >
              {retryLabelKey(failure) === 'tryAgain'
                ? tCommon('tryAgain')
                : t(retryLabelKey(failure))}
            </button>
          )}
          {!hasSession && (
            <button
              type="button"
              className="fsfn-button fsfn-button--secondary"
              disabled={isStartDisabled}
              onClick={onStartFresh}
            >
              {t('startFresh')}
            </button>
          )}
          <button
            type="button"
            className="fsfn-button fsfn-button--tertiary"
            onClick={onDismiss}
          >
            {tCommon('dismiss')}
          </button>
        </div>

        {hasTechnicalDetails && (
          <details className="fsfn-details">
            <summary>{t('note.detailsSummary')}</summary>
            <dl>
              {failure.status != null && (
                <>
                  <dt>{t('note.statusLabel')}</dt>
                  <dd>{failure.status}</dd>
                </>
              )}
              <dt>{t('note.codeLabel')}</dt>
              <dd>{failure.code}</dd>
              {failure.detail && (
                <>
                  <dt>{t('note.messageLabel')}</dt>
                  <dd>{failure.detail}</dd>
                </>
              )}
            </dl>
          </details>
        )}
      </div>
    </section>
  )
}

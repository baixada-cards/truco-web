'use client'

import {
  useCallback,
  useRef,
} from 'react'

import { DEFAULT_SOUND_THEME_ID, type SoundCue } from './table-sound-fx'
import type { ScoreSide } from './live-score-celebration'
import type { LiveDevControlsState } from './use-live-dev-controls'

const noop = () => {}
const noopSetter = noop as never

export function useLiveDevControls(_activeMatchId: string | null): LiveDevControlsState {
  void _activeMatchId
  const devPanelRef = useRef<HTMLElement | null>(null)
  const devMatchCompletePreviewTimeoutRef = useRef<number | null>(null)
  const devMatchCompletePreviewRunIdRef = useRef(0)

  const handleDevPanelPointerDown = useCallback(() => {}, [])
  const clearDevClipboardTimeout = useCallback(() => {}, [])
  const flashDevClipboardMessage = useCallback((_message: string) => {
    void _message
  }, [])
  const clearDevMatchCompletePreviewTimeout = useCallback(() => {}, [])
  const clearDevMatchCompletePreview = useCallback(() => {}, [])

  return {
    devPanelOpen: false,
    setDevPanelOpen: noopSetter,
    devPanelPosition: null,
    setDevPanelPosition: noopSetter,
    resetDevPanelPosition: noop,
    isDraggingDevPanel: false,
    devPanelRef,
    devSectionOpenState: {} as LiveDevControlsState['devSectionOpenState'],
    setDevSectionOpenState: noopSetter,
    devAuditionThemeId: DEFAULT_SOUND_THEME_ID,
    setDevAuditionThemeId: noopSetter,
    devAuditionCue: 'ui_click' as SoundCue,
    setDevAuditionCue: noopSetter,
    devClipboardMessage: null,
    devDealerChoice: 'random',
    setDevDealerChoice: noopSetter,
    // Prod never forces the vira; the dev default only applies where the
    // panel exists.
    devNextViraRank: 'random',
    setDevNextViraRank: noopSetter,
    devScoreHero: 0,
    setDevScoreHero: noopSetter,
    devScoreVillain: 0,
    setDevScoreVillain: noopSetter,
    devStakeResponseAction: 'accept_raise',
    setDevStakeResponseAction: noopSetter,
    devVillainCards: null,
    setDevVillainCards: noopSetter,
    devVillainCardsStale: false,
    setDevVillainCardsStale: noopSetter,
    devAnimStakeFrom: 1,
    setDevAnimStakeFrom: noopSetter,
    devLampSwingLeadMs: 330,
    setDevLampSwingLeadMs: noopSetter,
    devAnimScorePoints: 1,
    setDevAnimScorePoints: noopSetter,
    devAnimScoreWinner: 'hero' as ScoreSide,
    setDevAnimScoreWinner: noopSetter,
    devStakeFxActor: 'villain' as ScoreSide,
    setDevStakeFxActor: noopSetter,
    devMatchCompletePreview: null,
    setDevMatchCompletePreview: noopSetter,
    devMatchCompletePreviewTimeoutRef,
    devMatchCompletePreviewRunIdRef,
    clearDevPanelDrag: noop,
    handleDevPanelPointerDown,
    clearDevClipboardTimeout,
    flashDevClipboardMessage,
    clearDevMatchCompletePreviewTimeout,
    clearDevMatchCompletePreview,
  }
}

'use client'

import type { CSSProperties, MutableRefObject } from 'react'
import type { PanInfo } from 'framer-motion'

import type { DeckSystem } from '../../lib/deck-system'
import type { SessionCard } from '../../lib/session-api'
import { Card } from './LiveCard'

import './LiveHand.css'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCardLayoutId(cardId: string) {
  return `card-${cardId}`
}

// ---------------------------------------------------------------------------
// LiveVillainHand — live-arena__villain player-zone (face-down opponent cards)
// ---------------------------------------------------------------------------

export function LiveVillainHand({
  visibleOpponentSlots,
  opponentSlotRefs,
  deckSystem,
}: {
  visibleOpponentSlots: boolean[]
  opponentSlotRefs: MutableRefObject<(HTMLDivElement | null)[]>
  deckSystem: DeckSystem
}) {
  return (
    <section className="live-arena__player-zone live-arena__villain" aria-label="Them">
      <div className="live-arena__player-hand-wrap">
        <div className="hand-row" data-testid="opponent-hand-row">
          <div className="hand opponent-hand">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                ref={(el) => {
                  opponentSlotRefs.current[index] = el
                }}
                data-testid={`opponent-hand-slot-${index}`}
              >
                {visibleOpponentSlots[index] && (
                  <Card
                    card={{ id: `opp-${index}`, rank: '?', suit: '?' }}
                    faceDown={true}
                    cardSize="md"
                    deckSystem={deckSystem}
                    layoutId={undefined}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="live-arena__player-status" aria-hidden="true" />
    </section>
  )
}

// ---------------------------------------------------------------------------
// LiveHeroHand — live-arena__hero player-zone (player cards + drag handlers)
// ---------------------------------------------------------------------------

export type HeroCardAffordance = {
  isStagedFaceDown: boolean
  canPlayFaceUp: boolean
  canPlayFaceDown: boolean
  handAffordance: 'playable' | 'inactive'
}

export function LiveHeroHand({
  visibleHeroCards,
  heroDealSlotsFaceDown,
  heroCardAffordances,
  heroCardHiddenForPlayMotionId,
  deckSystem,
  heroHandReorderTargetIndex,
  heroHandReorderSourceIndex,
  heroHandReorderPreviewOffsets,
  canReorderHeroCards,
  compactViewportActive,
  hideCardPlaysImmediately,
  layoutMoveDurationS,
  manilhaRank,
  playerSlotRefs,
  submitHeroCardAction,
  handleHideCardChoice,
  playStagedHideSound,
  triggerHeroPlayMotion,
  handleHeroCardDrag,
  handleHeroCardDragEnd,
  isPointInsideHeroSlot,
  onHeroDragPointerDown,
  onHeroDragStart,
}: {
  visibleHeroCards: (SessionCard | null)[]
  heroDealSlotsFaceDown: boolean[]
  heroCardAffordances: (HeroCardAffordance | null)[]
  heroCardHiddenForPlayMotionId: string | null
  deckSystem: DeckSystem
  heroHandReorderTargetIndex: number | null
  heroHandReorderSourceIndex: number | null
  heroHandReorderPreviewOffsets: number[]
  canReorderHeroCards: boolean
  compactViewportActive: boolean
  hideCardPlaysImmediately: boolean
  layoutMoveDurationS: number
  manilhaRank?: string | null
  playerSlotRefs: MutableRefObject<(HTMLDivElement | null)[]>
  submitHeroCardAction: (cardId: string, type: 'play_face_up' | 'play_face_down') => boolean | void
  handleHideCardChoice: (cardId: string) => void
  playStagedHideSound: () => void
  triggerHeroPlayMotion: () => void
  handleHeroCardDrag: (
    cardId: string,
    cardIndex: number,
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => void
  handleHeroCardDragEnd: (
    cardId: string,
    cardIndex: number,
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => void
  isPointInsideHeroSlot: (point: { x: number; y: number }) => boolean
  onHeroDragPointerDown: (
    cardId: string,
    cardIndex: number,
    options: { canDropOnTable: boolean; canPlayFaceDown: boolean },
  ) => void
  onHeroDragStart: (
    cardId: string,
    cardIndex: number,
    options: { canDropOnTable: boolean; canPlayFaceDown: boolean },
  ) => void
}) {
  return (
    <section className="live-arena__player-zone live-arena__hero" aria-label="You">
      <div className="live-arena__player-hand-wrap">
        <div className="hand-row" data-testid="hero-hand-row">
          <div className={[
            'hand',
            'player-hand',
            heroHandReorderSourceIndex !== null ? 'is-reorder-active' : '',
          ].filter(Boolean).join(' ')}>
            {visibleHeroCards.map((card, index) => (
              <div
                key={card?.id ?? `empty-${index}`}
                style={{
                  '--hand-reorder-x': `${heroHandReorderPreviewOffsets[index] ?? 0}px`,
                } as CSSProperties}
                className={[
                  'hand-slot',
                  card ? 'has-card' : 'is-empty',
                  heroHandReorderTargetIndex === index ? 'is-reorder-target' : '',
                  heroHandReorderSourceIndex === index ? 'is-reorder-source' : '',
                  (heroHandReorderPreviewOffsets[index] ?? 0) !== 0 ? 'is-reorder-shifted' : '',
                ].filter(Boolean).join(' ')}
                ref={(el) => {
                  playerSlotRefs.current[index] = el
                }}
                data-testid={`hero-hand-slot-${index}`}
              >
                {card && (() => {
                  const affordance = heroCardAffordances[index]
                  const canDropOnTable = Boolean(affordance?.canPlayFaceUp)
                  const canPlayFaceDown = Boolean(affordance?.canPlayFaceDown)
                  const canDragToTable = canDropOnTable && !compactViewportActive
                  const canDragToFaceDownSleeve = canPlayFaceDown && !compactViewportActive
                  const canDragHeroCard = canDragToTable || canReorderHeroCards
                  if (heroCardHiddenForPlayMotionId === card.id) {
                    return null
                  }

                  return (
                    <Card
                      key={`${card.id}-${index}`}
                      card={card}
                      faceDown={heroDealSlotsFaceDown[index] || Boolean(affordance?.isStagedFaceDown)}
                      isHeroCard={true}
                      deckSystem={deckSystem}
                      cardSize={compactViewportActive ? 'sm' : undefined}
                      handAffordance={affordance?.handAffordance}
                      enableHoverLift={affordance?.handAffordance === 'playable' && !compactViewportActive}
                      layoutId={heroHandReorderSourceIndex === index ? undefined : getCardLayoutId(card.id)}
                      motionDurationS={layoutMoveDurationS}
                      manilhaRank={manilhaRank}
                      draggable={canDragHeroCard}
                      onClick={affordance?.isStagedFaceDown || affordance?.canPlayFaceUp
                        ? () => {
                            if (affordance?.isStagedFaceDown) {
                              submitHeroCardAction(card.id, 'play_face_down')
                              return
                            }

                            if (affordance?.canPlayFaceUp) {
                              submitHeroCardAction(card.id, 'play_face_up')
                            }
                          }
                        : undefined}
                      onPrimaryPointerDown={canDragHeroCard
                        ? () => {
                            onHeroDragPointerDown(card.id, index, {
                              canDropOnTable: canDragToTable,
                              canPlayFaceDown: canDragToFaceDownSleeve,
                            })
                          }
                        : undefined}
                      onDragStart={canDragHeroCard
                        ? () => {
                            onHeroDragStart(card.id, index, {
                              canDropOnTable: canDragToTable,
                              canPlayFaceDown: canDragToFaceDownSleeve,
                            })
                            if (canDragToTable) {
                              triggerHeroPlayMotion()
                            }
                          }
                        : undefined}
                      onDrag={canDragHeroCard
                        ? (event, info) => {
                            handleHeroCardDrag(card.id, index, event, info)
                          }
                        : undefined}
                      onDragEnd={canDragHeroCard
                        ? (event, info) => {
                            handleHeroCardDragEnd(card.id, index, event, info)
                          }
                        : undefined}
                      onDragReleaseFallback={canDragHeroCard && canDragToTable
                        ? (point) => {
                            const sourceRect = playerSlotRefs.current[index]?.getBoundingClientRect() ?? null
                            if (canDragToFaceDownSleeve && sourceRect && point.y <= sourceRect.top - 30) {
                              submitHeroCardAction(card.id, 'play_face_down')
                              return
                            }

                            if (!isPointInsideHeroSlot(point)) {
                              return
                            }

                            submitHeroCardAction(card.id, 'play_face_up')
                          }
                        : undefined}
                      onHide={affordance?.canPlayFaceDown
                        ? () => {
                            handleHideCardChoice(card.id)
                          }
                        : undefined}
                      onHideStart={!hideCardPlaysImmediately ? playStagedHideSound : undefined}
                      animateHide={!hideCardPlaysImmediately}
                      onUnhide={!hideCardPlaysImmediately && affordance?.isStagedFaceDown
                        ? () => {
                            handleHideCardChoice(card.id)
                          }
                        : undefined}
                      onUnhideStart={!hideCardPlaysImmediately && affordance?.isStagedFaceDown
                        ? playStagedHideSound
                        : undefined}
                    />
                  )
                })()}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="live-arena__player-status" aria-hidden="true" />
    </section>
  )
}

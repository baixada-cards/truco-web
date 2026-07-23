'use client'
import { SpanishCard } from '../../src/components/farol/SpanishCard'
import { Peg } from '../../src/components/farol/Peg'
import { ScorePad } from '../../src/components/farol/ScorePad'
import { DeckWithVira } from '../../src/components/farol/DeckWithVira'
import type { Suit } from '../../src/components/farol/SpanishCard'
import type { PegState } from '../../src/components/farol/Peg'

const SUITS: Suit[] = ['espadas', 'bastos', 'copas', 'oros']
const PEG_STATES: PegState[] = ['idle', 'pending', 'accept', 'legal', 'future', 'past', 'ours']

export function FarolPreviewClient() {
  return (
    <div style={{ background: '#1f1610', minHeight: '100vh', padding: 32, fontFamily: 'sans-serif', color: '#ede4d0' }}>
      <h1 style={{ fontFamily: 'var(--font-hand)', fontSize: 28, marginBottom: 32, letterSpacing: '0.1em' }}>
        Farol Component Preview
      </h1>

      {/* SpanishCard — sizes */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.5, marginBottom: 16 }}>SpanishCard — sizes × suits</h2>
        {(['sm', 'md', 'lg'] as const).map(size => (
          <div key={size} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
            <span style={{ width: 24, opacity: 0.4, fontSize: 11 }}>{size}</span>
            {SUITS.map(suit => (
              <SpanishCard key={suit} rank={1} suit={suit} size={size} />
            ))}
            <span style={{ opacity: 0.3, fontSize: 11 }}>ranks</span>
            {[3, 7, 10, 11, 12].map(rank => (
              <SpanishCard key={rank} rank={rank} suit="oros" size={size} />
            ))}
          </div>
        ))}
      </section>

      {/* SpanishCard — face down + lost */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.5, marginBottom: 16 }}>SpanishCard — face-down / lost</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <SpanishCard rank={1} suit="espadas" size="md" faceDown />
          <SpanishCard rank={7} suit="oros" size="md" faceDown />
          <span style={{ opacity: 0.3, marginRight: 8 }}>|</span>
          <SpanishCard rank={1} suit="espadas" size="md" lost />
          <SpanishCard rank={7} suit="oros" size="md" lost />
          <SpanishCard rank={3} suit="copas" size="md" lost />
        </div>
      </section>

      {/* Peg — all states */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.5, marginBottom: 16 }}>Peg — all states</h2>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {PEG_STATES.map(state => (
            <div key={state} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Peg value={3} state={state} size={48} />
              <span style={{ fontSize: 10, opacity: 0.5, letterSpacing: '0.1em' }}>{state}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          {[1, 2, 3, 6, 9, 12].map(v => (
            <Peg key={v} value={v} state="accept" size={42} />
          ))}
        </div>
      </section>

      {/* ScorePad */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.5, marginBottom: 16 }}>ScorePad</h2>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <ScorePad hero={4} villain={7} to={12} />
          <ScorePad hero={11} villain={8} to={12} elevenRingSide="hero" />
          <ScorePad hero={11} villain={11} to={12} elevenRingSide="hero" />
        </div>
      </section>

      {/* DeckWithVira */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.5, marginBottom: 16 }}>DeckWithVira</h2>
        <div style={{ display: 'flex', gap: 32 }}>
          {SUITS.map(suit => (
            <DeckWithVira key={suit} deckSystem="spanish" vira={{ rank: 7, suit }} />
          ))}
        </div>
      </section>
    </div>
  )
}

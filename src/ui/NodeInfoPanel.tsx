// NodeInfoPanel — pinned info panel for the currently-hovered node.
// Lives top-right of the GameView; updates from session.hoveredNodeId.
//
// Stays open while the cursor is over the panel itself so its buttons
// (upgrade, spell concoct) remain usable. When the cursor leaves the
// panel and no node is hovered, the panel reverts to whichever node
// was hovered last and stays visible — clicking empty canvas dismisses.

import { useEffect, useState } from 'react';
import type { GameEngine } from '../engine/GameEngine';
import type { SessionState } from '../render/SessionState';
import type { NodeId } from '../types';

interface Props {
  engine: GameEngine;
  session: SessionState;
  // Polled value from GameView. May be null when nothing is hovered.
  hoveredNodeId: NodeId | null;
}

const BASE_UNIT_SPEED_PX_PER_SEC = 120;

export function NodeInfoPanel({ engine, session, hoveredNodeId }: Props) {
  const [panelHover, setPanelHover] = useState(false);
  const [pinnedId, setPinnedId] = useState<NodeId | null>(null);

  // When a new node is hovered, lock it in. When hover clears AND the
  // cursor is not over the panel, keep the previous lock; new hovers
  // replace it.
  useEffect(() => {
    if (hoveredNodeId !== null) {
      setPinnedId(hoveredNodeId);
    }
  }, [hoveredNodeId]);

  // Force a re-render every 250ms so live values (units, concoction
  // progress, bleed drain) refresh without React having to subscribe
  // to engine internals.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  void panelHover; // referenced via setPanelHover

  if (!pinnedId) return null;
  const node = engine.world.nodes.get(pinnedId);
  if (!node) return null;

  const typeDef = engine.content.nodeTypes[node.nodeType];
  const lv = typeDef?.levels.find((l) => l.level === node.level);

  const owner = node.ownerId
    ? engine.world.players.find((p) => p.id === node.ownerId)
    : null;
  const ownerColor = owner ? owner.color : '#666';
  const ownerLabel = owner
    ? owner.id === engine.world.humanPlayerId
      ? 'You'
      : 'Enemy'
    : 'Neutral';

  const isOwn = node.ownerId === engine.world.humanPlayerId;
  const sendPenalty = typeDef?.sendSpeedPenalty ?? 1;
  const sendSpeed = Math.round(BASE_UNIT_SPEED_PX_PER_SEC * sendPenalty);

  // Spells available to a Lab at its current level.
  const spellsAvailable: string[] = lv?.unlockedSpells ?? [];

  return (
    <div
      onMouseEnter={() => setPanelHover(true)}
      onMouseLeave={() => setPanelHover(false)}
      style={panelStyle}
    >
      <div style={headerStyle}>
        <span style={{ ...dotStyle, background: ownerColor }} />
        <span style={titleStyle}>
          {capitalize(node.nodeType)} L{node.level}
        </span>
        <span style={ownerLabelStyle}>{ownerLabel}</span>
      </div>

      <div style={rowStyle}>
        <span>Units</span>
        <span style={valueStyle}>
          {Math.floor(node.units)} / {node.maxUnits}
        </span>
      </div>

      {lv?.productionRate !== undefined && lv.productionRate > 0 && (
        <div style={rowStyle}>
          <span>Production</span>
          <span style={valueStyle}>{lv.productionRate.toFixed(1)} u/sec</span>
        </div>
      )}

      {lv?.defenseRate !== undefined && lv.defenseRate > 0 && (
        <div style={rowStyle}>
          <span>Defense rate</span>
          <span style={valueStyle}>−{lv.defenseRate} per arrival</span>
        </div>
      )}

      {lv?.attackRate !== undefined && (
        <>
          <div style={rowStyle}>
            <span>Attack</span>
            <span style={valueStyle}>
              {lv.attackRate}/s × {lv.attackDamage ?? 0} dmg
            </span>
          </div>
          <div style={rowStyle}>
            <span>Range</span>
            <span style={valueStyle}>{lv.attackRange} px</span>
          </div>
        </>
      )}

      {lv?.concoctSpeed !== undefined && (
        <div style={rowStyle}>
          <span>Concoct speed</span>
          <span style={valueStyle}>{lv.concoctSpeed.toFixed(1)}×</span>
        </div>
      )}

      <div style={rowStyle}>
        <span>Send speed</span>
        <span style={valueStyle}>{sendSpeed} px/sec</span>
      </div>

      {node.poisonStacks.length > 0 && (
        <div style={{ ...rowStyle, color: '#9be29b' }}>
          <span>Bleeding</span>
          <span style={valueStyle}>
            −{node.poisonStacks.reduce((s, x) => s + x.drainPerSecond, 0)} u/sec
          </span>
        </div>
      )}

      {node.spellQueue && (
        <div style={{ ...rowStyle, color: '#c6a8ff' }}>
          <span>{spellLabel(engine, node.spellQueue.spellId, node.spellQueue.state)}</span>
          <span style={valueStyle}>
            {node.spellQueue.state === 'ready'
              ? 'READY'
              : `${Math.round(node.spellQueue.progress * 100)}%`}
          </span>
        </div>
      )}

      {/* Action buttons — only on the human player's nodes. */}
      {isOwn && node.nodeType === 'lab' && (!node.spellQueue) && spellsAvailable.length > 0 && (
        <div style={sectionStyle}>
          <div style={sectionLabel}>Concoct</div>
          {spellsAvailable.map((sid) => {
            const spell = engine.content.spells[sid];
            if (!spell) return null;
            const affordable = node.units >= spell.unitCost;
            return (
              <button
                key={sid}
                onClick={() => engine.startConcoction(node.id, sid)}
                disabled={!affordable}
                style={{
                  ...buttonStyle,
                  opacity: affordable ? 1 : 0.45,
                  cursor: affordable ? 'pointer' : 'not-allowed',
                }}
              >
                <span>{spell.name}</span>
                <span style={costStyle}>{spell.unitCost}u</span>
              </button>
            );
          })}
        </div>
      )}

      {isOwn && node.nodeType === 'lab' && node.spellQueue && (
        <div style={sectionStyle}>
          <button
            onClick={() => engine.cancelConcoction(node.id)}
            style={{ ...buttonStyle, color: '#ffb38a' }}
          >
            Cancel concoction
          </button>
          {node.spellQueue.state === 'ready' && (
            <button
              onClick={() => {
                session.targetingFromLabId = node.id;
              }}
              style={{ ...buttonStyle, color: '#9be29b' }}
            >
              Cast on click…
            </button>
          )}
        </div>
      )}

      {isOwn && renderUpgradeButtons(engine, node)}
    </div>
  );
}

function renderUpgradeButtons(engine: GameEngine, node: ReturnType<GameEngine['world']['nodes']['get']>) {
  if (!node) return null;
  const typeDef = engine.content.nodeTypes[node.nodeType];
  if (!typeDef) return null;

  const opts: { label: string; cost: number; onPick: () => void }[] = [];

  if (node.nodeType === 'house') {
    const targets = typeDef.upgradeTargets ?? [];
    for (const t of targets) {
      const td = engine.content.nodeTypes[t];
      const lv1 = td?.levels.find((l) => l.level === 1);
      if (!lv1 || lv1.upgradeCostFromHouse === undefined) continue;
      opts.push({
        label: `→ ${capitalize(t)} L1`,
        cost: lv1.upgradeCostFromHouse,
        onPick: () => engine.upgradeNode(node.id, t),
      });
    }
  } else {
    const next = typeDef.levels.find((l) => l.level === node.level + 1);
    if (next && next.upgradeCost !== undefined) {
      opts.push({
        label: `${capitalize(node.nodeType)} L${node.level} → L${next.level}`,
        cost: next.upgradeCost,
        onPick: () => engine.upgradeNode(node.id),
      });
    }
  }

  if (opts.length === 0) return null;

  return (
    <div style={sectionStyle}>
      <div style={sectionLabel}>Upgrade</div>
      {opts.map((o, i) => {
        const affordable = node.units >= o.cost;
        return (
          <button
            key={i}
            onClick={o.onPick}
            disabled={!affordable}
            style={{
              ...buttonStyle,
              opacity: affordable ? 1 : 0.45,
              cursor: affordable ? 'pointer' : 'not-allowed',
            }}
          >
            <span>{o.label}</span>
            <span style={costStyle}>{o.cost}u</span>
          </button>
        );
      })}
    </div>
  );
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function spellLabel(engine: GameEngine, id: string, state: 'concocting' | 'ready'): string {
  const sp = engine.content.spells[id];
  return `${state === 'ready' ? 'Spell ready' : 'Concocting'}: ${sp?.name ?? id}`;
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 56,
  right: 16,
  width: 240,
  background: 'rgba(20, 22, 28, 0.96)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 6,
  padding: 10,
  fontFamily: 'system-ui, sans-serif',
  fontSize: 12,
  color: '#e8e8e8',
  zIndex: 8,
  pointerEvents: 'auto',
  boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginBottom: 6,
  paddingBottom: 6,
  borderBottom: '1px solid rgba(255,255,255,0.10)',
};

const dotStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 10,
  height: 10,
  borderRadius: '50%',
};

const titleStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 13,
  flex: 1,
};

const ownerLabelStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.65,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '2px 0',
};

const valueStyle: React.CSSProperties = {
  opacity: 0.85,
};

const sectionStyle: React.CSSProperties = {
  marginTop: 8,
  paddingTop: 8,
  borderTop: '1px solid rgba(255,255,255,0.10)',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  opacity: 0.55,
};

const buttonStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 4,
  padding: '5px 8px',
  color: '#e8e8e8',
  fontSize: 12,
  textAlign: 'left',
};

const costStyle: React.CSSProperties = {
  opacity: 0.7,
  marginLeft: 8,
};

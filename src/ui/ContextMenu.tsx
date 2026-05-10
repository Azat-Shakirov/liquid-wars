// Right-click context menu for an owned node. Surfaces:
//   - Upgrade options (within-type or House conversion).
//   - Lab spell options (concoct / cancel / cast) per SPEC §7.4.

import type { GameEngine } from '../engine/GameEngine';
import type { ContextMenuRequest, SessionState } from '../render/SessionState';

interface ContextMenuProps {
  engine: GameEngine;
  request: ContextMenuRequest;
  session: SessionState;
  onClose: () => void;
}

interface MenuOption {
  label: string;
  cost?: number;
  affordable: boolean;
  onPick: () => void;
  emphasis?: 'cast' | 'cancel';
}

export function ContextMenu({ engine, request, session, onClose }: ContextMenuProps) {
  const node = engine.world.nodes.get(request.nodeId);
  if (!node || node.ownerId !== engine.world.humanPlayerId) {
    return null;
  }

  const typeDef = engine.content.nodeTypes[node.nodeType];
  if (!typeDef) return null;

  const options: MenuOption[] = [];

  // Lab spell controls take precedence over upgrade controls when busy.
  if (node.nodeType === 'lab') {
    const queue = node.spellQueue;
    if (queue && queue.state === 'concocting') {
      const spell = engine.content.spells[queue.spellId];
      const pct = Math.round(queue.progress * 100);
      options.push({
        label: `Cancel ${spell?.name ?? queue.spellId} (${pct}%)`,
        affordable: true,
        emphasis: 'cancel',
        onPick: () => {
          engine.cancelConcoction(node.id);
          onClose();
        },
      });
    } else if (queue && queue.state === 'ready') {
      const spell = engine.content.spells[queue.spellId];
      options.push({
        label: `Cast ${spell?.name ?? queue.spellId}…`,
        affordable: true,
        emphasis: 'cast',
        onPick: () => {
          // Enter targeting mode. The next left-click on any node
          // calls engine.castSpell via InputController.
          session.targetingFromLabId = node.id;
          onClose();
        },
      });
      options.push({
        label: 'Cancel',
        affordable: true,
        emphasis: 'cancel',
        onPick: () => {
          engine.cancelConcoction(node.id);
          onClose();
        },
      });
    } else {
      // Idle Lab — list spells unlocked at this Lab's level.
      const lv = typeDef.levels.find((l) => l.level === node.level);
      const unlocked = lv?.unlockedSpells ?? [];
      for (const sid of unlocked) {
        const spell = engine.content.spells[sid];
        if (!spell) continue;
        const cost = spell.unitCost;
        options.push({
          label: `Concoct ${spell.name}`,
          cost,
          affordable: node.units >= cost,
          onPick: () => {
            engine.startConcoction(node.id, sid);
            onClose();
          },
        });
      }
    }
  }

  // Upgrade options. House conversion (only on Houses) or within-type
  // level up (any other type when not at max level).
  if (node.nodeType === 'house') {
    const targets = typeDef.upgradeTargets ?? [];
    for (const t of targets) {
      const targetDef = engine.content.nodeTypes[t];
      if (!targetDef) continue;
      const lv1 = targetDef.levels.find((l) => l.level === 1);
      if (!lv1 || lv1.upgradeCostFromHouse === undefined) continue;
      const cost = lv1.upgradeCostFromHouse;
      options.push({
        label: `→ ${capitalize(t)} L1`,
        cost,
        affordable: node.units >= cost,
        onPick: () => {
          engine.upgradeNode(node.id, t);
          onClose();
        },
      });
    }
  } else {
    const nextLv = typeDef.levels.find((l) => l.level === node.level + 1);
    if (nextLv && nextLv.upgradeCost !== undefined) {
      const cost = nextLv.upgradeCost;
      options.push({
        label: `${capitalize(node.nodeType)} L${node.level} → L${nextLv.level}`,
        cost,
        affordable: node.units >= cost,
        onPick: () => {
          engine.upgradeNode(node.id);
          onClose();
        },
      });
    }
  }

  if (options.length === 0) {
    return (
      <MenuShell pos={request.position} onClose={onClose}>
        <div style={emptyRow}>Nothing available</div>
      </MenuShell>
    );
  }

  return (
    <MenuShell pos={request.position} onClose={onClose}>
      {options.map((opt, idx) => (
        <button
          key={idx}
          onClick={opt.onPick}
          disabled={!opt.affordable}
          style={{
            ...rowStyle,
            opacity: opt.affordable ? 1 : 0.45,
            cursor: opt.affordable ? 'pointer' : 'not-allowed',
            color:
              opt.emphasis === 'cast'
                ? '#9be29b'
                : opt.emphasis === 'cancel'
                ? '#ffb38a'
                : '#e8e8e8',
          }}
        >
          <span>{opt.label}</span>
          {opt.cost !== undefined && <span style={costStyle}>{opt.cost}u</span>}
        </button>
      ))}
    </MenuShell>
  );
}

function MenuShell({
  pos,
  onClose,
  children,
}: {
  pos: { x: number; y: number };
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} style={backdrop} />
      <div
        onContextMenu={(e) => e.preventDefault()}
        style={{
          ...menuStyle,
          left: pos.x,
          top: pos.y,
        }}
      >
        {children}
      </div>
    </>
  );
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'transparent',
  zIndex: 9,
};

const menuStyle: React.CSSProperties = {
  position: 'fixed',
  zIndex: 10,
  minWidth: 180,
  background: 'rgba(20, 22, 28, 0.96)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 6,
  padding: 4,
  boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
  color: '#e8e8e8',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  textAlign: 'left',
  padding: '6px 10px',
  borderRadius: 4,
  fontSize: 13,
};

const costStyle: React.CSSProperties = {
  opacity: 0.7,
  marginLeft: 12,
};

const emptyRow: React.CSSProperties = {
  padding: '6px 10px',
  opacity: 0.65,
};

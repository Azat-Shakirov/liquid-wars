// Right-click context menu for an owned node. Phase 2 currently
// surfaces upgrade options; spell options will be added in Slice C.

import type { GameEngine } from '../engine/GameEngine';
import type { ContextMenuRequest } from '../render/SessionState';

interface ContextMenuProps {
  engine: GameEngine;
  request: ContextMenuRequest;
  onClose: () => void;
}

interface UpgradeOption {
  label: string;
  cost: number;
  affordable: boolean;
  onPick: () => void;
}

export function ContextMenu({ engine, request, onClose }: ContextMenuProps) {
  const node = engine.world.nodes.get(request.nodeId);
  if (!node || node.ownerId !== engine.world.humanPlayerId) {
    return null;
  }

  const typeDef = engine.content.nodeTypes[node.nodeType];
  if (!typeDef) return null;

  const options: UpgradeOption[] = [];

  if (node.nodeType === 'house') {
    // House conversion options.
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
    // Within-type level up.
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
        <div style={emptyRow}>No upgrades available</div>
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
          }}
        >
          <span>{opt.label}</span>
          <span style={costStyle}>{opt.cost}u</span>
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

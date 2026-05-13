// EditorView — dev-only level editor. Pick a level, drag nodes / walls
// to new positions, add/remove nodes + walls, change unit counts.
// Export the result as JSON (download + copy-to-clipboard).
//
// v2.7.3. Gated on import.meta.env.DEV at the MainMenu button level.
// The component itself works in any build; it just isn't reachable from
// the production main menu.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSessionStore } from '../../store/sessionStore';
import { loadContent } from '../../engine/content/ContentLoader';
import { LevelSchema } from '../../engine/content/schemas';
import type {
  ContentLibrary,
  LevelDef,
  LevelNodeDef,
  LevelPlayerDef,
} from '../../engine/content/ContentLibrary';
import type { LiquidId, NodeTypeId } from '../../types';

// Wall shape is defined inline on LevelDef.terrain; alias it here for the
// editor's local helpers without modifying the public type.
type WallDef = LevelDef['terrain']['walls'][number];

const CANVAS_W = 1280;
const CANVAS_H = 720;
const NODE_R = 22; // editor visual radius (matches in-game L1 barracks roughly).
const WALL_HIT_PX = 8;
const WALL_ENDPOINT_HIT_PX = 12;

type Tool = 'select' | 'addNode' | 'addWall' | 'delete';

interface SelectedNode { kind: 'node'; id: string }
interface SelectedWallEndpoint { kind: 'wallEndpoint'; wallId: string; index: 0 | 1 }
interface SelectedWall { kind: 'wall'; wallId: string }
type Selection = SelectedNode | SelectedWallEndpoint | SelectedWall | null;

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

function newLevel(id: number): LevelDef {
  return {
    id,
    name: `Level ${id}`,
    tutorialKey: null,
    introducesNodeTypes: [],
    introducesLiquids: [],
    map: { width: CANVAS_W, height: CANVAS_H, background: 'stone' },
    terrain: { walls: [] },
    players: [
      { id: 'p1',  type: 'human', color: '#3da9fc', liquid: 'water' as LiquidId },
      { id: 'ai1', type: 'ai',    color: '#e63946', liquid: 'water' as LiquidId },
    ],
    nodes: [],
    winCondition: { type: 'controlAll' },
    starThresholds: { time: [600000, 480000, 360000], units: [200, 150, 100] },
  };
}

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

function distPointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return Math.sqrt(apx * apx + apy * apy);
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx, cy = ay + t * aby;
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}

function ownerColor(level: LevelDef, ownerId: string | null): string {
  if (ownerId === null) return '#7a8090';
  const p = level.players.find((pp) => pp.id === ownerId);
  return p?.color ?? '#888';
}

function nextNodeId(level: LevelDef, ownerId: string | null): string {
  const prefix = ownerId === null ? 'n' : ownerId;
  let i = 1;
  while (level.nodes.find((n) => n.id === `${prefix}_${i}`)) i++;
  return `${prefix}_${i}`;
}

function nextWallId(level: LevelDef): string {
  let i = 1;
  while (level.terrain.walls.find((w) => w.id === `w_${i}`)) i++;
  return `w_${i}`;
}

export function EditorView() {
  const navigate = useSessionStore((s) => s.navigate);
  const content = useMemo<ContentLibrary>(() => loadContent(), []);
  const liquidIds = useMemo(() => Object.keys(content.liquids).sort(), [content.liquids]);
  const sortedLevelIds = useMemo(
    () => Object.keys(content.levels).map(Number).sort((a, b) => a - b),
    [content.levels],
  );

  const [levelId, setLevelId] = useState<number>(sortedLevelIds[0] ?? 1);
  const [level, setLevel] = useState<LevelDef>(() => deepClone(content.levels[levelId] ?? newLevel(levelId)));
  const [tool, setTool] = useState<Tool>('select');
  const [selection, setSelection] = useState<Selection>(null);
  const [drag, setDrag] = useState<{ kind: 'node' | 'wallEndpoint'; id: string; index?: 0 | 1 } | null>(null);
  const [addWallFirstPoint, setAddWallFirstPoint] = useState<[number, number] | null>(null);
  // v2.7.5: editor's Add Node defaults to neutral house with 10u so the
  // common case (sprinkle neutral capture targets across the map) is the
  // single-click default. Was: 'p1' / 'barracks' / 10u.
  const [addNodeOwner, setAddNodeOwner] = useState<string | null>(null);
  const [addNodeType, setAddNodeType] = useState<NodeTypeId>('house');
  const [addNodeLevel, setAddNodeLevel] = useState<number>(1);
  const [addNodeUnits, setAddNodeUnits] = useState<number>(10);
  const [exportToast, setExportToast] = useState<string | null>(null);

  // Reload the level when the dropdown changes.
  useEffect(() => {
    setLevel(deepClone(content.levels[levelId] ?? newLevel(levelId)));
    setSelection(null);
    setAddWallFirstPoint(null);
  }, [levelId, content.levels]);

  // Render every state change to a backing canvas.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    // Background.
    ctx.fillStyle = '#15171c';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // Grid.
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= CANVAS_W; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
    }
    for (let y = 0; y <= CANVAS_H; y += 80) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
    }
    // Walls.
    for (const w of level.terrain.walls) {
      const [a, b] = w.points;
      if (!a || !b) continue;
      const isSelected =
        (selection?.kind === 'wall' && selection.wallId === w.id) ||
        (selection?.kind === 'wallEndpoint' && selection.wallId === w.id);
      ctx.strokeStyle = isSelected ? '#f5c95b' : '#dde3ec';
      ctx.lineWidth = isSelected ? 8 : 6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      // Endpoint handles.
      for (let i = 0; i < 2; i++) {
        const p = w.points[i]!;
        const epSelected = selection?.kind === 'wallEndpoint' && selection.wallId === w.id && selection.index === i;
        ctx.fillStyle = epSelected ? '#f5c95b' : '#9aa2b1';
        ctx.beginPath();
        ctx.arc(p[0], p[1], 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Add-wall preview.
    if (tool === 'addWall' && addWallFirstPoint && hover) {
      ctx.strokeStyle = 'rgba(245, 201, 91, 0.6)';
      ctx.lineWidth = 6;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(addWallFirstPoint[0], addWallFirstPoint[1]);
      ctx.lineTo(hover.x, hover.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Nodes.
    for (const n of level.nodes) {
      const color = ownerColor(level, n.ownerId);
      const isSelected = selection?.kind === 'node' && selection.id === n.id;
      const r = NODE_R + (n.level - 1) * 2;
      // Shape outline by node type.
      ctx.fillStyle = color;
      ctx.strokeStyle = isSelected ? '#f5c95b' : 'rgba(0,0,0,0.45)';
      ctx.lineWidth = isSelected ? 4 : 2;
      ctx.beginPath();
      if (n.nodeType === 'barracks') {
        const rr = r;
        ctx.roundRect(n.position[0] - rr, n.position[1] - rr, rr * 2, rr * 2, 6);
      } else if (n.nodeType === 'tower') {
        // Hexagon.
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 2;
          const x = n.position[0] + r * Math.cos(a);
          const y = n.position[1] + r * Math.sin(a);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
      } else if (n.nodeType === 'lab') {
        for (let i = 0; i < 3; i++) {
          const a = (2 * Math.PI / 3) * i - Math.PI / 2;
          const x = n.position[0] + r * Math.cos(a);
          const y = n.position[1] + r * Math.sin(a);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
      } else { // house
        ctx.arc(n.position[0], n.position[1], r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
      // Unit count + id.
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n.units), n.position[0], n.position[1] - 2);
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillText(`${n.id} · L${n.level}`, n.position[0], n.position[1] + r + 10);
    }
    // Add-node ghost.
    if (tool === 'addNode' && hover) {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = ownerColor(level, addNodeOwner);
      ctx.beginPath();
      ctx.arc(hover.x, hover.y, NODE_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }, [level, selection, tool, hover, addWallFirstPoint, addNodeOwner]);

  // Hit testing.
  function hitNode(x: number, y: number): LevelNodeDef | null {
    for (let i = level.nodes.length - 1; i >= 0; i--) {
      const n = level.nodes[i]!;
      const r = NODE_R + (n.level - 1) * 2;
      if (distSq(x, y, n.position[0], n.position[1]) <= r * r) return n;
    }
    return null;
  }
  function hitWallEndpoint(x: number, y: number): { wall: WallDef; index: 0 | 1 } | null {
    for (const w of level.terrain.walls) {
      for (let i = 0; i < 2; i++) {
        const p = w.points[i]!;
        if (distSq(x, y, p[0], p[1]) <= WALL_ENDPOINT_HIT_PX * WALL_ENDPOINT_HIT_PX) {
          return { wall: w, index: i as 0 | 1 };
        }
      }
    }
    return null;
  }
  function hitWall(x: number, y: number): WallDef | null {
    for (const w of level.terrain.walls) {
      const [a, b] = w.points;
      if (!a || !b) continue;
      if (distPointToSegment(x, y, a[0], a[1], b[0], b[1]) <= WALL_HIT_PX) return w;
    }
    return null;
  }

  function getEventPos(e: React.PointerEvent): { x: number; y: number } {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_H;
    return { x: Math.max(0, Math.min(CANVAS_W, x)), y: Math.max(0, Math.min(CANVAS_H, y)) };
  }

  function handlePointerDown(e: React.PointerEvent) {
    const { x, y } = getEventPos(e);
    const node = hitNode(x, y);
    const wallEp = !node ? hitWallEndpoint(x, y) : null;
    const wall = !node && !wallEp ? hitWall(x, y) : null;

    if (tool === 'addNode') {
      if (node) return; // can't stack
      const id = nextNodeId(level, addNodeOwner);
      const newNode: LevelNodeDef = {
        id,
        position: [Math.round(x), Math.round(y)],
        ownerId: addNodeOwner,
        nodeType: addNodeType,
        level: addNodeLevel,
        liquidType: addNodeOwner
          ? (level.players.find((p) => p.id === addNodeOwner)?.liquid ?? 'water')
          : 'water',
        units: addNodeUnits,
      };
      setLevel((lv) => ({ ...lv, nodes: [...lv.nodes, newNode] }));
      setSelection({ kind: 'node', id });
      setTool('select');
      return;
    }
    if (tool === 'addWall') {
      if (!addWallFirstPoint) {
        setAddWallFirstPoint([Math.round(x), Math.round(y)]);
      } else {
        const newWall: WallDef = {
          id: nextWallId(level),
          points: [
            [addWallFirstPoint[0], addWallFirstPoint[1]],
            [Math.round(x), Math.round(y)],
          ],
        };
        setLevel((lv) => ({ ...lv, terrain: { ...lv.terrain, walls: [...lv.terrain.walls, newWall] } }));
        setAddWallFirstPoint(null);
        setTool('select');
      }
      return;
    }
    if (tool === 'delete') {
      if (node) {
        setLevel((lv) => ({ ...lv, nodes: lv.nodes.filter((n) => n.id !== node.id) }));
      } else if (wallEp) {
        setLevel((lv) => ({ ...lv, terrain: { ...lv.terrain, walls: lv.terrain.walls.filter((w) => w.id !== wallEp.wall.id) } }));
      } else if (wall) {
        setLevel((lv) => ({ ...lv, terrain: { ...lv.terrain, walls: lv.terrain.walls.filter((w) => w.id !== wall.id) } }));
      }
      setSelection(null);
      setTool('select');
      return;
    }
    // tool === 'select'
    if (node) {
      setSelection({ kind: 'node', id: node.id });
      setDrag({ kind: 'node', id: node.id });
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } else if (wallEp) {
      setSelection({ kind: 'wallEndpoint', wallId: wallEp.wall.id, index: wallEp.index });
      setDrag({ kind: 'wallEndpoint', id: wallEp.wall.id, index: wallEp.index });
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } else if (wall) {
      setSelection({ kind: 'wall', wallId: wall.id });
    } else {
      setSelection(null);
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const pos = getEventPos(e);
    setHover(pos);
    if (!drag) return;
    if (drag.kind === 'node') {
      setLevel((lv) => ({
        ...lv,
        nodes: lv.nodes.map((n) =>
          n.id === drag.id ? { ...n, position: [Math.round(pos.x), Math.round(pos.y)] } : n,
        ),
      }));
    } else if (drag.kind === 'wallEndpoint' && drag.index !== undefined) {
      const idx = drag.index;
      setLevel((lv) => ({
        ...lv,
        terrain: {
          ...lv.terrain,
          walls: lv.terrain.walls.map((w) => {
            if (w.id !== drag.id) return w;
            const next = w.points.map((p, i) => (i === idx ? [Math.round(pos.x), Math.round(pos.y)] as [number, number] : p));
            return { ...w, points: next as WallDef['points'] };
          }),
        },
      }));
    }
  }

  function handlePointerUp() {
    setDrag(null);
  }

  // Keyboard shortcut: Delete / Backspace removes selection.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!selection) return;
        if (selection.kind === 'node') {
          setLevel((lv) => ({ ...lv, nodes: lv.nodes.filter((n) => n.id !== selection.id) }));
        } else if (selection.kind === 'wall' || selection.kind === 'wallEndpoint') {
          setLevel((lv) => ({ ...lv, terrain: { ...lv.terrain, walls: lv.terrain.walls.filter((w) => w.id !== selection.wallId) } }));
        }
        setSelection(null);
      } else if (e.key === 'Escape') {
        setSelection(null);
        setAddWallFirstPoint(null);
        setTool('select');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection]);

  function exportJson(action: 'download' | 'clipboard') {
    const text = JSON.stringify(level, null, 2);
    if (action === 'download') {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${String(level.id).padStart(3, '0')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportToast(`Downloaded ${a.download}`);
    } else {
      navigator.clipboard.writeText(text).then(
        () => setExportToast('Copied to clipboard'),
        () => setExportToast('Clipboard failed — see console'),
      );
    }
    setTimeout(() => setExportToast(null), 2200);
  }

  async function saveToFile() {
    // Validate against the same schema the engine uses at load. Bad
    // payloads stop here instead of clobbering a file on disk.
    const parsed = LevelSchema.safeParse(level);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const path = first ? first.path.join('.') : '';
      const msg = first ? first.message : 'unknown validation error';
      setExportToast(`Invalid level: ${path ? path + ' — ' : ''}${msg}`);
      setTimeout(() => setExportToast(null), 4000);
      return;
    }
    try {
      const r = await fetch('/__editor/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: level.id, json: level }),
      });
      const result = (await r.json()) as { ok: boolean; path?: string; error?: string };
      if (result.ok) {
        setExportToast(`Saved ${result.path}`);
      } else {
        setExportToast(`Save failed: ${result.error ?? 'unknown error'}`);
      }
    } catch (err) {
      setExportToast(`Save failed: ${(err as Error).message} (is the dev server running?)`);
    }
    setTimeout(() => setExportToast(null), 3000);
  }

  function updateNode(id: string, patch: Partial<LevelNodeDef>) {
    setLevel((lv) => ({
      ...lv,
      nodes: lv.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));
  }

  function updatePlayerLiquid(playerId: string, liquid: LiquidId) {
    setLevel((lv) => ({
      ...lv,
      players: lv.players.map((p) => (p.id === playerId ? { ...p, liquid } : p)),
      nodes: lv.nodes.map((n) => (n.ownerId === playerId ? { ...n, liquidType: liquid } : n)),
    }));
  }

  function addPlayer() {
    const aiCount = level.players.filter((p) => p.type === 'ai').length;
    const id = `ai${aiCount + 1}`;
    const palette = ['#e63946', '#1a1a24', '#5cd65c', '#a01010', '#7a3da9'];
    const color = palette[aiCount % palette.length]!;
    const newPlayer: LevelPlayerDef = { id, type: 'ai', color, liquid: 'water' as LiquidId };
    setLevel((lv) => ({ ...lv, players: [...lv.players, newPlayer] }));
  }

  function removePlayer(playerId: string) {
    if (playerId === 'p1') return; // never remove human
    setLevel((lv) => ({
      ...lv,
      players: lv.players.filter((p) => p.id !== playerId),
      nodes: lv.nodes.filter((n) => n.ownerId !== playerId),
    }));
  }

  const selectedNode = selection?.kind === 'node' ? level.nodes.find((n) => n.id === selection.id) ?? null : null;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700, letterSpacing: '0.05em' }}>LEVEL EDITOR (dev)</span>
        <select
          value={levelId}
          onChange={(e) => setLevelId(Number(e.target.value))}
          style={selectStyle}
        >
          {sortedLevelIds.map((id) => (
            <option key={id} value={id}>L{id} — {content.levels[id]?.name}</option>
          ))}
          <option value={9999}>(new blank level)</option>
        </select>
        <input
          type="text"
          value={level.name}
          onChange={(e) => setLevel({ ...level, name: e.target.value })}
          style={{ ...selectStyle, minWidth: 180 }}
          placeholder="level name"
        />
        <input
          type="number"
          value={level.id}
          onChange={(e) => setLevel({ ...level, id: Number(e.target.value) })}
          style={{ ...selectStyle, width: 80 }}
        />
        <div style={{ flex: 1 }} />
        <button style={{ ...smallButtonStyle, background: '#3da9fc', color: '#0a1018', fontWeight: 700 }} onClick={saveToFile}>
          Save
        </button>
        <button style={smallButtonStyle} onClick={() => exportJson('clipboard')}>Copy JSON</button>
        <button style={smallButtonStyle} onClick={() => exportJson('download')}>Download</button>
        <button style={smallButtonStyle} onClick={() => navigate('menu')}>← Menu</button>
      </div>

      <div style={bodyStyle}>
        <div style={canvasWrapStyle}>
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            style={canvasStyle}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => setHover(null)}
          />
          <div style={toolbarStyle}>
            {(['select', 'addNode', 'addWall', 'delete'] as Tool[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTool(t); setAddWallFirstPoint(null); }}
                style={{ ...toolButtonStyle, background: tool === t ? '#3da9fc' : 'rgba(255,255,255,0.08)' }}
              >
                {t === 'select' ? 'Select' : t === 'addNode' ? 'Add Node' : t === 'addWall' ? 'Add Wall' : 'Delete'}
              </button>
            ))}
            {tool === 'addNode' && (
              <div style={addNodeRowStyle}>
                <span style={inlineLabelStyle}>owner</span>
                <select
                  value={addNodeOwner ?? '__neutral__'}
                  onChange={(e) => setAddNodeOwner(e.target.value === '__neutral__' ? null : e.target.value)}
                  style={selectStyle}
                >
                  {level.players.map((p) => (
                    <option key={p.id} value={p.id}>{p.id} ({p.type})</option>
                  ))}
                  <option value="__neutral__">neutral</option>
                </select>
                <span style={inlineLabelStyle}>type</span>
                <select value={addNodeType} onChange={(e) => setAddNodeType(e.target.value as NodeTypeId)} style={selectStyle}>
                  <option value="barracks">barracks</option>
                  <option value="lab">lab</option>
                  <option value="tower">tower</option>
                  <option value="house">house</option>
                </select>
                <span style={inlineLabelStyle}>L</span>
                <input type="number" min={1} max={5} value={addNodeLevel} onChange={(e) => setAddNodeLevel(Number(e.target.value))} style={{ ...selectStyle, width: 50 }} />
                <span style={inlineLabelStyle}>units</span>
                <input type="number" min={0} value={addNodeUnits} onChange={(e) => setAddNodeUnits(Number(e.target.value))} style={{ ...selectStyle, width: 60 }} />
              </div>
            )}
            {tool === 'addWall' && (
              <span style={{ marginLeft: 12, color: '#cdd3dd', fontSize: 12 }}>
                {addWallFirstPoint ? 'Click second endpoint…' : 'Click first endpoint…'} (Esc cancels)
              </span>
            )}
          </div>
        </div>

        <div style={sidebarStyle}>
          <h3 style={sectionTitleStyle}>Players</h3>
          {level.players.map((p) => (
            <div key={p.id} style={playerRowStyle}>
              <span style={{ ...colorChip, background: p.color }} />
              <span style={{ minWidth: 36 }}>{p.id}</span>
              <span style={{ opacity: 0.6, fontSize: 11 }}>{p.type}</span>
              <select
                value={p.liquid}
                onChange={(e) => updatePlayerLiquid(p.id, e.target.value as LiquidId)}
                style={{ ...selectStyle, flex: 1 }}
              >
                {liquidIds.map((lid) => <option key={lid} value={lid}>{lid}</option>)}
              </select>
              {p.id !== 'p1' && (
                <button style={smallButtonStyle} onClick={() => removePlayer(p.id)}>×</button>
              )}
            </div>
          ))}
          <button style={{ ...smallButtonStyle, marginTop: 6 }} onClick={addPlayer}>+ Add AI</button>

          <h3 style={sectionTitleStyle}>Selected Node</h3>
          {!selectedNode && (
            <div style={hintStyle}>
              Click a node to edit. Click empty space (with Select tool) to deselect.
            </div>
          )}
          {selectedNode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={fieldStyle}>
                <span style={inlineLabelStyle}>id</span>
                <input type="text" value={selectedNode.id}
                  onChange={(e) => updateNode(selectedNode.id, { id: e.target.value })}
                  style={{ ...selectStyle, flex: 1 }} />
              </div>
              <div style={fieldStyle}>
                <span style={inlineLabelStyle}>owner</span>
                <select
                  value={selectedNode.ownerId ?? '__neutral__'}
                  onChange={(e) => {
                    const v = e.target.value === '__neutral__' ? null : e.target.value;
                    const liquid = v
                      ? (level.players.find((p) => p.id === v)?.liquid ?? selectedNode.liquidType)
                      : selectedNode.liquidType;
                    updateNode(selectedNode.id, { ownerId: v, liquidType: liquid });
                  }}
                  style={{ ...selectStyle, flex: 1 }}
                >
                  {level.players.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
                  <option value="__neutral__">neutral</option>
                </select>
              </div>
              <div style={fieldStyle}>
                <span style={inlineLabelStyle}>type</span>
                <select value={selectedNode.nodeType}
                  onChange={(e) => updateNode(selectedNode.id, { nodeType: e.target.value as NodeTypeId })}
                  style={{ ...selectStyle, flex: 1 }}>
                  <option value="barracks">barracks</option>
                  <option value="lab">lab</option>
                  <option value="tower">tower</option>
                  <option value="house">house</option>
                </select>
              </div>
              <div style={fieldStyle}>
                <span style={inlineLabelStyle}>level</span>
                <input type="number" min={1} max={5} value={selectedNode.level}
                  onChange={(e) => updateNode(selectedNode.id, { level: Number(e.target.value) })}
                  style={{ ...selectStyle, width: 60 }} />
              </div>
              <div style={fieldStyle}>
                <span style={inlineLabelStyle}>units</span>
                <input type="number" min={0} value={selectedNode.units}
                  onChange={(e) => updateNode(selectedNode.id, { units: Number(e.target.value) })}
                  style={{ ...selectStyle, width: 80 }} />
              </div>
              <div style={fieldStyle}>
                <span style={inlineLabelStyle}>liquid</span>
                <select value={selectedNode.liquidType}
                  onChange={(e) => updateNode(selectedNode.id, { liquidType: e.target.value })}
                  style={{ ...selectStyle, flex: 1 }}>
                  {liquidIds.map((lid) => <option key={lid} value={lid}>{lid}</option>)}
                </select>
              </div>
              <div style={fieldStyle}>
                <span style={inlineLabelStyle}>pos</span>
                <input type="number" value={selectedNode.position[0]}
                  onChange={(e) => updateNode(selectedNode.id, { position: [Number(e.target.value), selectedNode.position[1]] })}
                  style={{ ...selectStyle, width: 70 }} />
                <input type="number" value={selectedNode.position[1]}
                  onChange={(e) => updateNode(selectedNode.id, { position: [selectedNode.position[0], Number(e.target.value)] })}
                  style={{ ...selectStyle, width: 70 }} />
              </div>
              <button style={{ ...smallButtonStyle, marginTop: 4, background: '#a01010' }}
                onClick={() => {
                  setLevel((lv) => ({ ...lv, nodes: lv.nodes.filter((n) => n.id !== selectedNode.id) }));
                  setSelection(null);
                }}>
                Delete Node
              </button>
            </div>
          )}

          <h3 style={sectionTitleStyle}>Stats</h3>
          <div style={statsStyle}>
            <div>nodes: {level.nodes.length}</div>
            <div>walls: {level.terrain.walls.length}</div>
            <div>players: {level.players.length}</div>
            <div style={{ marginTop: 4, fontSize: 11, opacity: 0.7 }}>Esc deselects, Del/Backspace removes selection</div>
          </div>
        </div>
      </div>

      {exportToast && (
        <div style={toastStyle}>{exportToast}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────
const containerStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: '#0d0f13', color: '#e8e8e8',
  fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column',
};
const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
  borderBottom: '1px solid rgba(255,255,255,0.1)', background: '#15171c',
};
const bodyStyle: React.CSSProperties = { display: 'flex', flex: 1, minHeight: 0 };
const canvasWrapStyle: React.CSSProperties = {
  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'flex-start', padding: 12, gap: 8, minWidth: 0,
};
const canvasStyle: React.CSSProperties = {
  maxWidth: '100%', maxHeight: 'calc(100vh - 180px)', width: 'auto', height: 'auto',
  aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
  border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, background: '#15171c',
  cursor: 'crosshair', userSelect: 'none',
};
const toolbarStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
};
const toolButtonStyle: React.CSSProperties = {
  padding: '6px 14px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4,
  color: '#e8e8e8', fontSize: 12, cursor: 'pointer',
};
const addNodeRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8,
};
const inlineLabelStyle: React.CSSProperties = { fontSize: 11, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.06em' };
const selectStyle: React.CSSProperties = {
  background: '#1c1f26', color: '#e8e8e8', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 4, padding: '4px 8px', fontSize: 12,
};
const smallButtonStyle: React.CSSProperties = {
  padding: '6px 12px', background: 'rgba(255,255,255,0.08)', color: '#e8e8e8',
  border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, fontSize: 12, cursor: 'pointer',
};
const sidebarStyle: React.CSSProperties = {
  width: 280, padding: 14, borderLeft: '1px solid rgba(255,255,255,0.1)',
  background: '#15171c', overflowY: 'auto', display: 'flex', flexDirection: 'column',
};
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
  color: '#7a8090', margin: '14px 0 6px',
};
const playerRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 };
const colorChip: React.CSSProperties = { width: 14, height: 14, borderRadius: 3, border: '1px solid rgba(255,255,255,0.2)' };
const fieldStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 };
const hintStyle: React.CSSProperties = { fontSize: 12, color: '#8a92a0', lineHeight: 1.5 };
const statsStyle: React.CSSProperties = { fontSize: 12, color: '#cdd3dd', lineHeight: 1.7 };
const toastStyle: React.CSSProperties = {
  position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
  background: '#3da9fc', color: '#0a1018', padding: '10px 18px', borderRadius: 6, fontWeight: 600,
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
};

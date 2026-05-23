import type { ChainEdge, ChainNode } from "./types";

// Simple longest-path layered layout (left-to-right) — no external dep needed.
// Each node's column = length of longest path from any root to it.
// Rows within a column are distributed vertically with even spacing.

export interface LaidOutNode {
  id: string;
  x: number;
  y: number;
}

const COL_WIDTH = 240;
const ROW_HEIGHT = 110;
const X_OFFSET = 40;
const Y_OFFSET = 40;

export function layoutChain(
  nodes: ChainNode[],
  edges: ChainEdge[],
): LaidOutNode[] {
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const n of nodes) {
    incoming.set(n.id, []);
    outgoing.set(n.id, []);
  }
  for (const e of edges) {
    incoming.get(e.to)?.push(e.from);
    outgoing.get(e.from)?.push(e.to);
  }

  // Longest-path level (Coffman-Graham-ish, but unweighted)
  const level = new Map<string, number>();
  const visit = (id: string): number => {
    const cached = level.get(id);
    if (cached !== undefined) return cached;
    const parents = incoming.get(id) ?? [];
    const lvl = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(visit));
    level.set(id, lvl);
    return lvl;
  };
  nodes.forEach((n) => visit(n.id));

  // Group nodes by level, then assign rows
  const byLevel = new Map<number, string[]>();
  for (const n of nodes) {
    const l = level.get(n.id)!;
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l)!.push(n.id);
  }

  const out: LaidOutNode[] = [];
  // Sort nodes within a level by chain step to keep visual order stable
  const stepById = new Map(nodes.map((n) => [n.id, n.step]));
  for (const [lvl, ids] of byLevel.entries()) {
    ids.sort((a, b) => (stepById.get(a) ?? 0) - (stepById.get(b) ?? 0));
    const total = ids.length;
    ids.forEach((id, row) => {
      out.push({
        id,
        x: X_OFFSET + lvl * COL_WIDTH,
        y: Y_OFFSET + row * ROW_HEIGHT - ((total - 1) * ROW_HEIGHT) / 2 + 300,
      });
    });
  }
  return out;
}

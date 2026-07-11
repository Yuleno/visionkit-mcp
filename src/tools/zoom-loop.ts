import { z } from "zod";

export const GridCellSchema = z.object({
  row: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  column: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  reason: z.string().max(500).default(""),
});

const ZoomDecisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("final"), answer: z.string().min(1) }),
  z.object({ action: z.literal("zoom"), cells: z.array(GridCellSchema).min(1) }),
]);

export type GridCell = z.infer<typeof GridCellSchema>;
export type ZoomDecision = z.infer<typeof ZoomDecisionSchema>;

export function parseZoomDecision(text: string): ZoomDecision {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return ZoomDecisionSchema.parse(JSON.parse(trimmed));
}

export function selectZoomCells(
  cells: readonly GridCell[],
  maxCells: number,
  seen: ReadonlySet<string> = new Set()
): { cells: GridCell[]; warnings: string[] } {
  const unique = new Map<string, GridCell>();
  let duplicates = 0;
  for (const cell of cells) {
    const key = `${cell.row}:${cell.column}`;
    if (seen.has(key) || unique.has(key)) duplicates += 1;
    else unique.set(key, cell);
  }
  const selected = [...unique.values()]
    .sort((a, b) => a.row - b.row || a.column - b.column)
    .slice(0, Math.max(0, maxCells));
  const warnings: string[] = [];
  if (duplicates) warnings.push(`忽略 ${duplicates} 个重复 Zoom 区域`);
  if (unique.size > selected.length) warnings.push(`Zoom 区域按图片预算截断为 ${selected.length} 个`);
  return { cells: selected, warnings };
}

export function gridCellToRegion(
  width: number,
  height: number,
  cell: Pick<GridCell, "row" | "column">,
  overlapRatio = 0.08
) {
  const baseLeft = Math.floor((cell.column * width) / 3);
  const baseRight = Math.floor(((cell.column + 1) * width) / 3);
  const baseTop = Math.floor((cell.row * height) / 3);
  const baseBottom = Math.floor(((cell.row + 1) * height) / 3);
  const padX = Math.floor(width * overlapRatio / 2);
  const padY = Math.floor(height * overlapRatio / 2);
  const left = Math.max(0, baseLeft - padX);
  const top = Math.max(0, baseTop - padY);
  const right = Math.min(width, baseRight + padX);
  const bottom = Math.min(height, baseBottom + padY);
  return { left, top, width: right - left, height: bottom - top };
}

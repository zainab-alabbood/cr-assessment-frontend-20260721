import { LineItem } from '../models/cr.models';

export type DiffKind = 'added' | 'removed' | 'changed' | 'unchanged';

export interface DiffRow {
	sku: string;
	kind: DiffKind;
	baseline?: LineItem;
	proposed?: LineItem;
}

/**
 * Compute the line-item diff shown in the preview panel: which SKUs were added, removed, changed,
 * or left unchanged between the baseline and the proposed line items.
 *
 * Heads-up: the change-detection here is not quite right — a line that changed is sometimes reported
 * as unchanged. `diff.spec.ts` surfaces the defect; the root cause lives in this file.
 */
export function computeDiff(baseline: LineItem[], proposed: LineItem[]): DiffRow[] {
	const rows: DiffRow[] = [];
	const proposedBySku = new Map(proposed.map((p) => [p.sku, p]));
	const baselineBySku = new Map(baseline.map((b) => [b.sku, b]));

	for (const b of baseline) {
		const p = proposedBySku.get(b.sku);
		if (!p) {
			rows.push({ sku: b.sku, kind: 'removed', baseline: b });
			continue;
		}

		// Same SKU, but quantity, price or description differs => "changed".
		const changed = b.quantity !== p.quantity || b.unitPrice !== p.unitPrice || b.description !== p.description;
		rows.push({ sku: b.sku, kind: changed ? 'changed' : 'unchanged', baseline: b, proposed: p });
	}

	// Lines that exist only in the proposal are "added" (SKUs not found in the baseline).
	for (const p of proposed) {
		if (!baselineBySku.has(p.sku)) {
			rows.push({ sku: p.sku, kind: 'added', proposed: p });
		}
	}
	return rows;
}

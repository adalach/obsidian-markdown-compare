export type DiffEdit =
	| { type: "equal" }
	| { type: "delete" }
	| { type: "insert" };

function getOrDefault(
	map: Map<number, number>,
	key: number,
	defaultValue: number,
) {
	const value = map.get(key);
	return value === undefined ? defaultValue : value;
}

export function diffMyers<T>(
	a: readonly T[],
	b: readonly T[],
	equals: (left: T, right: T) => boolean,
): DiffEdit[] {
	const n = a.length;
	const m = b.length;
	const max = n + m;

	let v = new Map<number, number>();
	v.set(1, 0);

	const trace: Array<Map<number, number>> = [];

	for (let d = 0; d <= max; d++) {
		const vNext = new Map<number, number>();
		for (let k = -d; k <= d; k += 2) {
			const down =
				k === -d ||
				(k !== d &&
					getOrDefault(v, k - 1, -1) < getOrDefault(v, k + 1, -1));
			let x = down ? getOrDefault(v, k + 1, 0) : getOrDefault(v, k - 1, 0) + 1;
			let y = x - k;

			while (
				x < n &&
				y < m &&
				equals(a[x] as T, b[y] as T)
			) {
				x++;
				y++;
			}

			vNext.set(k, x);

			if (x >= n && y >= m) {
				trace.push(vNext);
				return backtrack(trace, n, m);
			}
		}
		trace.push(vNext);
		v = vNext;
	}

	return [];
}

function backtrack(
	trace: Array<Map<number, number>>,
	aLength: number,
	bLength: number,
): DiffEdit[] {
	let x = aLength;
	let y = bLength;

	const edits: DiffEdit[] = [];

	for (let d = trace.length - 1; d > 0; d--) {
		const vPrev = trace[d - 1];
		if (!vPrev) throw new Error("Invalid diff trace");
		const k = x - y;

		const fromDown =
			k === -d ||
			(k !== d &&
				getOrDefault(vPrev, k - 1, -1) < getOrDefault(vPrev, k + 1, -1));

		const prevK = fromDown ? k + 1 : k - 1;
		const prevX = getOrDefault(vPrev, prevK, 0);
		const prevY = prevX - prevK;

		const xStart = fromDown ? prevX : prevX + 1;
		const yStart = fromDown ? prevY + 1 : prevY;

		while (x > xStart && y > yStart) {
			edits.push({ type: "equal" });
			x--;
			y--;
		}

		if (fromDown) {
			edits.push({ type: "insert" });
			y--;
		} else {
			edits.push({ type: "delete" });
			x--;
		}

		x = prevX;
		y = prevY;
	}

	while (x > 0 && y > 0) {
		edits.push({ type: "equal" });
		x--;
		y--;
	}

	while (x > 0) {
		edits.push({ type: "delete" });
		x--;
	}

	while (y > 0) {
		edits.push({ type: "insert" });
		y--;
	}

	return edits.reverse();
}


import { diffMyers, type DiffEdit } from "./myersDiff";

export type LineDiffEdit = DiffEdit;

export function diffLinesMyers(aLines: string[], bLines: string[]): LineDiffEdit[] {
	return diffMyers(aLines, bLines, (left, right) => left === right);
}

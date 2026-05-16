export interface BlameSelectionLike {
  start: { line: number };
  end: { line: number };
}

export interface BlameLineLike {
  line: number;
}

export function selectedBlameLineNumbers(selections: readonly BlameSelectionLike[]): number[] {
  const selectedLines = new Set<number>();
  for (const selection of selections) {
    const startLine = Math.min(selection.start.line, selection.end.line);
    const endLine = Math.max(selection.start.line, selection.end.line);
    for (let line = startLine; line <= endLine; line += 1) {
      if (line >= 0) {
        selectedLines.add(line + 1);
      }
    }
  }

  return [...selectedLines].sort((left, right) => left - right);
}

export function annotationsForSelectedLines<T extends BlameLineLike>(
  annotations: readonly T[],
  selections: readonly BlameSelectionLike[]
): T[] {
  const selectedLines = new Set(selectedBlameLineNumbers(selections));
  return annotations.filter((annotation) => selectedLines.has(annotation.line));
}

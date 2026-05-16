export type TextConflictResolution = 'this' | 'other' | 'both-this-first' | 'both-this-last';

export interface TextConflictResolutionResult {
  content: string;
  resolvedCount: number;
}

const conflictBlockPattern = /^<<<<<<<[^\r\n]*(\r\n|\n|\r)([\s\S]*?)^=======[^\r\n]*(?:\r\n|\n|\r)([\s\S]*?)^>>>>>>>[^\r\n]*(?:(\r\n|\n|\r)|$)/gm;

export function resolveTextConflictMarkers(content: string, resolution: TextConflictResolution): TextConflictResolutionResult {
  let resolvedCount = 0;
  const resolvedContent = content.replace(
    conflictBlockPattern,
    (_match, openingLineEnding: string, thisSide: string, otherSide: string, closingLineEnding: string | undefined) => {
      resolvedCount++;
      return chooseConflictText(thisSide, otherSide, resolution, openingLineEnding, closingLineEnding);
    }
  );
  return {
    content: resolvedContent,
    resolvedCount
  };
}

function chooseConflictText(
  thisSide: string,
  otherSide: string,
  resolution: TextConflictResolution,
  lineEnding: string,
  closingLineEnding: string | undefined
): string {
  const suffix = closingLineEnding ?? '';
  switch (resolution) {
    case 'this':
      return trimSingleTrailingLineEnding(thisSide, lineEnding) + suffix;
    case 'other':
      return trimSingleTrailingLineEnding(otherSide, lineEnding) + suffix;
    case 'both-this-first':
      return joinConflictSides(thisSide, otherSide, lineEnding) + suffix;
    case 'both-this-last':
      return joinConflictSides(otherSide, thisSide, lineEnding) + suffix;
  }
}

function joinConflictSides(first: string, second: string, lineEnding: string): string {
  const firstText = trimSingleTrailingLineEnding(first, lineEnding);
  const secondText = trimSingleTrailingLineEnding(second, lineEnding);
  if (!firstText) {
    return secondText;
  }
  if (!secondText) {
    return firstText;
  }
  return `${firstText}${lineEnding}${secondText}`;
}

function trimSingleTrailingLineEnding(value: string, lineEnding: string): string {
  return value.endsWith(lineEnding) ? value.slice(0, -lineEnding.length) : value;
}

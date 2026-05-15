import type { BazaarRevision } from './types';

export function parseBazaarLogXml(xml: string): BazaarRevision[] {
  return parseLogBlocks(xml, 0);
}

export function searchRevisions(revisions: readonly BazaarRevision[], query: string): BazaarRevision[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [...revisions];
  }

  return revisions.filter((revision) => {
    const haystack = [
      revision.revno,
      revision.revisionId,
      revision.message,
      revision.committer,
      revision.branchNick,
      ...revision.tags,
      ...(revision.changedPaths ?? [])
    ].join('\n').toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

function parseLogBlocks(xml: string, depth: number): BazaarRevision[] {
  const revisions: BazaarRevision[] = [];
  for (const block of extractDirectBlocks(xml, 'log')) {
    revisions.push(parseRevision(block, depth));
    const mergeBlock = extractFirstTagContent(block, 'merge');
    if (mergeBlock) {
      revisions.push(...parseLogBlocks(mergeBlock, depth + 1));
    }
  }
  return revisions;
}

function parseRevision(block: string, depth: number): BazaarRevision {
  const tagsBlock = extractFirstTagContent(block, 'tags') ?? '';
  const parentsBlock = extractFirstTagContent(block, 'parents') ?? '';
  const pathsBlock = extractFirstTagContent(block, 'paths') ?? '';
  const affectedFilesBlock = extractFirstTagContent(block, 'affected-files') ?? '';
  const changedPaths = [
    ...extractTagValues(pathsBlock, 'path'),
    ...extractTagValues(affectedFilesBlock, 'file')
  ];
  const revision: BazaarRevision = {
    revno: textValue(block, 'revno'),
    revisionId: textValue(block, 'revisionid'),
    parentIds: extractTagValues(parentsBlock, 'parent').map(decodeXml),
    tags: extractTagValues(tagsBlock, 'tag').map(decodeXml),
    committer: decodeXml(textValue(block, 'committer')),
    branchNick: decodeXml(textValue(block, 'branch-nick')),
    timestamp: decodeXml(textValue(block, 'timestamp')),
    message: decodeXml(textValue(block, 'message')),
    depth
  };

  if (changedPaths.length > 0) {
    revision.changedPaths = changedPaths.map(decodeXml);
  }

  return revision;
}

function textValue(block: string, tag: string): string {
  return decodeCdata(extractFirstTagContent(block, tag) ?? '').trim();
}

function extractTagValues(block: string, tag: string): string[] {
  const values: string[] = [];
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'g');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(block)) !== null) {
    values.push(decodeCdata(match[1]).trim());
  }
  return values;
}

function extractFirstTagContent(block: string, tag: string): string | undefined {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`);
  return pattern.exec(block)?.[1];
}

function extractDirectBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  const openPattern = new RegExp(`<${tag}(?:\\s[^>]*)?>|<\\/${tag}>`, 'g');
  let depth = 0;
  let blockStart = -1;
  let match: RegExpExecArray | null;

  while ((match = openPattern.exec(xml)) !== null) {
    const token = match[0];
    if (!token.startsWith('</')) {
      if (depth === 0) {
        blockStart = openPattern.lastIndex;
      }
      depth++;
      continue;
    }

    depth--;
    if (depth === 0 && blockStart >= 0) {
      blocks.push(xml.slice(blockStart, match.index));
      blockStart = -1;
    }
  }

  return blocks;
}

function decodeCdata(value: string): string {
  return value.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1');
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

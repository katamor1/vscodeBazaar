import { describe, expect, it } from 'vitest';
import { parseBazaarLogXml, searchRevisions } from '../src/bazaar/historyParser';

describe('parseBazaarLogXml', () => {
  it('parses revisions with parents, tags, branch nick, and messages', () => {
    const revisions = parseBazaarLogXml(`<?xml version="1.0" encoding="cp932"?><logs><log><revno>2</revno><tags><tag>v1</tag></tags><revisionid>rev-2</revisionid><parents><parent>rev-1</parent></parents><committer>Alice &lt;a@example.test&gt;</committer><branch-nick>main</branch-nick><timestamp>Fri 2026-05-15 00:03:46 +0900</timestamp><message><![CDATA[second <message>]]></message></log><log><revno>1</revno><revisionid>rev-1</revisionid><committer>Alice &lt;a@example.test&gt;</committer><branch-nick>main</branch-nick><timestamp>Fri 2026-05-15 00:01:00 +0900</timestamp><message><![CDATA[initial]]></message></log></logs>`);

    expect(revisions).toEqual([
      {
        revno: '2',
        revisionId: 'rev-2',
        parentIds: ['rev-1'],
        tags: ['v1'],
        committer: 'Alice <a@example.test>',
        branchNick: 'main',
        timestamp: 'Fri 2026-05-15 00:03:46 +0900',
        message: 'second <message>',
        depth: 0
      },
      {
        revno: '1',
        revisionId: 'rev-1',
        parentIds: [],
        tags: [],
        committer: 'Alice <a@example.test>',
        branchNick: 'main',
        timestamp: 'Fri 2026-05-15 00:01:00 +0900',
        message: 'initial',
        depth: 0
      }
    ]);
  });

  it('flattens merged revisions and records their depth', () => {
    const revisions = parseBazaarLogXml(`<logs><log><revno>2</revno><revisionid>merge</revisionid><parents><parent>base</parent><parent>feature</parent></parents><committer>Alice</committer><branch-nick>main</branch-nick><timestamp>today</timestamp><message><![CDATA[merge feature]]></message><merge><log><revno>1.1.1</revno><revisionid>feature</revisionid><parents><parent>base</parent></parents><committer>Bob</committer><branch-nick>feature</branch-nick><timestamp>today</timestamp><message><![CDATA[feature work]]></message></log></merge></log></logs>`);

    expect(revisions.map((revision) => ({
      revno: revision.revno,
      revisionId: revision.revisionId,
      parentIds: revision.parentIds,
      depth: revision.depth
    }))).toEqual([
      { revno: '2', revisionId: 'merge', parentIds: ['base', 'feature'], depth: 0 },
      { revno: '1.1.1', revisionId: 'feature', parentIds: ['base'], depth: 1 }
    ]);
  });
});

describe('searchRevisions', () => {
  it('matches revno, revision id, message, committer, branch nick, tags, and changed paths', () => {
    const revisions = parseBazaarLogXml(`<logs><log><revno>3</revno><tags><tag>release</tag></tags><revisionid>abc-123</revisionid><committer>Alice</committer><branch-nick>feature</branch-nick><timestamp>today</timestamp><message><![CDATA[Fix dashboard]]></message><paths><path action="M">src/app.ts</path></paths></log></logs>`);

    expect(searchRevisions(revisions, 'release')).toHaveLength(1);
    expect(searchRevisions(revisions, 'abc')).toHaveLength(1);
    expect(searchRevisions(revisions, 'dashboard')).toHaveLength(1);
    expect(searchRevisions(revisions, 'alice')).toHaveLength(1);
    expect(searchRevisions(revisions, 'feature')).toHaveLength(1);
    expect(searchRevisions(revisions, 'src/app.ts')).toHaveLength(1);
    expect(searchRevisions(revisions, 'missing')).toHaveLength(0);
  });
});

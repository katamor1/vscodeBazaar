import type { BazaarRevision, RevisionGraph } from './types';
import { normalizeRevisionSpec, revisionGraphId } from './revisionSpec';

export function buildGraph(revisions: readonly BazaarRevision[]): RevisionGraph {
  const keyedRevisions = revisions.reduce<Array<{ revision: BazaarRevision; id: string }>>((items, revision) => {
    const id = revisionGraphId(revision);
    if (id) {
      items.push({ revision, id });
    }
    return items;
  }, []);
  const revisionIdToGraphId = new Map(
    keyedRevisions.flatMap(({ revision, id }) => {
      const revisionId = normalizeRevisionSpec(revision.revisionId);
      return revisionId ? [[revisionId, id]] : [];
    })
  );
  const nodes = keyedRevisions.map(({ revision, id }, index) => ({
    id,
    revno: revision.revno,
    label: `${revision.revno} ${revision.message}`,
    branchNick: revision.branchNick,
    tags: revision.tags,
    x: revision.depth,
    y: index
  }));
  const edges = keyedRevisions.flatMap(({ revision, id }) =>
    revision.parentIds.flatMap((parentId) => {
      const parentGraphId = revisionIdToGraphId.get(parentId);
      return parentGraphId ? [{ from: id, to: parentGraphId }] : [];
    })
  );

  return { nodes, edges };
}

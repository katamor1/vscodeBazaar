export interface UriLike {
  toString(): string;
}

export interface VisibleEditorLike {
  document: {
    uri: UriLike;
  };
}

export function findVisibleEditorByUri<TEditor extends VisibleEditorLike>(
  editors: readonly TEditor[],
  uri: UriLike
): TEditor | undefined {
  const target = uri.toString();
  return editors.find((editor) => editor.document.uri.toString() === target);
}

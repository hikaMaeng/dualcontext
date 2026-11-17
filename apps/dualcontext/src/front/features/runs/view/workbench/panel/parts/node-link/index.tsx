/** 다른 노드로 가는 이름 링크(고르면 그 노드가 선택된다). */
export function NodeLink({ id, name, onSelect }: { id: string; name: string; onSelect: (id: string) => void }) {
  return (
    <button type="button" data-testid="run-node-link" data-node-id={id} onClick={() => onSelect(id)} className="rounded border border-line px-2 py-0.5 text-start text-accent underline">
      {name}
    </button>
  );
}

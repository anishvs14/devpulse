import { btnGhost } from "./ui";

export function Pagination({
  page,
  size,
  total,
  onChange,
}: {
  page: number;
  size: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  return (
    <div className="flex items-center justify-between pt-4 text-sm text-muted">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button className={btnGhost} disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </button>
        <span className="px-1">
          Page {page} of {pages}
        </span>
        <button className={btnGhost} disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

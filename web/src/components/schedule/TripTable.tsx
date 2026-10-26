import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  isHiddenOnPhone?: boolean;
  isHeaderHidden?: boolean;
}

interface Props<T> {
  labelledBy: string;
  columns: Column<T>[];
  rows: T[] | undefined; // undefined while loading
  rowKey: (row: T) => number;
  empty: string;
}

export const TripTable = <T,>({
  labelledBy,
  columns,
  rows,
  rowKey,
  empty,
}: Props<T>) => {
  if (!rows || rows.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-xs text-muted-foreground">
        {rows ? empty : "Loading…"}
      </p>
    );
  }

  const cellClass = (c: Column<T>) =>
    `px-3 first:pl-4 last:pr-4 ${c.isHiddenOnPhone ? "hidden sm:table-cell" : ""} ${c.className ?? ""}`;

  return (
    <table aria-labelledby={labelledBy} className="w-full table-fixed text-xs">
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.header}
              scope="col"
              className={`py-2 text-left font-medium text-muted-foreground ${cellClass(c)}`}
            >
              {c.isHeaderHidden ? (
                <span className="sr-only">{c.header}</span>
              ) : (
                c.header
              )}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {rows.map((r) => (
          <tr key={rowKey(r)} className="h-12 border-t border-border sm:h-10">
            {columns.map((c) => (
              <td key={c.header} className={cellClass(c)}>
                {c.cell(r)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

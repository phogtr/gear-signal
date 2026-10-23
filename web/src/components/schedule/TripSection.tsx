import type { ReactNode } from "react";

interface Props {
  id: string;
  title: string;
  count?: number;
  children: ReactNode;
}

export const TripSection = ({ id, title, count, children }: Props) => {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="rounded-lg border border-border bg-card"
    >
      <div className=" px-4 pt-3 pb-2 flex items-baseline gap-2">
        <h2 id={`${id}-heading`} className="text-sm font-semibold">
          {title}
        </h2>
        {count !== undefined && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </div>

      {children}
    </section>
  );
};

import {
  useSocketStore,
  type SocketStatus as Status,
} from "../../lib/ws/socket";

const labels: Record<Exclude<Status, "live">, { text: string; dot: string }> = {
  connecting: { text: "Connecting…", dot: "bg-warning" },
  offline: { text: "Offline, retrying…", dot: "bg-danger" },
};

export const SocketStatus = () => {
  const status = useSocketStore((s) => s.status);

  return (
    <div role="status">
      {status === "live" ? (
        <span className="sr-only">Live</span>
      ) : (
        <p className="px-3 py-1.5 text-xs flex items-center gap-2 rounded-lg border border-border bg-card">
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${labels[status].dot}`}
          />
          {labels[status].text}
        </p>
      )}
    </div>
  );
};

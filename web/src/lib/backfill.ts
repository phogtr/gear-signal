// server archive every 5s; first call can be before server do archive
// second one fill the gap
export const BACKFILL_RETRY_MS = 6_000;

export const backfill = <T>(
  load: (signal: AbortSignal) => Promise<T>,
  onLoad: (result: T) => void,
) => {
  const controller = new AbortController();

  const run = async () => {
    try {
      const result = await load(controller.signal);
      if (!controller.signal.aborted) onLoad(result);
    } catch {
      // aborted or unavailable
    }
  };

  void run();
  const retry = setTimeout(run, BACKFILL_RETRY_MS);

  return () => {
    clearTimeout(retry);
    controller.abort();
  };
};

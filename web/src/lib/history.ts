export const makeHistory = (capacity: number, series: number) => {
  // first column is time
  const columns = Array.from(
    { length: series + 1 },
    () => new Float64Array(capacity),
  );
  let start = 0;
  let size = 0;

  return {
    // false for time at/before newest row (keeps x strictly increasing)
    push: (t: number, values: number[]): boolean => {
      if (size > 0 && t <= columns[0][(start + size - 1) % capacity]) {
        return false;
      }
      //   col[0],   col[1],   col[2],   col[3]
      // [[...row], [...row], [...row], [...row]]
      const row = (start + size) % capacity;
      columns[0][row] = t;
      values.forEach((v, i) => (columns[i + 1][row] = v));

      if (size < capacity) size++;
      else start = (start + 1) % capacity;
      return true;
    },

    merge: (rows: { t: number; values: number[] }[]): boolean => {
      const byTime = new Map(rows.map((r) => [r.t, r.values]));
      const known = size;
      for (let i = 0; i < size; i++) {
        const row = (start + i) % capacity;
        byTime.set(
          columns[0][row],
          columns.slice(1).map((col) => col[row]),
        );
      }
      if (byTime.size === known) return false;

      const merged = [...byTime].sort((a, b) => a[0] - b[0]).slice(-capacity);
      merged.forEach(([t, values], row) => {
        columns[0][row] = t;
        values.forEach((v, i) => (columns[i + 1][row] = v));
      });
      start = 0;
      size = merged.length;
      return true;
    },

    clear: () => {
      start = 0;
      size = 0;
    },

    data: (): Float64Array[] =>
      columns.map((col) => {
        const out = new Float64Array(size);
        for (let i = 0; i < size; i++) out[i] = col[(start + i) % capacity];
        return out;
      }),
  };
};

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

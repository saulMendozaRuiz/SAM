/**
 * Molde UI puro para listas largas en dos bloques balanceados.
 * No hace I/O, no toca boot y no conoce Tauri/Rust.
 */
export function splitBalanced<T>(items: T[]) {
  const midpoint = Math.ceil(items.length / 2);
  return {
    left: items.slice(0, midpoint),
    right: items.slice(midpoint),
    rows: midpoint,
  };
}

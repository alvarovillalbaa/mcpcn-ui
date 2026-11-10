const MAX_BYTES = 4 * 1024 * 1024;
const encoder = new TextEncoder();

/** Inspect descriptors before reading a programmatic handler's untrusted result. */
function boundedJSON(value: unknown): boolean {
  let nodes = 0, bytes = 0;
  const ancestors = new Set<object>();
  const add = (count: number) => (bytes += count) <= MAX_BYTES;
  const stringBytes = (text: string) => encoder.encode(JSON.stringify(text)).byteLength;
  function visit(item: unknown, depth: number): boolean {
    if (++nodes > 150000 || depth > 20) return false;
    if (item === null || typeof item === "boolean") return add(item === null ? 4 : item ? 4 : 5);
    if (typeof item === "number") return Number.isFinite(item) && add(JSON.stringify(item).length);
    if (typeof item === "string") {
      if (item.length > 2 * 1024 * 1024) return false;
      const count = stringBytes(item);
      return count <= 2 * 1024 * 1024 && add(count);
    }
    if (typeof item !== "object" || ancestors.has(item) || Object.getOwnPropertySymbols(item).length) return false;
    const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
    const descriptors = Object.getOwnPropertyDescriptors(item), keys = Object.keys(descriptors).filter(key => !(array && key === "length"));
    if (keys.length > 1000 || array && (descriptors.length?.value !== keys.length || keys.some((key, index) => key !== String(index)))) return false;
    if (!add(2 + Math.max(0, keys.length - 1))) return false;
    ancestors.add(item);
    try {
      return keys.every(key => {
        const entry = descriptors[key];
        return key.length <= 256 && !["__proto__", "prototype", "constructor"].includes(key)
          && entry?.enumerable === true && "value" in entry
          && (array || add(stringBytes(key) + 1)) && visit(entry.value, depth + 1);
      });
    } finally { ancestors.delete(item); }
  }
  try { return visit(value, 0); } catch { return false; }
}

export function wireSnapshot<T>(value: T): T {
  if (!boundedJSON(value)) throw new Error("mcpcn_server_payload_invalid");
  // The descriptor walk bounded the exact serialized bytes before allocation.
  return JSON.parse(JSON.stringify(value)) as T;
}

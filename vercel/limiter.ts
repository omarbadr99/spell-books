// A best-effort stand-in for Cloudflare's rate-limit binding on hosts that have
// none: it counts requests per key inside each running instance of the function.

export function memoryLimiter(limit: number, periodSeconds: number) {
  const hits = new Map<string, number[]>();
  return {
    async limit({ key }: { key: string }): Promise<{ success: boolean }> {
      const now = Date.now();
      const recent = (hits.get(key) ?? []).filter((t) => t > now - periodSeconds * 1000);
      const success = recent.length < limit;
      if (success) recent.push(now);
      if (hits.size > 5000) hits.clear();
      hits.set(key, recent);
      return { success };
    },
  };
}

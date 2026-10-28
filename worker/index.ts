import { handleApi } from "./api";
import { spiritClient } from "./spirit";

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return handleApi(request, env, { createClient: spiritClient });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

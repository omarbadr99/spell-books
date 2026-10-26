import Anthropic from "@anthropic-ai/sdk";
import { handleApi } from "./api";

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return handleApi(request, env, { createClient: (apiKey) => new Anthropic({ apiKey }) });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

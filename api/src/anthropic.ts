import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey() });
  return client;
}

export const CHAT_MODEL = "claude-sonnet-5";

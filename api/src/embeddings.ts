import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

// Local, deterministic-enough embedding model (STACK.md: "a local/deterministic
// scheme — the corpus is small; simple works"). Runs in-process via ONNX, no
// network call per query — keeps the only external dependency the Anthropic API.
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2") as Promise<FeatureExtractionPipeline>;
  }
  return extractorPromise;
}

export async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

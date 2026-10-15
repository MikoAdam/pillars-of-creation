import { z } from "zod";

const source = z.object({ text: z.string().min(1), url: z.string().url() });
const transition = z.enum(["cut", "crossfade", "slide", "zoom"]);
const base = {
  id: z.string().min(1),
  duration: z.number().positive().max(120),
  transition: transition.default("cut"),
};
const rect = z.object({ x: z.number(), y: z.number(), scale: z.number().positive() });

export const photoZoomSchema = z.object({
  ...base,
  type: z.literal("PhotoZoom"),
  imageUrl: z.string().optional(),
  photoDescription: z.string().optional(),
  caption: z.string().optional(),
  vignette: z.boolean().default(true),
  from: rect.default({ x: 0.5, y: 0.5, scale: 1 }),
  to: rect.default({ x: 0.5, y: 0.5, scale: 1.15 }),
});

export const statCounterSchema = z.object({
  ...base,
  type: z.literal("StatCounter"),
  value: z.number(),
  decimals: z.number().int().min(0).max(4).default(0),
  prefix: z.string().default(""),
  suffix: z.string().default(""),
  unit: z.string().default(""),
  label: z.string(),
  source,
  unverified: z.boolean().optional(),
});

export const barChartSchema = z.object({
  ...base,
  type: z.literal("BarChart"),
  title: z.string(),
  unit: z.string().default(""),
  bars: z.array(z.object({ label: z.string(), value: z.number(), highlight: z.boolean().optional() })).min(1).max(12),
  source,
  unverified: z.boolean().optional(),
});

export const lineChartSchema = z.object({
  ...base,
  type: z.literal("LineChart"),
  title: z.string(),
  unit: z.string().default(""),
  points: z.array(z.object({ x: z.string(), y: z.number() })).min(2),
  source,
  unverified: z.boolean().optional(),
});

export const headlineSchema = z.object({
  ...base,
  type: z.literal("HeadlineHighlight"),
  imageUrl: z.string().optional(),
  publication: z.string().default(""),
  headline: z.string(),
  body: z.string().default(""),
  highlights: z.array(z.string()).default([]),
  source: source.optional(),
  unverified: z.boolean().optional(),
});

export const kineticTextSchema = z.object({
  ...base,
  type: z.literal("KineticText"),
  text: z.string().min(1),
  emphasis: z.array(z.string()).default([]),
  wordsPerSecond: z.number().positive().default(3),
});

export const sceneSchema = z.discriminatedUnion("type", [
  photoZoomSchema,
  statCounterSchema,
  barChartSchema,
  lineChartSchema,
  headlineSchema,
  kineticTextSchema,
]);

export const projectSchema = z.object({
  title: z.string().min(1),
  voiceoverUrl: z.string().optional(),
  scenes: z.array(sceneSchema).min(1),
});

export type ValidationResult =
  | { ok: true; project: z.infer<typeof projectSchema> }
  | { ok: false; errors: string[] };

/** Validate unknown JSON and return readable, path-based error messages. */
export function validateProject(input: unknown): ValidationResult {
  const r = projectSchema.safeParse(input);
  if (r.success) return { ok: true, project: r.data };
  const errors = r.error.issues.map((i) => {
    const path = i.path
      .map((p) => (typeof p === "number" ? `[${p}]` : `.${p}`))
      .join("")
      .replace(/^\./, "");
    return `${path || "(root)"}: ${i.message}`;
  });
  return { ok: false, errors };
}

import type { z } from "zod";
import type {
  projectSchema,
  sceneSchema,
  photoZoomSchema,
  statCounterSchema,
  barChartSchema,
  lineChartSchema,
  headlineSchema,
  kineticTextSchema,
} from "./schema";

export type Project = z.infer<typeof projectSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type PhotoZoomScene = z.infer<typeof photoZoomSchema>;
export type StatCounterScene = z.infer<typeof statCounterSchema>;
export type BarChartScene = z.infer<typeof barChartSchema>;
export type LineChartScene = z.infer<typeof lineChartSchema>;
export type HeadlineScene = z.infer<typeof headlineSchema>;
export type KineticTextScene = z.infer<typeof kineticTextSchema>;

export type EaseFn = (t: number) => number;

export interface Theme {
  id: string;
  name: string;
  fonts: { display: string; body: string; displayWeight: number; displayUpper: boolean };
  colors: { background: string; text: string; accent: string };
  easing: { enter: EaseFn; move: EaseFn; count: EaseFn };
  grain: number; // 0..1 opacity
}

export type Assets = Map<string, HTMLImageElement>;

export interface RenderCtx {
  ctx: CanvasRenderingContext2D;
  theme: Theme;
  assets: Assets;
  width: number;
  height: number;
  /** draw as a layer without filling the background */
  transparent?: boolean;
}

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 30;

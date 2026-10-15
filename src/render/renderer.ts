import type { Assets, Project, RenderCtx, Scene, Theme } from "./types";
import { FPS, HEIGHT, WIDTH } from "./types";
import { frameState } from "./timeline";
import { drawGrain } from "./grain";
import { easeInOutCubic } from "./easing";
import { renderPhotoZoom } from "./scenes/photoZoom";
import { renderStatCounter } from "./scenes/statCounter";
import { renderBarChart } from "./scenes/barChart";
import { renderLineChart } from "./scenes/lineChart";
import { renderHeadline } from "./scenes/headlineHighlight";
import { renderKineticText } from "./scenes/kineticText";

/** Draw one scene at local time t. Pure function of its inputs. */
export function renderScene(rc: RenderCtx, scene: Scene, t: number) {
  const tt = Math.min(Math.max(t, 0), scene.duration + 1);
  switch (scene.type) {
    case "PhotoZoom": return renderPhotoZoom(rc, scene, tt);
    case "StatCounter": return renderStatCounter(rc, scene, tt);
    case "BarChart": return renderBarChart(rc, scene, tt);
    case "LineChart": return renderLineChart(rc, scene, tt);
    case "HeadlineHighlight": return renderHeadline(rc, scene, tt);
    case "KineticText": return renderKineticText(rc, scene, tt);
  }
}

let bufA: HTMLCanvasElement | null = null;
let bufB: HTMLCanvasElement | null = null;
function buffer(which: "a" | "b") {
  const make = () => {
    const c = document.createElement("canvas");
    c.width = WIDTH;
    c.height = HEIGHT;
    return c;
  };
  if (which === "a") return (bufA ??= make());
  return (bufB ??= make());
}

/** Render the full project at global time t (seconds). Used by preview and export alike. */
export function renderFrame(ctx: CanvasRenderingContext2D, project: Project, theme: Theme, assets: Assets, t: number) {
  const W = WIDTH, H = HEIGHT;
  const fs = frameState(project.scenes, t);
  const cur = project.scenes[fs.index];

  if (!fs.transition) {
    renderScene({ ctx, theme, assets, width: W, height: H }, cur, fs.local);
  } else {
    const a = buffer("a"), b = buffer("b");
    const actx = a.getContext("2d")!, bctx = b.getContext("2d")!;
    actx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    renderScene({ ctx: actx, theme, assets, width: W, height: H }, project.scenes[fs.transition.prevIndex], fs.transition.prevLocal);
    renderScene({ ctx: bctx, theme, assets, width: W, height: H }, cur, fs.local);
    const p = easeInOutCubic(fs.transition.progress);
    ctx.save();
    switch (fs.transition.kind) {
      case "crossfade":
        ctx.drawImage(a, 0, 0);
        ctx.globalAlpha = p;
        ctx.drawImage(b, 0, 0);
        break;
      case "slide":
        ctx.drawImage(a, -W * p, 0);
        ctx.drawImage(b, W * (1 - p), 0);
        break;
      case "zoom": {
        const s1 = 1 + p * 0.4;
        ctx.drawImage(a, W / 2 - (W * s1) / 2, H / 2 - (H * s1) / 2, W * s1, H * s1);
        const s2 = 0.85 + 0.15 * p;
        ctx.globalAlpha = p;
        ctx.drawImage(b, W / 2 - (W * s2) / 2, H / 2 - (H * s2) / 2, W * s2, H * s2);
        break;
      }
      default:
        ctx.drawImage(b, 0, 0);
    }
    ctx.restore();
  }

  drawGrain(ctx, W, H, Math.floor(t * FPS), theme.grain);
}

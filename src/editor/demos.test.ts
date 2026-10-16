import { describe, expect, it } from "vitest";
import { DEMOS } from "./demos";
import { run } from "@/lang/interpreter";

describe("demo scripts", () => {
  for (const d of DEMOS) it(`${d.name} runs without errors`, () => {
    const r = run(d.code);
    expect(r.ok ? "ok" : r.error.message + " @ line " + r.error.line).toBe("ok");
  });
});

import { useState } from "react";
import { run } from "@/lang/interpreter";
import { extractScript } from "./aiPrompt";

interface Props {
  resolveMap: (name: string) => string | undefined;
  onLoad: (code: string) => void;
  onClose: () => void;
}

export function PasteScript({ resolveMap, onLoad, onClose }: Props) {
  const [text, setText] = useState("");
  const code = extractScript(text);
  const check = code ? run(code, { resolveMap }) : null;
  const error = check && !check.ok ? check.error : null;
  const seconds = check && check.ok ? check.timeline.duration : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold">Paste a script from an AI</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste the whole reply. The script is taken from its code block, checked, and only then loaded.
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          placeholder="Paste the reply here"
          className="mt-3 w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground"
        />
        <div className="mt-2 min-h-5 text-xs">
          {error && <span className="text-destructive">Line {error.line + 1}: {error.message}</span>}
          {seconds !== null && <span className="text-muted-foreground">Checked: {seconds.toFixed(1)} seconds of video</span>}
        </div>
        <div className="mt-4 flex justify-end gap-2 text-sm">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1 text-muted-foreground hover:text-foreground">Cancel</button>
          <button
            disabled={!code || !!error}
            onClick={() => onLoad(code)}
            className="rounded-md bg-primary px-3 py-1 font-semibold text-primary-foreground disabled:opacity-50"
          >
            Load into script
          </button>
        </div>
      </div>
    </div>
  );
}

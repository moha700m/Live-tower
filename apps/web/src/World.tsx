import { useEffect, useRef, useState } from "react";
import type { GameSnapshot } from "../../../packages/contracts/index.ts";
import type { LiveTowerRuntime, Nameplate } from "./playcanvas/runtime.ts";
import { Nameplates } from "./Nameplates.tsx";

type Quality = "high" | "medium" | "low";

export default function World({ state, quality = "medium" }: { state: GameSnapshot; quality?: Quality }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<LiveTowerRuntime | null>(null);
  const stateRef = useRef(state);
  const [plates, setPlates] = useState<Nameplate[]>([]);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let raf = 0;
    void import("./playcanvas/runtime.ts").then(({ createLiveTowerRuntime }) => {
      if (disposed || !canvasRef.current) return;
      const runtime = createLiveTowerRuntime(canvasRef.current, stateRef.current);
      runtimeRef.current = runtime;
      const ratio = quality === "low" ? 1 : quality === "high" ? 1.6 : 1.35;
      try { (runtime as LiveTowerRuntime).resize(); } catch { /* first frame */ }
      void ratio;
      const tick = () => {
        if (disposed) return;
        runtime.setSnapshot(stateRef.current);
        setPlates(runtime.getNameplates());
        raf = window.requestAnimationFrame(tick);
      };
      raf = window.requestAnimationFrame(tick);
    });
    return () => {
      disposed = true;
      window.cancelAnimationFrame(raf);
      runtimeRef.current?.destroy();
      runtimeRef.current = null;
    };
  }, [quality]);

  useEffect(() => {
    runtimeRef.current?.setSnapshot(state);
  }, [state]);

  return (
    <>
      <canvas ref={canvasRef} className="world-canvas" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <Nameplates plates={plates} />
    </>
  );
}

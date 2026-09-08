import type { Nameplate } from "./playcanvas/runtime.ts";

export function Nameplates({ plates }: { plates: Nameplate[] }) {
  return (
    <div className="nameplates" aria-hidden="false">
      {plates.map((plate) => {
        if (plate.x < -40 || plate.y < -10 || plate.x > 2400 || plate.y > 2400) return null;
        return (
          <div
            key={plate.id}
            className={`nameplate${plate.leader ? " is-leader" : ""}${plate.boosting ? " is-boost" : ""}`}
            data-viewer={plate.id}
            data-progress={plate.progress}
            style={{ transform: `translate(${plate.x}px, ${plate.y}px)` }}
          >
            {plate.name}
          </div>
        );
      })}
    </div>
  );
}

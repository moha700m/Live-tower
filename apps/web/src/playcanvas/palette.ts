import { Color } from "playcanvas";

export const hex = (value: string): Color => {
  const n = Number.parseInt(value.replace("#", ""), 16);
  return new Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

export const RIYADH = {
  sky: hex("#070B12"),
  fog: hex("#0B1018"),
  sand: hex("#1A1610"),
  stone: hex("#141A24"),
  stoneLight: hex("#243044"),
  metal: hex("#8FA4B8"),
  gold: hex("#C9A227"),
  goldHot: hex("#F0C14A"),
  teal: hex("#1A8A7A"),
  cyan: hex("#5EEAD4"),
  paper: hex("#F4EFE4"),
  ink: hex("#161310"),
  live: hex("#E24B4B"),
  window: hex("#D4B56A"),
} as const;

export const RACER_LOOKS = [
  { body: hex("#E8D8B9"), accent: hex("#C9A227"), scarf: hex("#F4EFE4"), skin: hex("#C48A62") },
  { body: hex("#17232F"), accent: hex("#5EEAD4"), scarf: hex("#C9A227"), skin: hex("#A56B48") },
  { body: hex("#8E2438"), accent: hex("#F4EFE4"), scarf: hex("#E8D8B9"), skin: hex("#C48A62") },
  { body: hex("#C9A227"), accent: hex("#17232F"), scarf: hex("#1A8A7A"), skin: hex("#B47A52") },
  { body: hex("#1A8A7A"), accent: hex("#F0C14A"), scarf: hex("#F4EFE4"), skin: hex("#C48A62") },
  { body: hex("#1C2740"), accent: hex("#5EEAD4"), scarf: hex("#C9A227"), skin: hex("#A56B48") },
  { body: hex("#F4EFE4"), accent: hex("#1A8A7A"), scarf: hex("#1C2740"), skin: hex("#C48A62") },
  { body: hex("#8A5A32"), accent: hex("#F0C14A"), scarf: hex("#F4EFE4"), skin: hex("#B47A52") },
] as const;

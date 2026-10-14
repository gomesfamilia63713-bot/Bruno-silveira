export type ServiceCategory = {
  key: string;
  label: string;
  color: string; // hex for charts
  defaultUnit: Unit;
};

export type Unit = "m2" | "m" | "m3" | "h" | "un" | "kg";

export const UNIT_LABEL: Record<Unit, string> = {
  m2: "m²",
  m: "m",
  m3: "m³",
  h: "h",
  un: "un",
  kg: "kg",
};

export const UNITS: Unit[] = ["m2", "m", "m3", "h", "un", "kg"];

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  { key: "reboco", label: "Reboco", color: "#38bdf8", defaultUnit: "m2" },
  { key: "pintura", label: "Pintura", color: "#22c55e", defaultUnit: "m2" },
  { key: "alvenaria", label: "Alvenaria", color: "#f97316", defaultUnit: "m2" },
  { key: "escavacao", label: "Escavação", color: "#a855f7", defaultUnit: "m3" },
  { key: "eletrica", label: "Elétrica", color: "#eab308", defaultUnit: "m" },
  { key: "hidraulica", label: "Hidráulica", color: "#06b6d4", defaultUnit: "m" },
  { key: "gesso", label: "Gesso", color: "#ec4899", defaultUnit: "m2" },
  { key: "piso", label: "Piso/Revestimento", color: "#f43f5e", defaultUnit: "m2" },
  { key: "estrutura", label: "Estrutura/Concreto", color: "#64748b", defaultUnit: "m3" },
  { key: "cobertura", label: "Cobertura", color: "#84cc16", defaultUnit: "m2" },
  { key: "outro", label: "Outro", color: "#94a3b8", defaultUnit: "un" },
];

export function categoryColor(key: string): string {
  return SERVICE_CATEGORIES.find((c) => c.key === key)?.color ?? "#94a3b8";
}
export function categoryLabel(key: string): string {
  return SERVICE_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

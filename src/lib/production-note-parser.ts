import type { Unit } from "@/lib/service-categories";

type Named = { id: string; name: string };
type Category = { key: string; label: string };
type Span = { start: number; end: number };
type Mention = Named & Span;
type Measurement = Span & { quantity: number; unit: Unit };

// Browser-only deterministic extraction: no requests, credentials or AI dependencies.
function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/²/g, "2").replace(/³/g, "3");
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const numberWords: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16,
  dezasseis: 16,
  dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30,
  quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80,
  noventa: 90, cem: 100, cento: 100, duzentos: 200, duzentas: 200,
  trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400,
  quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600,
  setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800,
  novecentos: 900, novecentas: 900,
};

function integer(text: string): number | null {
  if (/^\d+(?:\.\d{3})*$/.test(text)) return Number(text.replace(/\./g, ""));
  const tokens = text.split(/\s+/).filter((word) => word !== "e");
  let total = 0;
  let group = 0;
  for (const token of tokens) {
    if (token === "mil" || token === "milhao" || token === "milhoes") {
      total += (group || 1) * (token === "mil" ? 1000 : 1_000_000);
      group = 0;
    } else {
      const value = numberWords[token];
      if (value === undefined) return null;
      group += value;
    }
  }
  return tokens.length ? total + group : null;
}

export function parsePortugueseNumber(text: string): number | null {
  const value = normalize(text).trim();
  if (/^\d[\d.,]*$/.test(value)) {
    const numeric = Number(value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  if (value === "meio" || value === "meia") return 0.5;
  if (value.endsWith(" e meio") || value.endsWith(" e meia")) {
    const whole = integer(value.replace(/ e mei[oa]$/, ""));
    return whole === null ? null : whole + 0.5;
  }
  const parts = value.split(/\s+virgula\s+/);
  const whole = integer(parts[0] ?? "");
  if (whole === null || parts.length > 2) return null;
  if (parts.length === 1) return whole;
  const decimalText = parts[1] ?? "";
  const digits = decimalText.split(/\s+/);
  const decimal = digits.every((word) => numberWords[word] !== undefined && numberWords[word] < 10)
    ? digits.map((word) => numberWords[word]).join("")
    : String(integer(decimalText) ?? "");
  return decimal ? Number(`${whole}.${decimal}`) : null;
}

const ignoredNameWords = new Set(["de", "da", "do", "das", "dos", "e", "obra", "obras", "construcao", "residencial", "edificio"]);

function mentions(text: string, list: Named[], allowFirstName: boolean): Mention[] {
  const full: Mention[] = [];
  for (const item of list) {
    const name = normalize(item.name).trim();
    if (!name) continue;
    const match = new RegExp(`(?<![a-z0-9])${escapeRegex(name)}(?![a-z0-9])`).exec(text);
    if (match) full.push({ ...item, start: match.index, end: match.index + match[0].length });
  }
  const matches = full.filter((item) => !full.some((other) => other.id !== item.id && other.start <= item.start && other.end >= item.end && other.end - other.start > item.end - item.start));
  for (const item of list) {
    if (matches.some((match) => match.id === item.id)) continue;
    const words = normalize(item.name).split(/\s+/).filter((word) => !ignoredNameWords.has(word));
    const candidates = allowFirstName ? words.slice(0, 1) : words;
    for (const word of candidates) {
      if (word.length < 3 || !/^[a-z]+$/.test(word)) continue;
      const owners = list.filter((other) => {
        const otherWords = normalize(other.name).split(/\s+/).filter((part) => !ignoredNameWords.has(part));
        return allowFirstName ? otherWords[0] === word : otherWords.includes(word);
      });
      if (owners.length !== 1) continue;
      const match = new RegExp(`(?<![a-z0-9])${escapeRegex(word)}(?![a-z0-9])`).exec(text);
      if (match && !matches.some((existing) => match.index >= existing.start && match.index < existing.end)) {
        matches.push({ ...item, start: match.index, end: match.index + match[0].length });
        break;
      }
    }
  }
  return matches;
}

const unitPattern = "metros?\\s+quadrados?|metros?\\s+cubicos?|m2|m3|metros?|m|horas?|h|quilogramas?|quilos?|kg|caixas?|pecas?|unidades?|un";
const wordPattern = [...Object.keys(numberWords), "mil", "milhao", "milhoes", "virgula", "meio", "meia"].join("|");
const numberPattern = `(?:\\d+(?:[.,]\\d+)*|(?:${wordPattern})(?:\\s+(?:e\\s+)?(?:${wordPattern}))*)`;

function measurements(text: string): Measurement[] {
  const regex = new RegExp(`(?<![a-z0-9.,-])(${numberPattern})\\s*(${unitPattern})(?![a-z0-9])`, "g");
  const results: Measurement[] = [];
  for (const match of text.matchAll(regex)) {
    const quantity = parsePortugueseNumber(match[1]);
    if (quantity === null) continue;
    const raw = match[2];
    const unit: Unit = /quadrad|m2/.test(raw) ? "m2" : /cubic|m3/.test(raw) ? "m3"
      : /^(metro|m$)/.test(raw) ? "m" : /^(hora|h$)/.test(raw) ? "h"
      : /^(quilo|kg)/.test(raw) ? "kg" : "un";
    results.push({ quantity, unit, start: match.index, end: match.index + match[0].length });
  }
  return results;
}

export function parseProductionNoteLocally(input: {
  text: string; categories: Category[]; employees: Named[]; obras: Named[];
}) {
  const original = input.text.trim().slice(0, 4000);
  const text = normalize(original);
  const works = mentions(text, input.obras, false);
  const people = mentions(text, input.employees, true).filter((person) =>
    !works.some((work) => person.start < work.end && person.end > work.start));
  const amounts = measurements(text);
  const productionAmounts = amounts.filter((amount) => amount.unit !== "h");
  const quantities = productionAmounts.length ? productionAmounts : amounts;
  const amount = quantities.length === 1 ? quantities[0] : null;
  const categoryMatches = input.categories.filter((category) => {
    const terms = [category.key, ...category.label.split(/[\/()]/)].map((term) => normalize(term).trim()).filter((term) => term.length >= 3 && term !== "outro");
    return terms.some((term) => new RegExp(`(?<![a-z0-9])${escapeRegex(term)}(?![a-z0-9])`).test(text));
  });

  // Remove identified people, works and measurements, keeping the spoken service.
  const spans: Span[] = [...works, ...people, ...amounts].sort((a, b) => b.start - a.start);
  let service = original;
  for (const span of spans) service = service.slice(0, span.start) + " " + service.slice(span.end);
  service = service.replace(/\b(?:na|no|para a|para o|da|do|a) obra\b/gi, " ")
    .replace(/\b(?:hoje|ontem|funcion[aá]ri[oa]|realizou|realizaram|executou|executaram|fez|fizeram|fiz|fizemos|produziu|produziram|trabalhou|trabalharam)\b/gi, " ")
    .replace(/\s+/g, " ").replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, "")
    .replace(/^(?:(?:de|do|da|e|na|no|em|com|para|o|a)\s+)+/i, "")
    .replace(/(?:\s+(?:de|do|da|e|na|no|em|com|para|o|a))+$/i, "").trim();

  return {
    obra_id: works.length === 1 ? works[0]?.id ?? null : null,
    category_key: categoryMatches.length === 1 ? categoryMatches[0]?.key ?? null : null,
    specification: service || null,
    unit: amount?.unit ?? null,
    quantity: amount?.quantity ?? null,
    notes: original,
    employees: people.map((person) => ({
      id: person.id,
      quantity: people.length === 1 ? amount?.quantity ?? null : null,
      hours: people.length === 1 && amounts.filter((measurement) => measurement.unit === "h").length === 1
        ? amounts.find((measurement) => measurement.unit === "h")?.quantity ?? null : null,
    })),
    warnings: [
      works.length !== 1 ? "Obra não identificada ou ambígua." : "",
      !people.length ? "Funcionário não identificado ou ambíguo." : "",
      !amount ? "Quantidade não identificada ou múltiplas quantidades; revise o total." : "",
      people.length > 1 ? "Revise as quantidades individuais dos funcionários." : "",
    ].filter(Boolean),
  };
}
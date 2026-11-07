export interface FinancialTerm {
  source: string;
  protected?: boolean;
  translations?: { es?: string; ar?: string };
}

export const defaultFinancialTerminology: FinancialTerm[] = [
  { source: "EUR/USD", protected: true },
  { source: "GBP/USD", protected: true },
  { source: "XAU/USD", protected: true },
  { source: "US30", protected: true },
  { source: "WTI", protected: true },
  { source: "DXY", protected: true },
  { source: "Bullish", translations: { es: "Alcista", ar: "صاعد" } },
  { source: "Bearish", translations: { es: "Bajista", ar: "هابط" } },
  { source: "Neutral", translations: { es: "Neutral", ar: "محايد" } },
  { source: "High", translations: { es: "Alto", ar: "مرتفع" } },
  { source: "Medium", translations: { es: "Medio", ar: "متوسط" } },
  { source: "Low", translations: { es: "Bajo", ar: "منخفض" } },
];

export function createFinancialTerminologyDictionary(
  overrides: FinancialTerm[] = [],
): Map<string, FinancialTerm> {
  return new Map([...defaultFinancialTerminology, ...overrides].map((term) => [term.source, term]));
}

export interface SymbolRules {
  symbol_map: Record<string, string>;
  strip_suffix: string;
  add_prefix: string;
  add_suffix: string;
}

// Must stay in sync with the follower-symbol logic in run_copy_engine()
export function mapSymbol(masterSymbol: string, rules: SymbolRules): string {
  const explicit = rules.symbol_map[masterSymbol.toUpperCase()]?.trim();
  if (explicit) return explicit;
  const strip = rules.strip_suffix;
  const base =
    strip && masterSymbol.length > strip.length && masterSymbol.slice(-strip.length).toUpperCase() === strip.toUpperCase()
      ? masterSymbol.slice(0, -strip.length)
      : masterSymbol;
  return `${rules.add_prefix}${base}${rules.add_suffix}`;
}

export function hasSymbolRules(rules: SymbolRules): boolean {
  return Object.keys(rules.symbol_map).length > 0 || !!rules.strip_suffix || !!rules.add_prefix || !!rules.add_suffix;
}

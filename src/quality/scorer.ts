export interface QualityFact {
  id: string;
  anyOf: string[];
  weight?: number;
}

export interface ForbiddenClaim {
  id: string;
  patterns: string[];
}

export interface QualityCase {
  id: string;
  tool: string;
  source: string | string[];
  requiredFacts: QualityFact[];
  forbiddenClaims?: ForbiddenClaim[];
  format?: {
    requiredHeadings?: string[];
    rawTextOnly?: boolean;
    disallowStyleMeasurements?: boolean;
  };
}

export interface QualityManifest {
  version: number;
  cases: QualityCase[];
}

export interface QualityScore {
  caseId: string;
  factRecall: number;
  matchedFacts: string[];
  missingFacts: string[];
  unsupportedClaims: string[];
  formatCompliant: boolean;
  elapsedMs?: number;
  rounds?: number;
}

export interface QualityResult {
  text: string;
  elapsedMs?: number;
  rounds?: number;
}

export function scoreQualityCase(qualityCase: QualityCase, result: QualityResult): QualityScore {
  const normalized = normalizeText(result.text);
  const matchedFacts = qualityCase.requiredFacts
    .filter(fact => fact.anyOf.some(pattern => normalized.includes(normalizeText(pattern))))
    .map(fact => fact.id);
  const missingFacts = qualityCase.requiredFacts
    .filter(fact => !matchedFacts.includes(fact.id))
    .map(fact => fact.id);
  const totalWeight = qualityCase.requiredFacts.reduce((sum, fact) => sum + (fact.weight ?? 1), 0);
  const matchedWeight = qualityCase.requiredFacts
    .filter(fact => matchedFacts.includes(fact.id))
    .reduce((sum, fact) => sum + (fact.weight ?? 1), 0);
  const unsupportedClaims = (qualityCase.forbiddenClaims ?? [])
    .filter(claim => claim.patterns.some(pattern => normalized.includes(normalizeText(pattern))))
    .map(claim => claim.id);
  if (qualityCase.format?.disallowStyleMeasurements && /#[0-9a-f]{3,8}\b|\b\d+(?:\.\d+)?\s*(?:px|rem|em)\b/i.test(result.text)) {
    unsupportedClaims.push("unsupported-style-measurement");
  }

  return {
    caseId: qualityCase.id,
    factRecall: totalWeight === 0 ? 1 : matchedWeight / totalWeight,
    matchedFacts,
    missingFacts,
    unsupportedClaims,
    formatCompliant: isFormatCompliant(qualityCase, result.text),
    elapsedMs: result.elapsedMs,
    rounds: result.rounds,
  };
}

export function scoreQualityManifest(manifest: QualityManifest, results: Record<string, QualityResult>): QualityScore[] {
  return manifest.cases
    .filter(qualityCase => results[qualityCase.id] !== undefined)
    .map(qualityCase => scoreQualityCase(qualityCase, results[qualityCase.id]));
}

export function normalizeText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function isFormatCompliant(qualityCase: QualityCase, text: string): boolean {
  const format = qualityCase.format;
  if (!format) return true;
  if (format.rawTextOnly && /^\s*#{1,6}\s/m.test(text)) return false;
  return (format.requiredHeadings ?? []).every(heading => text.includes(heading));
}

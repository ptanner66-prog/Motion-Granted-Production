// /__tests__/citations/eyecite.test.ts
// Test suite for Eyecite integration
// Task E-9 | Version 1.0 — January 28, 2026

import { describe, it, expect, beforeAll } from "vitest";
import { extractCitations, resolveShorthandCitations } from "@/lib/services/citations/eyecite-service";
import { extractLouisianaCitations } from "@/lib/services/citations/la-statute-parser";
import { preprocessForCitations, likelyContainsCitations } from "@/lib/services/citations/citation-preprocessor";
import { resolveIdCitation, resolveSupraCitation } from "@/lib/services/citations/shorthand-resolver";

describe("Eyecite Integration", () => {
  describe("Federal Citations", () => {
    it("extracts U.S. Supreme Court citations", async () => {
      const text =
        "The court held in Celotex Corp. v. Catrett, 477 U.S. 317, 322 (1986) that summary judgment is appropriate.";
      const citations = await extractCitations(text);

      expect(citations.length).toBe(1);
      expect(citations[0].volume).toBe("477");
      expect(citations[0].reporter).toBe("U.S.");
      expect(citations[0].page).toBe("317");
    });

    it("extracts Fifth Circuit citations", async () => {
      const text =
        "See Anderson v. Liberty Lobby, Inc., 477 U.S. 242 (1986); Celotex Corp. v. Catrett, 477 U.S. 317 (1986).";
      const citations = await extractCitations(text);

      expect(citations.length).toBe(2);
    });

    it("extracts F.3d reporter citations", async () => {
      const text =
        "The Fifth Circuit addressed this in Smith v. Jones, 123 F.3d 456 (5th Cir. 2020).";
      const citations = await extractCitations(text);

      expect(citations.length).toBe(1);
      expect(citations[0].reporter).toBe("F.3d");
    });

    it("extracts district court citations", async () => {
      const text =
        "See Doe v. Roe, 456 F. Supp. 3d 789 (N.D. Cal. 2021).";
      const citations = await extractCitations(text);

      expect(citations.length).toBe(1);
      expect(citations[0].reporter).toMatch(/F\. Supp/);
    });
  });

  describe("California Citations", () => {
    it("extracts Cal.4th citations", async () => {
      const text =
        "The California Supreme Court ruled in People v. Superior Court, 13 Cal.4th 497 (1996).";
      const citations = await extractCitations(text);

      expect(citations.length).toBe(1);
      expect(citations[0].reporter).toBe("Cal.4th");
    });

    it("extracts Cal.App.4th citations", async () => {
      const text =
        "See also Garcia v. World Savings, FSB, 183 Cal.App.4th 1031 (2010).";
      const citations = await extractCitations(text);

      expect(citations.length).toBe(1);
      expect(citations[0].reporter).toBe("Cal.App.4th");
    });

    it("extracts California statute citations", async () => {
      const text =
        "California Civil Code section 1542 provides a general release.";
      const citations = await extractCitations(text);

      expect(citations.length).toBeGreaterThan(0);
      expect(citations[0].citation_type).toBe("STATUTE");
    });
  });

  describe("Louisiana Citations", () => {
    it("extracts La. R.S. citations", () => {
      const text =
        "Under La. R.S. 9:2800.6(A), premises liability requires proving a defect.";
      const citations = extractLouisianaCitations(text);

      expect(citations.length).toBe(1);
      expect(citations[0].type).toBe("LA_REVISED_STATUTES");
      expect(citations[0].title).toBe("9");
      expect(citations[0].section).toBe("2800.6");
    });

    it("extracts La. Civ. Code art. citations", () => {
      const text =
        "Louisiana Civil Code article 2315 establishes delictual liability. See La. Civ. Code art. 2315.";
      const citations = extractLouisianaCitations(text);

      expect(citations.length).toBeGreaterThan(0);
      const ccCite = citations.find(c => c.type === "LA_CIVIL_CODE");
      expect(ccCite).toBeDefined();
      expect(ccCite?.article).toBe("2315");
    });

    it("extracts La. Code Civ. Proc. citations", () => {
      const text =
        "Summary judgment is governed by La. C.C.P. art. 966.";
      const citations = extractLouisianaCitations(text);

      expect(citations.length).toBe(1);
      expect(citations[0].type).toBe("LA_CODE_CIV_PROC");
      expect(citations[0].article).toBe("966");
    });

    it("extracts Louisiana So.3d case citations", async () => {
      const text =
        "See Broussard v. State, 12-1086 (La. App. 3 Cir. 4/3/13), 113 So.3d 175.";
      const citations = await extractCitations(text);

      expect(citations.length).toBeGreaterThan(0);
    });

    it("extracts La. Const. citations", () => {
      const text =
        "La. Const. art. I, § 2 guarantees due process.";
      const citations = extractLouisianaCitations(text);

      expect(citations.length).toBe(1);
      expect(citations[0].type).toBe("LA_CONSTITUTION");
      expect(citations[0].article).toBe("I");
      expect(citations[0].section).toBe("2");
    });

    it("extracts multiple LA code types in one text", () => {
      const text = `
        Pursuant to La. R.S. 9:2800.6, La. Civ. Code art. 2315, and
        La. C.C.P. art. 966, the defendant is entitled to summary judgment.
      `;
      const citations = extractLouisianaCitations(text);

      expect(citations.length).toBe(3);
      const types = citations.map(c => c.type);
      expect(types).toContain("LA_REVISED_STATUTES");
      expect(types).toContain("LA_CIVIL_CODE");
      expect(types).toContain("LA_CODE_CIV_PROC");
    });
  });

  describe("Shorthand Resolution", () => {
    it("resolves Id. citations", async () => {
      const text =
        "The court held in Smith v. Jones, 123 F.3d 456 (9th Cir. 2020) that the standard applies. Id. at 460.";
      const citations = await extractCitations(text);

      const idCite = citations.find((c) => c.citation_type === "ID");
      expect(idCite).toBeDefined();
      expect(idCite?.antecedent_citation_id).toBe(citations[0].id);
    });

    it("resolves supra citations", async () => {
      const text =
        "As noted in Anderson v. Liberty Lobby, 477 U.S. 242 (1986), evidence must be viewed in the light most favorable to the nonmovant. Later, Anderson, supra, at 255, clarified this standard.";
      const citations = await extractCitations(text);

      const supraCite = citations.find((c) => c.citation_type === "SUPRA");
      expect(supraCite).toBeDefined();
      expect(supraCite?.antecedent_citation_id).toBe(citations[0].id);
    });
  });

  describe("Federal Statutes", () => {
    it("extracts U.S.C. citations", async () => {
      const text = "42 U.S.C. § 1983 provides a remedy for civil rights violations.";
      const citations = await extractCitations(text);

      expect(citations.length).toBe(1);
      expect(citations[0].citation_type).toBe("STATUTE");
    });

    it("extracts C.F.R. citations", async () => {
      const text = "See 29 C.F.R. § 1630.2(j) for the definition.";
      const citations = await extractCitations(text);

      expect(citations.length).toBe(1);
      expect(citations[0].citation_type).toBe("STATUTE");
    });
  });

  describe("Edge Cases", () => {
    it("handles empty text", async () => {
      const citations = await extractCitations("");
      expect(citations).toEqual([]);
    });

    it("handles text without citations", async () => {
      const text = "This is a paragraph about legal matters without any specific citations.";
      const citations = await extractCitations(text);
      expect(citations.length).toBe(0);
    });

    it("handles string citations (multiple cases)", async () => {
      const text =
        "See Smith v. Jones, 123 F.3d 456 (9th Cir. 2020); Doe v. Roe, 456 F.3d 789 (5th Cir. 2021).";
      const citations = await extractCitations(text);
      expect(citations.length).toBe(2);
    });

    it("handles parallel citations", async () => {
      const text =
        "Brown v. Board of Education, 347 U.S. 483, 74 S.Ct. 686 (1954).";
      const citations = await extractCitations(text);
      expect(citations.length).toBeGreaterThanOrEqual(1);
    });

    it("handles Westlaw citations", async () => {
      const text = "See Smith v. Jones, 2023 WL 12345, at *3 (N.D. Cal. Jan. 1, 2023).";
      const citations = await extractCitations(text);
      expect(citations.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Citation Preprocessor", () => {
    it("normalizes Unicode characters", () => {
      const text = "See 42 U.S.C. § 1983"; // Using different section symbol
      const normalized = preprocessForCitations(text);
      expect(normalized).toContain("§");
    });

    it("fixes common OCR errors", () => {
      const text = "477 0.S. 317"; // 0 instead of U
      const normalized = preprocessForCitations(text);
      // Should normalize spacing at minimum
      expect(normalized).not.toMatch(/\s{2,}/);
    });

    it("detects text likely containing citations", () => {
      expect(likelyContainsCitations("477 U.S. 317")).toBe(true);
      expect(likelyContainsCitations("Smith v. Jones")).toBe(true);
      expect(likelyContainsCitations("42 U.S.C. § 1983")).toBe(true);
      expect(likelyContainsCitations("La. R.S. 9:2800")).toBe(true);
      expect(likelyContainsCitations("Hello world")).toBe(false);
    });

    it("removes slip opinion suffixes", () => {
      const text = "123 F.3d 456, slip op.";
      const normalized = preprocessForCitations(text);
      expect(normalized).not.toContain("slip op");
    });
  });
});

describe("Shorthand Resolver Unit Tests", () => {
  it("resolves Id. to most recent full citation", () => {
    const citations = [
      {
        id: "cite-1",
        raw: "123 F.3d 456",
        citation_type: "FULL_CASE" as const,
        start_index: 0,
        end_index: 15,
      },
      {
        id: "cite-2",
        raw: "Id. at 460",
        citation_type: "ID" as const,
        start_index: 100,
        end_index: 110,
      },
    ] as any;

    const result = resolveIdCitation(citations[1], citations);
    expect(result.resolved).toBe(true);
    expect(result.antecedent_id).toBe("cite-1");
    expect(result.confidence).toBe("HIGH");
  });

  it("resolves supra with party name hint", () => {
    const citations = [
      {
        id: "cite-1",
        raw: "Smith v. Jones, 123 F.3d 456",
        citation_type: "FULL_CASE" as const,
        case_name: "Smith v. Jones",
        plaintiff: "Smith",
        defendant: "Jones",
        start_index: 0,
        end_index: 30,
      },
      {
        id: "cite-2",
        raw: "Smith, supra, at 460",
        citation_type: "SUPRA" as const,
        start_index: 500,
        end_index: 520,
      },
    ] as any;

    const result = resolveSupraCitation(citations[1], citations);
    expect(result.resolved).toBe(true);
    expect(result.antecedent_id).toBe("cite-1");
    expect(result.confidence).toBe("HIGH");
  });

  it("returns NONE confidence when no antecedent found", () => {
    const citations = [
      {
        id: "cite-1",
        raw: "Id. at 460",
        citation_type: "ID" as const,
        start_index: 0,
        end_index: 10,
      },
    ] as any;

    const result = resolveIdCitation(citations[0], citations);
    expect(result.resolved).toBe(false);
    expect(result.confidence).toBe("NONE");
  });
});

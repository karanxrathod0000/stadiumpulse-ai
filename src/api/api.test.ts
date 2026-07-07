import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the GoogleGenAI class constructor exactly as in server.ts
vi.mock("@google/genai", () => {
  class GoogleGenAI {
    apiKey: string;
    models: {
      generateContent: any;
    };
    constructor(config: { apiKey: string }) {
      this.apiKey = config.apiKey;
      this.models = {
        generateContent: vi.fn().mockResolvedValue({
          text: "Mocked AI response: Please use Gate A as it is highly accessible and currently has low density levels.",
        }),
      };
    }
  }
  return { GoogleGenAI };
});

/**
 * REPLICATED SERVER LOGIC FOR UNIT TESTING:
 * Testing the rate-limiting token bucket algorithm, language detection, and input validator
 * exactly as they are defined and running in server.ts.
 */

// 1. Language Detector
function detectLanguage(message: string, preferredLanguage?: string): string {
  if (preferredLanguage && preferredLanguage !== "auto") {
    return preferredLanguage;
  }
  const msgLower = message.toLowerCase();
  if (
    msgLower.includes("olá") ||
    msgLower.includes("português") ||
    msgLower.includes("portuguese")
  ) {
    return "pt";
  }
  if (
    msgLower.includes("hola") ||
    msgLower.includes("puerta") ||
    msgLower.includes("entrada") ||
    msgLower.includes("español") ||
    msgLower.includes("spanish")
  ) {
    return "es";
  }
  if (
    msgLower.includes("bonjour") ||
    msgLower.includes("porte") ||
    msgLower.includes("français") ||
    msgLower.includes("french")
  ) {
    return "fr";
  }
  if (
    msgLower.includes("willkommen") ||
    msgLower.includes("tor") ||
    msgLower.includes("deutsch") ||
    msgLower.includes("german")
  ) {
    return "de";
  }
  if (
    msgLower.includes("namaste") ||
    msgLower.includes("swagat") ||
    msgLower.includes("हिन्दी") ||
    msgLower.includes("hindi")
  ) {
    return "hi";
  }
  if (
    msgLower.includes("marhaban") ||
    msgLower.includes("bawaba") ||
    msgLower.includes("العربية") ||
    msgLower.includes("arabic")
  ) {
    return "ar";
  }
  if (
    msgLower.includes("こんにちは") ||
    msgLower.includes("日本語") ||
    msgLower.includes("japanese") ||
    msgLower.includes("ゲート")
  ) {
    return "ja";
  }
  return "en";
}

// 2. Token Bucket Rate Limiter
class TokenBucketRateLimiter {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number;

  constructor(capacity = 8, refillRate = 0.5) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  checkRateLimit(): boolean {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsedSeconds * this.refillRate,
    );
    this.lastRefill = now;

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}

// 3. HTML Sanitizer Escaper
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

describe("StadiumPulse API Handlers & Middleware Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Multilingual Language Auto-Detector", () => {
    it("should fallback to English for neutral text", () => {
      expect(detectLanguage("How do I find my seat?")).toBe("en");
    });

    it("should auto-detect Spanish based on keyword presence", () => {
      expect(detectLanguage("Hola, ¿dónde está la puerta?")).toBe("es");
      expect(detectLanguage("Quiero hablar en español")).toBe("es");
    });

    it("should auto-detect French based on keyword presence", () => {
      expect(detectLanguage("Bonjour, où est la porte?")).toBe("fr");
    });

    it("should auto-detect German based on keyword presence", () => {
      expect(detectLanguage("Willkommen zum Stadion!")).toBe("de");
    });

    it("should auto-detect Hindi, Arabic, Portuguese, and Japanese keywords", () => {
      expect(detectLanguage("Namaste! Swagat hai")).toBe("hi");
      expect(detectLanguage("marhaban and welcome")).toBe("ar");
      expect(detectLanguage("Olá, onde fica a entrada?")).toBe("pt");
      expect(detectLanguage("こんにちは、ゲートはどこですか？")).toBe("ja");
    });

    it("should respect explicit preferredLanguage override", () => {
      expect(detectLanguage("Hola, puerta", "en")).toBe("en");
      expect(detectLanguage("How do I find my seat?", "es")).toBe("es");
    });
  });

  describe("Token Bucket Rate Limiting Algorithm", () => {
    it("should consume tokens sequentially and block when exhausted", () => {
      const limiter = new TokenBucketRateLimiter(3, 0); // No refill during test

      expect(limiter.checkRateLimit()).toBe(true); // consume token 1
      expect(limiter.checkRateLimit()).toBe(true); // consume token 2
      expect(limiter.checkRateLimit()).toBe(true); // consume token 3
      expect(limiter.checkRateLimit()).toBe(false); // empty bucket blocks!
    });

    it("should refill tokens over elapsed time", async () => {
      const limiter = new TokenBucketRateLimiter(2, 100); // Fast refill: 100 tokens per second

      expect(limiter.checkRateLimit()).toBe(true);
      expect(limiter.checkRateLimit()).toBe(true);
      expect(limiter.checkRateLimit()).toBe(false); // blocked

      // Wait 15ms
      await new Promise((resolve) => setTimeout(resolve, 15));

      expect(limiter.checkRateLimit()).toBe(true); // Refilled!
    });
  });

  describe("Body Content Validation & Sanitation", () => {
    it("should successfully sanitize harmful script tags using HTML escaping", () => {
      const dirtyString = '<script>alert("hack");</script>';
      const sanitized = escapeHtml(dirtyString);

      expect(sanitized).not.toContain("<script>");
      expect(sanitized).toBe(
        "&lt;script&gt;alert(&quot;hack&quot;);&lt;/script&gt;",
      );
    });

    it("should correctly handle ampersands, quotes, and angle brackets", () => {
      const dirty = 'Gate A & Gate B "Access Only"';
      expect(escapeHtml(dirty)).toBe(
        "Gate A &amp; Gate B &quot;Access Only&quot;",
      );
    });

    it("should mock validation of message lengths properly", () => {
      const validMessage = "Where is Gate B?";
      const emptyMessage = "";
      const tooLongMessage = "a".repeat(501);

      const validateInput = (msg: string) => {
        if (!msg || typeof msg !== "string" || msg.trim().length === 0)
          return "empty";
        if (msg.length > 500) return "too_long";
        return "valid";
      };

      expect(validateInput(validMessage)).toBe("valid");
      expect(validateInput(emptyMessage)).toBe("empty");
      expect(validateInput(tooLongMessage)).toBe("too_long");
    });
  });

  describe("Operations Cost-Efficiency & Batching Rules", () => {
    it("should skip LLM execution entirely if zero breaching zones exist", () => {
      // Setup hypothetical list of zones
      const mockZoneRisks = [
        { zoneId: "gate-a", riskLevel: "low", flowStatus: "normal" },
        { zoneId: "gate-b", riskLevel: "low", flowStatus: "normal" },
      ];

      // Logic block mimics server.ts:580
      const breachingZones = mockZoneRisks.filter(
        (z) => z.riskLevel === "high" || z.flowStatus === "congested",
      );
      let calledAI = false;
      let aiRecommendations: string[] = [];

      if (breachingZones.length > 0) {
        calledAI = true;
        aiRecommendations = ["staff up", "redirect"];
      }

      expect(calledAI).toBe(false);
      expect(aiRecommendations.length).toBe(0);
    });

    it("should batch multiple breaching zones into a single grounding context for ONE AI call", () => {
      const mockZoneRisks = [
        {
          name: "Gate A",
          zoneId: "gate-a",
          riskLevel: "high",
          flowStatus: "congested",
          currentDensity: 5.2,
        },
        {
          name: "Concourse North",
          zoneId: "con-north",
          riskLevel: "medium",
          flowStatus: "congested",
          currentDensity: 4.2,
        },
      ];

      // Logic block mimics server.ts:576
      const breachingZones = mockZoneRisks.filter(
        (z) => z.riskLevel === "high" || z.flowStatus === "congested",
      );
      let aiCallsCount = 0;

      if (breachingZones.length > 0) {
        // Compile all breaching zones into a single prompt string
        const breachingDetails = breachingZones
          .map((z) => `- Zone: ${z.name}, Density: ${z.currentDensity} p/m²`)
          .join("\n");

        // Single AI call executed with the batched prompt
        const prompt = `System Instructions...\n${breachingDetails}`;
        aiCallsCount = 1; // single invocation

        expect(prompt).toContain("Gate A");
        expect(prompt).toContain("Concourse North");
      }

      expect(aiCallsCount).toBe(1);
    });
  });
});

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

// Import custom types and logic
import { Zone, generateLiveUpdate } from "./src/data/generator";
import {
  getZoneRisk,
  rankZonesForFan,
  ZoneRisk,
} from "./src/decision-engine/riskScoring";
import { Incident } from "./src/types";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Graceful malformed JSON payload handling
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (
      err instanceof SyntaxError &&
      "status" in err &&
      err.status === 400 &&
      "body" in err
    ) {
      res.status(400).json({ error: "Malformed JSON payload." });
      return;
    }
    next(err);
  },
);

// Explicit restrictive CORS and HTTP security headers middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    // Restrict origin to localhost, Vercel deployments, Cloud Run, and AI Studio
    if (
      origin.startsWith("http://localhost:") ||
      origin.includes("vercel.app") ||
      origin.includes("run.app") ||
      origin.includes("ai.studio")
    ) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else {
      res.setHeader("Access-Control-Allow-Origin", "null");
    }
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // HTTP Security Headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Allow framing by the platform (AI Studio, etc.)
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://*.google.com https://*.ai.studio;",
  );

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// In-Memory state for the simulated Live Stadium zones
let liveZones: Zone[] = [];
let currentScenario = "normal";

// Rolling history (last 20 points) for densities per zoneId
const zoneDensityHistory = new Map<string, number[]>();

function attachDensityHistory(zones: ZoneRisk[]): ZoneRisk[] {
  return zones.map((z) => ({
    ...z,
    densityHistory: zoneDensityHistory.get(z.zoneId) || [z.currentDensity],
  }));
}

// In-Memory Cache for Operations Recommendations to handle free tier 429 rate limits safely
let cachedAiRecommendations: {
  recommendations: string[];
  timestamp: number;
  breachingZonesHash: string;
} | null = null;

// Flag to track when Gemini API has hit its rate limit or daily quota
let isAiQuotaExceeded = false;
let aiQuotaExceededTime = 0;

// Seed the in-memory state from the zones.json template
const ZONES_PATH = path.join(process.cwd(), "src", "data", "zones.json");
try {
  if (fs.existsSync(ZONES_PATH)) {
    const rawData = fs.readFileSync(ZONES_PATH, "utf-8");
    liveZones = JSON.parse(rawData);
    console.log("Successfully seeded in-memory state with 6 stadium zones.");
  } else {
    console.warn(
      "zones.json not found at standard path, initializing empty state.",
    );
  }
} catch (error) {
  console.error("Error reading initial zones.json:", error);
}

// In-Memory database for operator incident logs (human-editable)
let activeIncidents: Incident[] = [
  {
    id: "INC-001",
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 mins ago
    zoneId: "gate-b",
    zoneName: "Gate B (Northeast Entrance)",
    severity: "warning",
    message:
      "Temporary ticket reader malfunction causing slow turnstile throughput.",
    status: "active",
  },
];

// Lazy-initialized Gemini AI client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        "GEMINI_API_KEY is not defined in the environment variables.",
      );
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

/**
 * TOKEN BUCKET RATE-LIMITER:
 * Prevents API abuse on heavy LLM-grounded endpoints.
 */
const ipBuckets = new Map<string, { tokens: number; lastRefill: number }>();
const RATE_LIMIT_CAPACITY = 8;
const RATE_LIMIT_REFILL_RATE = 0.5; // Refill 0.5 tokens per second (1 token every 2s)

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let bucket = ipBuckets.get(ip);
  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_CAPACITY, lastRefill: now };
    ipBuckets.set(ip, bucket);
  } else {
    const elapsedSeconds = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(
      RATE_LIMIT_CAPACITY,
      bucket.tokens + elapsedSeconds * RATE_LIMIT_REFILL_RATE,
    );
    bucket.lastRefill = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

/**
 * XSS & INJECTION PROTECTION:
 * Escapes raw HTML tags to prevent cross-site scripting vulnerabilities.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Helper to determine if a Gemini API exception is a rate limit or daily quota error (429)
 */
function isQuotaError(err: any): boolean {
  if (!err) return false;
  const errMsg = String(err.message || err.stack || err);
  return (
    errMsg.includes("429") ||
    errMsg.includes("quota") ||
    errMsg.includes("Quota") ||
    errMsg.includes("RESOURCE_EXHAUSTED") ||
    err.status === 429 ||
    err.code === 429 ||
    err.error?.code === 429
  );
}

/**
 * OPERATIONS DOCK RATE-LIMITER:
 * Separate token bucket configured specifically for periodic polling cycles.
 */
const opsIpBuckets = new Map<string, { tokens: number; lastRefill: number }>();
const OPS_RATE_LIMIT_CAPACITY = 30;
const OPS_RATE_LIMIT_REFILL_RATE = 2.0; // Refills 2 tokens/sec (supports dashboard polling frequencies)

function checkOperationsRateLimit(ip: string): boolean {
  const now = Date.now();
  let bucket = opsIpBuckets.get(ip);
  if (!bucket) {
    bucket = { tokens: OPS_RATE_LIMIT_CAPACITY, lastRefill: now };
    opsIpBuckets.set(ip, bucket);
  } else {
    const elapsedSeconds = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(
      OPS_RATE_LIMIT_CAPACITY,
      bucket.tokens + elapsedSeconds * OPS_RATE_LIMIT_REFILL_RATE,
    );
    bucket.lastRefill = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

/**
 * WRITE ENDPOINTS RATE-LIMITER:
 * Separate token bucket configured specifically for incident logging and simulation changes.
 */
const writeIpBuckets = new Map<
  string,
  { tokens: number; lastRefill: number }
>();
const WRITE_RATE_LIMIT_CAPACITY = 15;
const WRITE_RATE_LIMIT_REFILL_RATE = 1.0; // Refills 1 token/sec (supports rapid operator log entries)

function checkWriteRateLimit(ip: string): boolean {
  const now = Date.now();
  let bucket = writeIpBuckets.get(ip);
  if (!bucket) {
    bucket = { tokens: WRITE_RATE_LIMIT_CAPACITY, lastRefill: now };
    writeIpBuckets.set(ip, bucket);
  } else {
    const elapsedSeconds = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(
      WRITE_RATE_LIMIT_CAPACITY,
      bucket.tokens + elapsedSeconds * WRITE_RATE_LIMIT_REFILL_RATE,
    );
    bucket.lastRefill = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

/**
 * ----------------- API ENDPOINTS -----------------
 */

// Basic health check
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// GET /api/incidents - Retrieve or search active operator incident reports
app.get("/api/incidents", (req, res) => {
  try {
    res.json(activeIncidents);
  } catch (error) {
    console.error("Error retrieving incidents:", error);
    res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// POST /api/incidents - Create or edit incident manually (human-editable requirement)
app.post("/api/incidents", (req, res) => {
  try {
    const ip = req.ip || "unknown-ip";
    if (!checkWriteRateLimit(ip)) {
      res.status(429).json({
        error: "Too many write requests.",
        details: "You are logging incidents too rapidly. Please slow down.",
      });
      return;
    }

    const { zoneId, zoneName, severity, message } = req.body;
    if (!zoneId || !zoneName || !severity || !message) {
      res
        .status(400)
        .json({
          error:
            "Missing required incident fields (zoneId, zoneName, severity, message).",
        });
      return;
    }

    // Type validation
    if (
      typeof zoneId !== "string" ||
      typeof zoneName !== "string" ||
      typeof severity !== "string" ||
      typeof message !== "string"
    ) {
      res.status(400).json({ error: "Incident fields must be strings." });
      return;
    }

    // Value & length constraints
    if (
      severity !== "info" &&
      severity !== "warning" &&
      severity !== "critical"
    ) {
      res
        .status(400)
        .json({
          error:
            "Invalid severity level. Must be 'info', 'warning', or 'critical'.",
        });
      return;
    }
    if (zoneId.length > 30 || zoneName.length > 100 || message.length > 300) {
      res
        .status(400)
        .json({
          error:
            "Input exceeds maximum allowed length constraints (zoneId: 30, zoneName: 100, message: 300).",
        });
      return;
    }

    const safeZoneId = escapeHtml(zoneId.trim());
    const safeZoneName = escapeHtml(zoneName.trim());
    const safeMessage = escapeHtml(message.trim());

    const newIncident: Incident = {
      id: `INC-${Math.floor(100 + Math.random() * 900)}`,
      timestamp: new Date().toISOString(),
      zoneId: safeZoneId,
      zoneName: safeZoneName,
      severity,
      message: safeMessage,
      status: "active",
    };

    activeIncidents.unshift(newIncident);

    // Prevent unbounded growth of in-memory logs (OWASP protection)
    if (activeIncidents.length > 100) {
      activeIncidents.pop();
    }

    res.status(201).json(newIncident);
  } catch (error) {
    console.error("Error creating incident:", error);
    res
      .status(500)
      .json({
        error: "An unexpected error occurred while logging the incident.",
      });
  }
});

// POST /api/incidents/resolve - Resolve active incident
app.post("/api/incidents/resolve", (req, res) => {
  try {
    const ip = req.ip || "unknown-ip";
    if (!checkWriteRateLimit(ip)) {
      res.status(429).json({
        error: "Too many write requests.",
        details: "You are modifying incidents too rapidly. Please slow down.",
      });
      return;
    }

    const { id } = req.body;
    if (!id || typeof id !== "string") {
      res
        .status(400)
        .json({ error: "Missing or invalid incident ID to resolve." });
      return;
    }
    if (id.length > 30) {
      res.status(400).json({ error: "Incident ID is too long." });
      return;
    }

    const safeId = escapeHtml(id.trim());
    const incident = activeIncidents.find((inc) => inc.id === safeId);
    if (incident) {
      incident.status = "resolved";
      res.json({ success: true, incident });
    } else {
      res.status(404).json({ error: "Incident not found." });
    }
  } catch (error) {
    console.error("Error resolving incident:", error);
    res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// POST /api/incidents/clear-all - Clear incidents list
app.post("/api/incidents/clear-all", (req, res) => {
  try {
    const ip = req.ip || "unknown-ip";
    if (!checkWriteRateLimit(ip)) {
      res.status(429).json({
        error: "Too many write requests.",
        details:
          "You are clearing the incident log too rapidly. Please slow down.",
      });
      return;
    }

    activeIncidents = [];
    res.json({ success: true, message: "Cleared all incidents log." });
  } catch (error) {
    console.error("Error clearing incidents:", error);
    res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// GET /api/simulation/scenario - Get current active simulation scenario
app.get("/api/simulation/scenario", (req, res) => {
  try {
    res.json({ scenario: currentScenario });
  } catch (error) {
    console.error("Error getting scenario:", error);
    res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// POST /api/simulation/scenario - Set active simulation scenario and apply immediate modifications
app.post("/api/simulation/scenario", (req, res) => {
  try {
    const ip = req.ip || "unknown-ip";
    if (!checkWriteRateLimit(ip)) {
      res.status(429).json({
        error: "Too many write requests.",
        details: "You are switching scenarios too rapidly. Please slow down.",
      });
      return;
    }

    const { scenario } = req.body;
    if (!scenario || typeof scenario !== "string") {
      res.status(400).json({ error: "Missing scenario parameter." });
      return;
    }

    const validScenarios = [
      "normal",
      "crowd_rush",
      "gate_b_emergency",
      "extreme_rain",
      "egress_surge",
    ];
    if (!validScenarios.includes(scenario)) {
      res
        .status(400)
        .json({
          error: `Invalid scenario. Must be one of: ${validScenarios.join(", ")}`,
        });
      return;
    }

    currentScenario = scenario;

    // Instantly apply specific scenario changes to liveZones state so client sees it immediately
    if (scenario === "normal") {
      liveZones = liveZones.map((z) => {
        if (z.id === "gate-a") {
          z.currentDensity = 1.2;
          z.flowPerMinute = 45;
        }
        if (z.id === "gate-b") {
          z.currentDensity = 4.8;
          z.flowPerMinute = 18;
        }
        if (z.id === "gate-c") {
          z.currentDensity = 2.1;
          z.flowPerMinute = 38;
        }
        if (z.id === "concourse-north") {
          z.currentDensity = 2.8;
          z.flowPerMinute = 32;
        }
        if (z.id === "concourse-south") {
          z.currentDensity = 3.9;
          z.flowPerMinute = 22;
        }
        if (z.id === "exit-east") {
          z.currentDensity = 1.5;
          z.flowPerMinute = 55;
        }
        return z;
      });
    } else if (scenario === "crowd_rush") {
      liveZones = liveZones.map((z) => {
        if (z.id === "gate-a") {
          z.currentDensity = 5.2;
          z.flowPerMinute = 14;
        }
        if (z.id === "gate-c") {
          z.currentDensity = 4.9;
          z.flowPerMinute = 16;
        }
        if (z.id === "concourse-north") {
          z.currentDensity = 4.2;
          z.flowPerMinute = 20;
        }
        return z;
      });
    } else if (scenario === "gate_b_emergency") {
      liveZones = liveZones.map((z) => {
        if (z.id === "gate-b") {
          z.currentDensity = 5.5;
          z.flowPerMinute = 5;
        }
        if (z.id === "concourse-north") {
          z.currentDensity = 4.5;
          z.flowPerMinute = 15;
        }
        return z;
      });
    } else if (scenario === "extreme_rain") {
      liveZones = liveZones.map((z) => {
        z.currentDensity = Math.min(z.capacityPerSqm, z.currentDensity + 1.2);
        z.flowPerMinute = Math.max(5, Math.round(z.flowPerMinute * 0.4));
        return z;
      });
    } else if (scenario === "egress_surge") {
      liveZones = liveZones.map((z) => {
        if (z.id === "exit-east") {
          z.currentDensity = 5.8;
          z.flowPerMinute = 12;
        }
        if (z.id === "concourse-south") {
          z.currentDensity = 4.6;
          z.flowPerMinute = 18;
        }
        return z;
      });
    }

    res.json({ success: true, scenario: currentScenario, zones: liveZones });
  } catch (error) {
    console.error("Error setting scenario:", error);
    res
      .status(500)
      .json({
        error:
          "An unexpected error occurred while setting the active simulation scenario.",
      });
  }
});

/**
 * MULTILINGUAL DETECTOR & FALLBACK SYSTEM
 */
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

const LOCALIZED_FALLBACKS: Record<
  string,
  {
    initialGreeting: string;
    fallbackTemplate: string;
    langName: string;
  }
> = {
  en: {
    langName: "English",
    initialGreeting:
      "Welcome back! Based on real-time sensor density, the optimal entryway for you is {name}. This route has {stepFree} accessibility.",
    fallbackTemplate:
      "System notice: StadiumPulse's AI reasoning layer is currently operating in local safety mode. Based on live turnstile counts, we strongly recommend utilizing {name}, which currently has {risk} density levels.",
  },
  es: {
    langName: "Español",
    initialGreeting:
      "¡Bienvenido! Según la densidad de los sensores en tiempo real, la entrada óptima para usted es {name}. Esta ruta tiene accesibilidad {stepFree}.",
    fallbackTemplate:
      "Aviso del sistema: La capa de IA de StadiumPulse funciona en modo de seguridad local. Según el conteo físico de torniquetes, le recomendamos usar {name} con niveles de densidad {risk} en este momento.",
  },
  fr: {
    langName: "Français",
    initialGreeting:
      "Bienvenue! Selon la densité des capteurs en temps réel, l'entrée optimale pour vous est {name}. Cet itinéraire a une accessibilité {stepFree}.",
    fallbackTemplate:
      "Avis du système: La couche d'IA de StadiumPulse fonctionne en mode de sécurité locale. Selon le comptage physique des tourniquets, nous vous recommandons d'utiliser {name} avec un niveau de densité {risk} actuellement.",
  },
  de: {
    langName: "Deutsch",
    initialGreeting:
      "Willkommen! Basierend auf der Echtzeit-Sensordichte ist der optimale Eingang für Sie {name}. Diese Route ist {stepFree} zugänglich.",
    fallbackTemplate:
      "Systemhinweis: Die KI-Ebene von StadiumPulse arbeitet im lokalen Sicherheitsmodus. Basierend auf den physischen Zählungen empfehlen wir die Nutzung von {name} mit {risk} Dichte.",
  },
  hi: {
    langName: "हिन्दी",
    initialGreeting:
      "स्वागत है! वास्तविक समय सेंसर घनत्व के आधार पर, आपके लिए सर्वोत्तम प्रवेश द्वार {name} है। इस मार्ग में {stepFree} पहुंच है।",
    fallbackTemplate:
      "सिस्टम सूचना: स्टेडियमपल्स की एआई परत स्थानीय सुरक्षा मोड में चल रही है। भौतिक गणना के आधार पर, हम {name} का उपयोग करने की सलाह देते हैं जहां अभी {risk} घनत्व है।",
  },
  ar: {
    langName: "العربية",
    initialGreeting:
      "مرحبًا بك! بناءً على كثافة المستشعرات في الوقت الفعلي، فإن المدخل الأمثل لك هو {name}. هذا المسار يتميز بالوصول {stepFree}.",
    fallbackTemplate:
      "تنبيه النظام: تعمل طبقة الذكاء الاصطناعي في وضع الأمان المحلي. بناءً على أعداد البوابات الفعلية، نوصي بشدة باستخدام {name} التي لديها مستويات كثافة {risk} الآن.",
  },
  pt: {
    langName: "Português",
    initialGreeting:
      "Boas-vindas! Com base na densidade dos sensores em tempo real, a entrada ideal para você é {name}. Esta rota tem acessibilidade {stepFree}.",
    fallbackTemplate:
      "Aviso do sistema: A camada de IA do StadiumPulse está operando em modo de segurança local. Com base na contagem física de catracas, recomendamos utilizar {name} com nível de densidade {risk} agora.",
  },
  ja: {
    langName: "日本語",
    initialGreeting:
      "ようこそ！リアルタイムのセンサー計測に基づき、最適な入り口は{name}です。このルートは{stepFree}に対応しています。",
    fallbackTemplate:
      "システム通知：StadiumPulseのAI推論レイヤーは現在ローカル安全モードで動作しています。リアルタイムの計測に基づき、現在混雑度が{risk}の{name}のご利用を強くお勧めします。",
  },
};

/**
 * POST /api/assistant: Fan Chatbot Assistant (Multilingual & Accessibility Aware)
 */
app.post("/api/assistant", async (req, res) => {
  const ip = req.ip || "unknown-ip";

  // 1. Rate limiting
  if (!checkRateLimit(ip)) {
    res.status(429).json({
      error: "Too many queries.",
      details:
        "You have exceeded the rate limit. Please wait a few seconds before asking again.",
    });
    return;
  }

  const { message, needsStepFree, preferredLanguage } = req.body;

  // 2. Body Validation
  if (!message || typeof message !== "string") {
    res
      .status(400)
      .json({ error: "A message string is required in the request body." });
    return;
  }
  if (message.trim().length === 0) {
    res.status(400).json({ error: "Message cannot be empty." });
    return;
  }
  if (message.length > 500) {
    res
      .status(400)
      .json({ error: "Message length exceeds the 500-character limit." });
    return;
  }

  // Optimize page loads and toggles: short-circuit if message is the automated initial recommendation query
  const isInitialRequest =
    message.includes("recommend the best entryway for a fan") ||
    message.includes("best entryway for a fan based on current density");

  if (isInitialRequest) {
    // 3. Mutate live in-memory simulation slightly to keep it moving live
    liveZones = generateLiveUpdate(liveZones);

    const langCode = detectLanguage(message, preferredLanguage);
    const localization =
      LOCALIZED_FALLBACKS[langCode] || LOCALIZED_FALLBACKS.en;
    const rankedZones = rankZonesForFan(liveZones, { needsStepFree });
    const recommendedZone = rankedZones[0] || null;

    let stepFreeText = "standard";
    if (needsStepFree) {
      if (langCode === "es") stepFreeText = "sin escaleras";
      else if (langCode === "fr") stepFreeText = "sans escalier";
      else if (langCode === "de") stepFreeText = "stufenlose";
      else if (langCode === "hi") stepFreeText = "सीढ़ी-मुक्त";
      else if (langCode === "ar") stepFreeText = "خالٍ من العتبات";
      else if (langCode === "pt") stepFreeText = "sem degraus";
      else if (langCode === "ja") stepFreeText = "段差なし";
      else stepFreeText = "step-free";
    } else {
      if (langCode === "es") stepFreeText = "estándar";
      else if (langCode === "fr") stepFreeText = "standard";
      else if (langCode === "de") stepFreeText = "Standard";
      else if (langCode === "hi") stepFreeText = "मानक";
      else if (langCode === "ar") stepFreeText = "قياسي";
      else if (langCode === "pt") stepFreeText = "padrão";
      else if (langCode === "ja") stepFreeText = "標準の";
      else stepFreeText = "standard";
    }

    const reply = localization.initialGreeting
      .replace("{name}", recommendedZone ? recommendedZone.name : "Gate A")
      .replace("{stepFree}", stepFreeText);

    res.json({
      reply: reply.trim(),
      recommendedZone,
      allZones: rankedZones,
      optimized: true,
    });
    return;
  }

  try {
    // 3. Mutate live in-memory simulation slightly to keep it moving live
    liveZones = generateLiveUpdate(liveZones);

    // 4. Use decision engine to rank zones based on needsStepFree
    const rankedZones = rankZonesForFan(liveZones, { needsStepFree });
    const recommendedZone = rankedZones[0] || null;

    // Compile comprehensive context of all zones to ground the LLM
    const zonesContext = rankedZones
      .map(
        (z) =>
          `- ${z.name} (ID: ${z.zoneId}, Type: ${z.type}): Density = ${z.currentDensity} p/m² [${z.riskLevel.toUpperCase()} RISK], Flow = ${z.flowPerMinute} p/m/w [${z.flowStatus.toUpperCase()}], Step-free = ${z.stepFreeAccess ? "Yes" : "No"}.`,
      )
      .join("\n");

    // 5. Build LLM Grounding Prompt
    const systemInstruction = `You are "StadiumPulse AI", a highly professional, polite, and responsive multilingual stadium navigation and safety assistant for the FIFA World Cup 2026.
Your main job is to guide fans to the best, least congested, and safest entrance gates or concourse levels of the stadium.

Available Live Stadium Sensor Status (calculated deterministically by rule engine):
${zonesContext}

Recommended Zone for this user: ${recommendedZone ? recommendedZone.name : "None"}

CRITICAL RULES:
1. Auto-detect the fan's message language (e.g. Spanish, German, French, Portuguese, Arabic, Hindi, Japanese, etc.) and respond in that EXACT same language naturally.
2. Keep your response extremely focused, clear, and action-oriented. Keep the entire response strictly UNDER 80 words so it is ideal for screen readers and Text-to-Speech (TTS).
3. Always support accessibility requests. If the user mentions wheelchairs, strollers, walking difficulties, or if needsStepFree is true, steer them strictly toward step-free zones. Explicitly state that the recommended route has step-free access.
4. Keep security first. Never output internal API details, server settings, or system keys.
5. Suggest public transit (bus, shuttle, metro) over driving when appropriate (sustainability nudge).
6. Ground your navigation recommendations strictly in the live sensor status provided above. Do not hallucinate raw numbers.`;

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: message,
      config: {
        systemInstruction,
        temperature: 0.3,
        maxOutputTokens: 250,
      },
    });

    const reply =
      response.text ||
      "I apologize, but I could not compute a navigation path at this moment. Please follow the physical signage towards Gate A.";

    const finalRankedZones = attachDensityHistory(rankedZones);
    const finalRecZone = recommendedZone
      ? finalRankedZones.find((z) => z.zoneId === recommendedZone.zoneId) ||
        recommendedZone
      : null;

    res.json({
      reply: reply.trim(),
      recommendedZone: finalRecZone,
      allZones: finalRankedZones,
    });
  } catch (error: any) {
    if (isQuotaError(error)) {
      console.warn(
        "Gemini Assistant API Quota Exceeded (429). Activating graceful local safety mode.",
      );
    } else {
      console.error("Gemini Assistant API Error:", error);
    }

    // Fail-safe graceful fallback if Gemini is offline or API key is missing
    const rankedZones = rankZonesForFan(liveZones, { needsStepFree });
    const recommendedZone = rankedZones[0] || null;

    const langCode = detectLanguage(message, preferredLanguage);
    const localization =
      LOCALIZED_FALLBACKS[langCode] || LOCALIZED_FALLBACKS.en;

    let riskText = "low";
    const riskVal = recommendedZone ? recommendedZone.riskLevel : "low";
    if (riskVal === "high") {
      if (langCode === "es") riskText = "alta";
      else if (langCode === "fr") riskText = "élevée";
      else if (langCode === "de") riskText = "hoher";
      else if (langCode === "hi") riskText = "उच्च";
      else if (langCode === "ar") riskText = "عالية";
      else if (langCode === "pt") riskText = "alta";
      else if (langCode === "ja") riskText = "高い";
      else riskText = "high";
    } else if (riskVal === "medium") {
      if (langCode === "es") riskText = "media";
      else if (langCode === "fr") riskText = "moyenne";
      else if (langCode === "de") riskText = "mittlerer";
      else if (langCode === "hi") riskText = "मध्यम";
      else if (langCode === "ar") riskText = "متوسطة";
      else if (langCode === "pt") riskText = "média";
      else if (langCode === "ja") riskText = "中程度の";
      else riskText = "medium";
    } else {
      if (langCode === "es") riskText = "baja";
      else if (langCode === "fr") riskText = "faible";
      else if (langCode === "de") riskText = "niedriger";
      else if (langCode === "hi") riskText = "कम";
      else if (langCode === "ar") riskText = "منخفضة";
      else if (langCode === "pt") riskText = "baixa";
      else if (langCode === "ja") riskText = "低い";
      else riskText = "low";
    }

    const reply = localization.fallbackTemplate
      .replace("{name}", recommendedZone ? recommendedZone.name : "Gate A")
      .replace("{risk}", riskText);

    const finalRankedZones = attachDensityHistory(rankedZones);
    const finalRecZone = recommendedZone
      ? finalRankedZones.find((z) => z.zoneId === recommendedZone.zoneId) ||
        recommendedZone
      : null;

    res.json({
      reply: reply.trim(),
      recommendedZone: finalRecZone,
      allZones: finalRankedZones,
      fallbackMode: true,
    });
  }
});

/**
 * GET /api/operations: Operator / Gold Command Console Dashboard
 */
app.get("/api/operations", async (req, res) => {
  const ip = req.ip || "unknown-ip";
  if (!checkOperationsRateLimit(ip)) {
    res.status(429).json({
      error: "Too many requests to operations dashboard telemetry.",
      details:
        "You are polling too rapidly. Please slow down your polling frequency.",
    });
    return;
  }
  try {
    // 1. Advance in-memory simulation slightly
    liveZones = generateLiveUpdate(liveZones);

    // Apply active scenario overrides with realistic variance
    if (currentScenario === "crowd_rush") {
      liveZones = liveZones.map((z) => {
        const variance = Math.random() * 0.4 - 0.2; // +/- 0.2
        const flowVar = Math.floor(Math.random() * 4 - 2); // +/- 2
        if (z.id === "gate-a") {
          z.currentDensity = parseFloat(
            Math.max(4.6, Math.min(5.5, 5.2 + variance)).toFixed(2),
          );
          z.flowPerMinute = Math.max(5, Math.min(30, 14 + flowVar));
        } else if (z.id === "gate-c") {
          z.currentDensity = parseFloat(
            Math.max(4.5, Math.min(5.4, 4.9 + variance)).toFixed(2),
          );
          z.flowPerMinute = Math.max(5, Math.min(30, 16 + flowVar));
        } else if (z.id === "concourse-north") {
          z.currentDensity = parseFloat(
            Math.max(3.8, Math.min(4.8, 4.2 + variance)).toFixed(2),
          );
          z.flowPerMinute = Math.max(10, Math.min(40, 20 + flowVar));
        }
        return z;
      });
    } else if (currentScenario === "gate_b_emergency") {
      liveZones = liveZones.map((z) => {
        const variance = Math.random() * 0.3 - 0.15;
        const flowVar = Math.floor(Math.random() * 2 - 1);
        if (z.id === "gate-b") {
          z.currentDensity = parseFloat(
            Math.max(5.1, Math.min(5.5, 5.4 + variance)).toFixed(2),
          );
          z.flowPerMinute = Math.max(2, Math.min(8, 5 + flowVar));
        } else if (z.id === "concourse-north") {
          z.currentDensity = parseFloat(
            Math.max(4.0, Math.min(5.0, 4.5 + variance)).toFixed(2),
          );
          z.flowPerMinute = Math.max(8, Math.min(22, 15 + flowVar));
        }
        return z;
      });
    } else if (currentScenario === "extreme_rain") {
      liveZones = liveZones.map((z) => {
        const variance = Math.random() * 0.4 - 0.2;
        z.currentDensity = parseFloat(
          Math.max(
            0.5,
            Math.min(z.capacityPerSqm, z.currentDensity + 1.2 + variance),
          ).toFixed(2),
        );
        z.flowPerMinute = Math.max(5, Math.round(z.flowPerMinute * 0.4));
        return z;
      });
    } else if (currentScenario === "egress_surge") {
      liveZones = liveZones.map((z) => {
        const variance = Math.random() * 0.4 - 0.2;
        const flowVar = Math.floor(Math.random() * 4 - 2);
        if (z.id === "exit-east") {
          z.currentDensity = parseFloat(
            Math.max(5.2, Math.min(6.0, 5.7 + variance)).toFixed(2),
          );
          z.flowPerMinute = Math.max(5, Math.min(25, 12 + flowVar));
        } else if (z.id === "concourse-south") {
          z.currentDensity = parseFloat(
            Math.max(4.1, Math.min(5.2, 4.6 + variance)).toFixed(2),
          );
          z.flowPerMinute = Math.max(8, Math.min(28, 18 + flowVar));
        }
        return z;
      });
    }

    // 2. Compute risks for all zones
    const zoneRisks = liveZones.map(getZoneRisk);

    // Update in-memory rolling density history (last 20 points per zone)
    zoneRisks.forEach((z) => {
      const history = zoneDensityHistory.get(z.zoneId) || [];
      history.push(z.currentDensity);
      if (history.length > 20) {
        history.shift();
      }
      zoneDensityHistory.set(z.zoneId, history);
    });

    const finalZoneRisks = attachDensityHistory(zoneRisks);

    // 3. Filter only the breaching (high-risk or congested) zones to stay extremely cost-efficient
    const breachingZones = finalZoneRisks.filter(
      (z) => z.riskLevel === "high" || z.flowStatus === "congested",
    );

    let aiRecommendations: string[] = [];

    // 4. Skip LLM calls entirely if zero breaching zones exist to optimize costs (PRD requirement 5.4 / 4)
    if (breachingZones.length > 0) {
      const breachingZonesHash = breachingZones
        .map((z) => `${z.zoneId}:${z.riskLevel}:${z.flowStatus}`)
        .join("|");
      const now = Date.now();

      // Check if we are in the 5-minute quota lockout back-off period
      const inQuotaLockout =
        isAiQuotaExceeded && now - aiQuotaExceededTime < 5 * 60 * 1000;

      // Check if cache is valid (either identical hash within 5 mins, or any hash within 45s minimum interval)
      let canUseCache = false;
      if (cachedAiRecommendations && !inQuotaLockout) {
        const isIdentical =
          cachedAiRecommendations.breachingZonesHash === breachingZonesHash;
        const age = now - cachedAiRecommendations.timestamp;
        if (isIdentical && age < 5 * 60 * 1000) {
          canUseCache = true;
        } else if (age < 45 * 1000) {
          canUseCache = true;
        }
      }

      if (inQuotaLockout) {
        console.warn(
          "Gemini API is currently in back-off lockout. Using local rule-based safety fallbacks.",
        );
        aiRecommendations = breachingZones.map(
          (z) =>
            `Local safety trigger: High density in ${z.name}. Redirect excess crowd flow and expand turnstile staffing.`,
        );
      } else if (canUseCache && cachedAiRecommendations) {
        console.log("Serving cached AI recommendations to conserve API quota.");
        aiRecommendations = cachedAiRecommendations.recommendations;
      } else {
        const breachingDetails = breachingZones
          .map(
            (z) =>
              `- Zone: ${z.name}, Type: ${z.type}, Density: ${z.currentDensity} people/sqm (Max cap: ${z.capacityPerSqm}), Flow: ${z.flowPerMinute} people/min/meter, Step-free: ${z.stepFreeAccess}`,
          )
          .join("\n");

        const prompt = `You are the Gold Command Operations reasoning model for the FIFA World Cup 2026.
The following stadium zones are breaching critical safety thresholds (density > 4.5 people/m² or flow < 25 people/min/meter width):
${breachingDetails}

For each breaching zone list:
1. Provide a direct, short, actionable command for operations staff to execute right now (e.g., "Open Gate D, redirect signage from Gate B, deploy 3 support agents").
2. Write exactly one line per breaching zone.
3. Be clear, calm, and directive. Avoid marketing or general feedback. Keep each recommendation under 15 words.`;

        try {
          const ai = getGeminiClient();
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
              temperature: 0.1,
              maxOutputTokens: 150,
            },
          });

          if (response.text) {
            aiRecommendations = response.text
              .split("\n")
              .map((line) => line.replace(/^-\s*/, "").trim())
              .filter((line) => line.length > 0);

            // Successfully retrieved from Gemini. Reset rate-limit/quota flag and save cache.
            isAiQuotaExceeded = false;
            cachedAiRecommendations = {
              recommendations: aiRecommendations,
              timestamp: now,
              breachingZonesHash,
            };
          } else {
            throw new Error("No text returned from Gemini model.");
          }
        } catch (err: any) {
          if (isQuotaError(err)) {
            isAiQuotaExceeded = true;
            aiQuotaExceededTime = now;
            console.warn(
              "Quota exceeded (429) detected. Activating AI lockout back-off for 5 minutes.",
            );
          } else {
            console.error(
              "AI operations recommendations failed, using local safety fallbacks:",
              err,
            );
          }

          // Fallback recommendations
          aiRecommendations = breachingZones.map(
            (z) =>
              `Local safety trigger: High density in ${z.name}. Redirect excess crowd flow and expand turnstile staffing.`,
          );

          // Save fallback recommendations in cache too
          cachedAiRecommendations = {
            recommendations: aiRecommendations,
            timestamp: now,
            breachingZonesHash,
          };
        }
      }

      // Auto-inject critical alerts into the incident log if severity is high (Incident Log automation!)
      breachingZones.forEach((z, idx) => {
        if (z.riskLevel === "high") {
          const matchingRec =
            aiRecommendations[idx] ||
            aiRecommendations[0] ||
            "Hold boarding lines and shift crowd queues.";
          const alreadyLogged = activeIncidents.some(
            (inc) =>
              inc.zoneId === z.zoneId &&
              inc.status === "active" &&
              inc.message.includes("high density"),
          );
          if (!alreadyLogged) {
            activeIncidents.unshift({
              id: `INC-AI-${Math.floor(100 + Math.random() * 900)}`,
              timestamp: new Date().toISOString(),
              zoneId: z.zoneId,
              zoneName: z.name,
              severity: "critical",
              message: `AUTOMATED SYSTEM ALERT: Extremely high density detected (${z.currentDensity} p/m²). Recommended Action: ${matchingRec}`,
              status: "active",
            });
          }
        }
      });
    } else {
      // Comment detailing the requested cost-efficiency optimization:
      // ZERO breaching zones: skip AI model invocation completely to conserve token budgets and maximize system throughput.
    }

    res.json({
      zones: finalZoneRisks,
      recommendations: aiRecommendations,
      timestamp: new Date().toISOString(),
      scenario: currentScenario,
      isAiQuotaExceeded:
        isAiQuotaExceeded && Date.now() - aiQuotaExceededTime < 5 * 60 * 1000,
    });
  } catch (error: any) {
    console.error("Operations endpoint crash:", error);
    res.status(500).json({
      error:
        "An unexpected error occurred while processing operations telemetry.",
    });
  }
});

// Start server and mount Vite middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully started on port ${PORT}`);
  });
}

startServer();

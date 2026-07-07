export type RiskLevel = "low" | "medium" | "high";
export type FlowStatus = "congested" | "normal";

export interface Zone {
  id: string;
  name: string;
  type: "gate" | "concourse" | "exit";
  capacityPerSqm: number;
  currentDensity: number;
  flowPerMinute: number;
  stepFreeAccess: boolean;
  lat: number;
  lng: number;
}

export interface ZoneRisk {
  zoneId: string;
  name: string;
  type: "gate" | "concourse" | "exit";
  capacityPerSqm: number;
  currentDensity: number;
  flowPerMinute: number;
  stepFreeAccess: boolean;
  lat: number;
  lng: number;
  riskLevel: RiskLevel;
  flowStatus: FlowStatus;
  recommendedAction: string | null;
  densityHistory?: number[];
}

export interface AssistantRequest {
  message: string;
  needsStepFree?: boolean;
}

export interface AssistantResponse {
  reply: string;
  detectedLanguage?: string;
  recommendedZone: ZoneRisk | null;
  allZones: ZoneRisk[];
}

export interface OperationsResponse {
  zones: ZoneRisk[];
  recommendations: string[];
  timestamp: string;
}

export interface Incident {
  id: string;
  timestamp: string;
  zoneId: string;
  zoneName: string;
  severity: "info" | "warning" | "critical";
  message: string;
  status: "active" | "resolved";
}

export interface AccessibilityPreferences {
  highContrast: boolean;
  reducedMotion: boolean;
  ttsAutoRead: boolean;
}

export interface UserProfile {
  displayName: string;
  languageOverride: string; // "auto" or "en", "es", "fr", "de", "ar", "hi", "pt", "ja"
  accessibility: AccessibilityPreferences;
  defaultRole: "fan" | "operator";
}

export interface OperationalNotification {
  id: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  type: "incident" | "risk_alert";
}

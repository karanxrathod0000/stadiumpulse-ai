import { Zone } from "../data/generator";

export type RiskLevel = "low" | "medium" | "high";
export type FlowStatus = "congested" | "normal";

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
}

/**
 * Determines the crowd risk level based on crowd-science thresholds.
 * - high: density > 4.5 people/m²
 * - medium: between 3.0 and 4.5 people/m² (inclusive)
 * - low: below 3.0 people/m²
 *
 * @param density - The number of people per square meter.
 * @returns RiskLevel ("low" | "medium" | "high")
 */
export function getRiskLevel(density: number): RiskLevel {
  if (density > 4.5) {
    return "high";
  } else if (density >= 3.0) {
    return "medium";
  } else {
    return "low";
  }
}

/**
 * Determines transit flow status based on crowd-science thresholds.
 * - congested: flow rate < 25 people/minute/meter width
 * - normal: flow rate >= 25 people/minute/meter width
 *
 * @param flowPerMinute - Number of people passing through per minute per meter of width.
 * @returns FlowStatus ("congested" | "normal")
 */
export function getFlowStatus(flowPerMinute: number): FlowStatus {
  if (flowPerMinute < 25) {
    return "congested";
  } else {
    return "normal";
  }
}

/**
 * Combines physical zone sensor readings into a structured decision-engine risk object.
 *
 * @param zone - The physical zone record.
 * @returns ZoneRisk - Combines rule-based classification and original state.
 */
export function getZoneRisk(zone: Zone): ZoneRisk {
  const riskLevel = getRiskLevel(zone.currentDensity);
  const flowStatus = getFlowStatus(zone.flowPerMinute);

  // Set deterministic default actions before LLM enhances them
  let recommendedAction: string | null = null;
  if (riskLevel === "high" && flowStatus === "congested") {
    recommendedAction =
      "CRITICAL: Immediate bottleneck. Divert ingress and open secondary outflow lanes.";
  } else if (riskLevel === "high") {
    recommendedAction =
      "WARNING: Extreme density. Pause boarding and hold entrance queues.";
  } else if (flowStatus === "congested") {
    recommendedAction =
      "ATTENTION: Slow flow rate. Redirect mobile signage to clear path obstructions.";
  }

  return {
    zoneId: zone.id,
    name: zone.name,
    type: zone.type,
    capacityPerSqm: zone.capacityPerSqm,
    currentDensity: zone.currentDensity,
    flowPerMinute: zone.flowPerMinute,
    stepFreeAccess: zone.stepFreeAccess,
    lat: zone.lat,
    lng: zone.lng,
    riskLevel,
    flowStatus,
    recommendedAction,
  };
}

/**
 * Filters and sorts stadium zones for a fan.
 * Sort order is:
 * 1. Filter out step-free if requested
 * 2. Sort by risk level (low -> medium -> high)
 * 3. Tie-breaker: sort by lower current density
 *
 * @param zones - List of raw physical zones
 * @param options - Filtering parameters
 * @returns Sorted and filtered ZoneRisk objects
 */
export function rankZonesForFan(
  zones: Zone[],
  options: {
    needsStepFree?: boolean;
    type?: "gate" | "concourse" | "exit";
  } = {},
): ZoneRisk[] {
  let processed = zones.map(getZoneRisk);

  // Apply filters
  if (options.needsStepFree) {
    processed = processed.filter((z) => z.stepFreeAccess);
  }
  if (options.type) {
    processed = processed.filter((z) => z.type === options.type);
  }

  // Define weight scores for risk levels to help sorting
  const riskWeight = {
    low: 1,
    medium: 2,
    high: 3,
  };

  // Sort
  return processed.sort((a, b) => {
    const weightDiff = riskWeight[a.riskLevel] - riskWeight[b.riskLevel];
    if (weightDiff !== 0) {
      return weightDiff;
    }
    // Tie-breaker: lower density is better
    return a.currentDensity - b.currentDensity;
  });
}

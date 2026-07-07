import { describe, it, expect } from "vitest";
import {
  getRiskLevel,
  getFlowStatus,
  getZoneRisk,
  rankZonesForFan
} from "./riskScoring";
import { Zone } from "../data/generator";

describe("StadiumPulse Risk Scoring Decision Engine", () => {
  describe("getRiskLevel", () => {
    it("should classify density strictly below 3.0 as low", () => {
      expect(getRiskLevel(0)).toBe("low");
      expect(getRiskLevel(2.9)).toBe("low");
    });

    it("should classify density exactly at 3.0 as medium", () => {
      expect(getRiskLevel(3.0)).toBe("medium");
    });

    it("should classify density between 3.0 and 4.5 (inclusive) as medium", () => {
      expect(getRiskLevel(3.5)).toBe("medium");
      expect(getRiskLevel(4.5)).toBe("medium");
    });

    it("should classify density strictly above 4.5 as high", () => {
      expect(getRiskLevel(4.51)).toBe("high");
      expect(getRiskLevel(5.2)).toBe("high");
    });
  });

  describe("getFlowStatus", () => {
    it("should classify flow below 25 as congested", () => {
      expect(getFlowStatus(24)).toBe("congested");
      expect(getFlowStatus(0)).toBe("congested");
    });

    it("should classify flow exactly at 25 or above as normal", () => {
      expect(getFlowStatus(25)).toBe("normal");
      expect(getFlowStatus(40)).toBe("normal");
    });
  });

  describe("getZoneRisk", () => {
    it("should return the correct shape and deterministic recommendations", () => {
      const sampleZone: Zone = {
        id: "gate-test",
        name: "Test Entrance",
        type: "gate",
        capacityPerSqm: 5.0,
        currentDensity: 4.8,
        flowPerMinute: 15,
        stepFreeAccess: true,
        lat: 40.8,
        lng: -74.0
      };

      const result = getZoneRisk(sampleZone);

      expect(result).toHaveProperty("zoneId", "gate-test");
      expect(result.riskLevel).toBe("high");
      expect(result.flowStatus).toBe("congested");
      expect(result.recommendedAction).toContain("CRITICAL");
    });
  });

  describe("rankZonesForFan", () => {
    const mockZones: Zone[] = [
      {
        id: "zone-1",
        name: "Zone 1 (High density, Step-free)",
        type: "gate",
        capacityPerSqm: 5.0,
        currentDensity: 4.8, // High risk
        flowPerMinute: 30,
        stepFreeAccess: true,
        lat: 40.8,
        lng: -74.0
      },
      {
        id: "zone-2",
        name: "Zone 2 (Low density, Step-free)",
        type: "gate",
        capacityPerSqm: 5.0,
        currentDensity: 1.2, // Low risk
        flowPerMinute: 30,
        stepFreeAccess: true,
        lat: 40.8,
        lng: -74.0
      },
      {
        id: "zone-3",
        name: "Zone 3 (Medium density, No Step-free)",
        type: "gate",
        capacityPerSqm: 5.0,
        currentDensity: 3.5, // Medium risk
        flowPerMinute: 30,
        stepFreeAccess: false,
        lat: 40.8,
        lng: -74.0
      },
      {
        id: "zone-4",
        name: "Zone 4 (Low density, higher than zone-2, Step-free)",
        type: "gate",
        capacityPerSqm: 5.0,
        currentDensity: 1.5, // Low risk
        flowPerMinute: 30,
        stepFreeAccess: true,
        lat: 40.8,
        lng: -74.0
      }
    ];

    it("should sort zones with lowest risk first, then by lowest density", () => {
      const sorted = rankZonesForFan(mockZones);
      
      expect(sorted[0].zoneId).toBe("zone-2"); // Low risk, 1.2 density
      expect(sorted[1].zoneId).toBe("zone-4"); // Low risk, 1.5 density
      expect(sorted[2].zoneId).toBe("zone-3"); // Medium risk, 3.5 density
      expect(sorted[3].zoneId).toBe("zone-1"); // High risk, 4.8 density
    });

    it("should filter out zones that do not have step-free access if requested", () => {
      const sorted = rankZonesForFan(mockZones, { needsStepFree: true });
      
      const containsZone3 = sorted.some(z => z.zoneId === "zone-3");
      expect(containsZone3).toBe(false);
      expect(sorted.length).toBe(3);
    });
  });
});

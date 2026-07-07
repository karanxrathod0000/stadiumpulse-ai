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

/**
 * SIMULATED DATA GENERATOR:
 * Mutates density and flow slightly within realistic bounds.
 * Uses a deterministic pseudo-random sequence if a seed or index is provided,
 * otherwise standard pseudo-randomness for live simulation.
 */
export function generateLiveUpdate(zones: Zone[], forceSeed?: number): Zone[] {
  return zones.map((zone, idx) => {
    // Determine a factor to adjust
    // If forceSeed is provided, we use a simple sine-based deterministic generator
    const rand = forceSeed !== undefined
      ? Math.sin(forceSeed + idx)
      : Math.random() * 2 - 1; // standard [-1, 1]

    // Density adjustment: max +/- 0.3, bounded between 0.1 and 5.5
    let newDensity = zone.currentDensity + (rand * 0.3);
    newDensity = Math.max(0.1, Math.min(5.5, parseFloat(newDensity.toFixed(2))));

    // Flow adjustment: max +/- 5, bounded between 5 and 70 people/min/meter
    let newFlow = Math.round(zone.flowPerMinute + (rand * 5));
    newFlow = Math.max(5, Math.min(70, newFlow));

    return {
      ...zone,
      currentDensity: newDensity,
      flowPerMinute: newFlow
    };
  });
}

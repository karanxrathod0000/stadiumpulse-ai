import { RiskLevel } from "../types";

/**
 * Returns CSS class names for styling components based on risk level and high contrast mode.
 */
export function getRiskColorClasses(level: RiskLevel | string, isHighContrast: boolean): string {
  if (isHighContrast) {
    switch (level) {
      case "high":
        return "bg-black border-4 border-yellow-400 text-yellow-400 font-extrabold";
      case "medium":
        return "bg-black border-4 border-white text-white";
      default:
        return "bg-black border border-neutral-400 text-neutral-200";
    }
  }
  switch (level) {
    case "high":
      return "bg-rose-50 border-rose-200 text-rose-700";
    case "medium":
      return "bg-amber-50 border-amber-200 text-amber-700";
    default:
      return "bg-emerald-50 border-emerald-200 text-emerald-700";
  }
}

/**
 * Returns hex color codes for vector map and canvas visualizations based on risk level and state.
 */
export function getRiskColorHex(level: RiskLevel | string, isHighContrast: boolean, active: boolean): string {
  if (isHighContrast) {
    switch (level) {
      case "high":
        return "#eab308"; // High Contrast Yellow
      case "medium":
        return "#60a5fa"; // High Contrast Blue
      default:
        return active ? "#ffffff" : "#a3a3a3";
    }
  }
  switch (level) {
    case "high":
      return active ? "#f43f5e" : "#fda4af"; // Rose-500 / Rose-300
    case "medium":
      return active ? "#f59e0b" : "#fcd34d"; // Amber-500 / Amber-300
    default:
      return active ? "#10b981" : "#6ee7b7"; // Emerald-500 / Emerald-300
    }
}

/**
 * Normalizes risk level names for standard UI label presentation.
 */
export function getRiskLabel(level: RiskLevel | string): string {
  if (!level) return "NORMAL";
  return level.toUpperCase();
}

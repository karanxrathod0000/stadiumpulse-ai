import React, { useState } from "react";
import { 
  Compass, 
  Accessibility, 
  MapPin, 
  AlertTriangle,
  Layers,
  ArrowRight
} from "lucide-react";
import { ZoneRisk } from "../types";

interface StadiumMapProps {
  zones: ZoneRisk[];
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string) => void;
  isHighContrast: boolean;
  highlightStepFree?: boolean;
  reducedMotion?: boolean;
  onRouteMeHere?: (zoneId: string) => void;
}

export default function StadiumMap({
  zones,
  selectedZoneId,
  onSelectZone,
  isHighContrast,
  highlightStepFree = false,
  reducedMotion = false,
  onRouteMeHere
}: StadiumMapProps) {
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);

  // Helper to map zone ID to specific SVG coordinate anchors
  const getZoneCoords = (id: string) => {
    switch (id) {
      case "gate-a": return { x: 160, y: 110 }; // NW
      case "gate-b": return { x: 440, y: 110 }; // NE
      case "gate-c": return { x: 300, y: 310 }; // South
      case "concourse-north": return { x: 300, y: 120 }; // North Concourse
      case "concourse-south": return { x: 300, y: 280 }; // South Concourse
      case "exit-east": return { x: 520, y: 200 }; // Transit Exit East
      default: return { x: 300, y: 200 };
    }
  };

  const getRiskColorHex = (level: string, active: boolean) => {
    if (isHighContrast) {
      switch (level) {
        case "high": return "#eab308"; // High Contrast Yellow
        case "medium": return "#60a5fa"; // High Contrast Blue
        default: return active ? "#ffffff" : "#a3a3a3";
      }
    }
    switch (level) {
      case "high": return active ? "#f43f5e" : "#fda4af"; // Rose-500 / Rose-300
      case "medium": return active ? "#f59e0b" : "#fcd34d"; // Amber-500 / Amber-300
      default: return active ? "#10b981" : "#6ee7b7"; // Emerald-500 / Emerald-300
    }
  };

  const activeZone = zones.find(z => z.zoneId === (selectedZoneId || hoveredZoneId));

  return (
    <div 
      className={`rounded-2xl border transition-all p-5 flex flex-col justify-between ${
        isHighContrast 
          ? "bg-black border-4 border-white text-white" 
          : "bg-white border-neutral-200/80 shadow-xs"
      }`}
      id="interactive-stadium-map-component"
    >
      {/* Map Header */}
      <div className="flex items-center justify-between mb-3 border-b border-neutral-100 pb-2.5">
        <div className="flex items-center gap-2">
          <Layers className="h-4.5 w-4.5 text-teal-600" />
          <h4 className="font-display font-bold text-xs uppercase tracking-wider text-neutral-800">
            Interactive Sensor Map
          </h4>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>CCTV / IoT Active</span>
        </div>
      </div>

      {/* SVG Map Canvas Container */}
      <div className="relative bg-neutral-900 rounded-xl overflow-hidden p-2 border border-neutral-850 h-[280px] flex items-center justify-center">
        <svg 
          viewBox="0 0 600 400" 
          className="w-full h-full select-none"
          aria-label="FIFA World Cup 2026 MetLife Stadium Interactive Map"
        >
          {/* Subtle Grid Pattern Background */}
          <defs>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* TRANSIT LINKS / OUTSIDE ACCESS PATHS */}
          {/* Step-Free Walkway Path Links */}
          <g stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" strokeDasharray="6,4" fill="none">
            {/* Gate A to North Concourse */}
            <path d="M 160 110 Q 230 110 300 120" stroke={highlightStepFree ? "#3b82f6" : undefined} strokeWidth={highlightStepFree ? 3.5 : undefined} />
            {/* Gate C to South Concourse */}
            <path d="M 300 310 Q 300 295 300 280" stroke={highlightStepFree ? "#3b82f6" : undefined} strokeWidth={highlightStepFree ? 3.5 : undefined} />
            {/* Gate B to North Concourse */}
            <path d="M 440 110 Q 370 110 300 120" />
            {/* Transit Exit East to North & South Concourse */}
            <path d="M 520 200 Q 420 150 300 120" />
            <path d="M 520 200 Q 420 250 300 280" />
          </g>

          {/* STADIUM BOWL STRUCTURE */}
          {/* Outer Stadium Ellipse */}
          <ellipse 
            cx="300" 
            cy="200" 
            rx="190" 
            ry="130" 
            fill="none" 
            stroke="rgba(255, 255, 255, 0.1)" 
            strokeWidth="10" 
          />
          {/* Middle Ring Seating Seperator */}
          <ellipse 
            cx="300" 
            cy="200" 
            rx="150" 
            ry="100" 
            fill="rgba(255, 255, 255, 0.02)" 
            stroke="rgba(255, 255, 255, 0.05)" 
            strokeWidth="2" 
          />

          {/* THE SOCCER PITCH (FIFA World Cup 2026 Pitch Backdrop) */}
          <g opacity="0.6">
            {/* Turf */}
            <rect x="220" y="150" width="160" height="100" fill="#1e3a1e" rx="4" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
            {/* Center Line & Circle */}
            <line x1="300" y1="150" x2="300" y2="250" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
            <circle cx="300" cy="200" r="22" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
            <circle cx="300" cy="200" r="3" fill="rgba(255,255,255,0.8)" />
            {/* Left Penalty Box */}
            <rect x="220" y="170" width="30" height="60" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
            <rect x="220" y="185" width="10" height="30" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
            {/* Right Penalty Box */}
            <rect x="350" y="170" width="30" height="60" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
            <rect x="370" y="185" width="10" height="30" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
          </g>

          {/* NORTH CONCOURSE ZONE */}
          {(() => {
            const z = zones.find(z => z.zoneId === "concourse-north");
            if (!z) return null;
            const active = selectedZoneId === "concourse-north" || hoveredZoneId === "concourse-north";
            const color = getRiskColorHex(z.riskLevel, active);
            return (
              <path
                d="M 130 180 A 170 110 0 0 1 470 180"
                fill="none"
                stroke={color}
                strokeWidth={active ? "12" : "7"}
                strokeLinecap="round"
                className="cursor-pointer transition-all duration-250 hover:stroke-width-12 focus:outline-hidden focus:stroke-width-12"
                tabIndex={0}
                role="button"
                aria-label={`North Concourse, Density: ${z.currentDensity} people per square meter. Risk: ${z.riskLevel}`}
                onClick={() => onSelectZone("concourse-north")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectZone("concourse-north");
                  }
                }}
                onMouseEnter={() => setHoveredZoneId("concourse-north")}
                onMouseLeave={() => setHoveredZoneId(null)}
              />
            );
          })()}

          {/* SOUTH CONCOURSE ZONE */}
          {(() => {
            const z = zones.find(z => z.zoneId === "concourse-south");
            if (!z) return null;
            const active = selectedZoneId === "concourse-south" || hoveredZoneId === "concourse-south";
            const color = getRiskColorHex(z.riskLevel, active);
            return (
              <path
                d="M 130 220 A 170 110 0 0 0 470 220"
                fill="none"
                stroke={color}
                strokeWidth={active ? "12" : "7"}
                strokeLinecap="round"
                className="cursor-pointer transition-all duration-250 hover:stroke-width-12 focus:outline-hidden focus:stroke-width-12"
                tabIndex={0}
                role="button"
                aria-label={`South Concourse, Density: ${z.currentDensity} people per square meter. Risk: ${z.riskLevel}`}
                onClick={() => onSelectZone("concourse-south")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectZone("concourse-south");
                  }
                }}
                onMouseEnter={() => setHoveredZoneId("concourse-south")}
                onMouseLeave={() => setHoveredZoneId(null)}
              />
            );
          })()}

          {/* INTERACTIVE SENSOR NODE ANCHORS (GATES & TRANSIT) */}
          {zones.map((zone) => {
            const coords = getZoneCoords(zone.zoneId);
            const active = selectedZoneId === zone.zoneId || hoveredZoneId === zone.zoneId;
            const isGate = zone.type === "gate";
            const color = getRiskColorHex(zone.riskLevel, active);
            
            // Render specific markers for gates vs transit
            return (
              <g 
                key={zone.zoneId}
                transform={`translate(${coords.x}, ${coords.y})`}
                className="cursor-pointer group focus:outline-hidden"
                tabIndex={0}
                role="button"
                aria-label={`${zone.name}, Density: ${zone.currentDensity} people per square meter. Risk: ${zone.riskLevel}. Access: ${zone.stepFreeAccess ? "wheelchair accessible" : "stairs only"}`}
                onClick={() => onSelectZone(zone.zoneId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectZone(zone.zoneId);
                  }
                }}
                onMouseEnter={() => setHoveredZoneId(zone.zoneId)}
                onMouseLeave={() => setHoveredZoneId(null)}
              >
                {/* Broad Interactive Touch target */}
                <circle r="22" fill="transparent" />

                {/* Pulsing Risk Wave */}
                <circle 
                  r={active ? "16" : "12"} 
                  fill="none" 
                  stroke={color} 
                  strokeWidth="2.5" 
                  opacity={active ? "0.8" : "0.3"} 
                  className={zone.riskLevel === "high" && !reducedMotion ? "animate-ping" : ""}
                />

                {/* Core Node Marker */}
                {isGate ? (
                  // Gate Circle Marker
                  <circle 
                    r={active ? "9" : "7"} 
                    fill={color} 
                    stroke="#171717" 
                    strokeWidth="2.5" 
                    className="transition-all duration-200"
                  />
                ) : zone.zoneId === "exit-east" ? (
                  // Transit Diamond Marker
                  <polygon 
                    points={active ? "0,-10 10,0 0,10 -10,0" : "0,-8 8,0 0,8 -8,0"} 
                    fill={color} 
                    stroke="#171717" 
                    strokeWidth="2.5" 
                    className="transition-all duration-200"
                  />
                ) : null}

                {/* Label text bubble */}
                <rect 
                  x="-35" 
                  y="-26" 
                  width="70" 
                  height="14" 
                  rx="3" 
                  fill="#171717" 
                  stroke="rgba(255,255,255,0.2)" 
                  strokeWidth="0.5" 
                  opacity={active ? "0.9" : "0"} 
                  className="transition-opacity duration-200 pointer-events-none"
                />
                <text 
                  y="-16" 
                  fontSize="7" 
                  fontFamily="monospace" 
                  fill="#ffffff" 
                  textAnchor="middle" 
                  opacity={active ? "1" : "0.5"}
                  className="font-bold pointer-events-none transition-all"
                >
                  {zone.zoneId === "exit-east" ? "TRANSIT" : zone.zoneId.replace("gate-", "GATE ").toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Step-Free Highlight Overlay Indicator */}
        {highlightStepFree && (
          <div className="absolute top-3 left-3 bg-blue-900/90 text-blue-200 text-[10px] font-bold px-2 py-1 rounded-md border border-blue-700/50 flex items-center gap-1.5 backdrop-blur-xs">
            <Accessibility className="h-3 w-3" />
            <span>Showing Step-Free Paths (Blue)</span>
          </div>
        )}

        {/* Map Legend (Bottom-right float) */}
        <div className="absolute bottom-3 right-3 bg-neutral-900/95 border border-neutral-800/80 rounded-lg p-2 flex flex-col gap-1 text-[9px] font-mono text-neutral-400 backdrop-blur-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Low Density (Safe)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span>Medium Density</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <span>High Density (Alert)</span>
          </div>
        </div>
      </div>

      {/* Selected Zone Quick Context Drawer */}
      <div className={`mt-3 p-3.5 rounded-xl border flex flex-col justify-between min-h-[75px] h-auto transition-all ${
        isHighContrast 
          ? "bg-black border-2 border-white text-white" 
          : "bg-neutral-50 border-neutral-200/60 text-neutral-800"
      }`}>
        {activeZone ? (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 h-full">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                <span className="font-bold text-xs text-neutral-900 truncate font-display">
                  {activeZone.name}
                </span>
              </div>
              <p className="text-[10px] text-neutral-500 font-mono mt-0.5 truncate">
                Density: {activeZone.currentDensity} p/m² | Flow: {activeZone.flowPerMinute} p/min/m
              </p>
            </div>
            
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                  activeZone.riskLevel === "high" 
                    ? "bg-rose-50 border-rose-200 text-rose-700 font-extrabold" 
                    : activeZone.riskLevel === "medium"
                    ? "bg-amber-50 border-amber-200 text-amber-700"
                    : "bg-emerald-50 border-emerald-200 text-emerald-700"
                }`}>
                  {activeZone.riskLevel} Risk
                </span>
                <span className="block text-[9px] text-neutral-400 font-mono mt-0.5">
                  {activeZone.stepFreeAccess ? "♿ Accessible" : "⚠ Stairs Only"}
                </span>
              </div>

              {onRouteMeHere && (
                <button
                  onClick={() => onRouteMeHere(activeZone.zoneId)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all ${
                    isHighContrast
                      ? "bg-yellow-400 hover:bg-yellow-500 text-black font-extrabold"
                      : "bg-teal-600 hover:bg-teal-700 text-white shadow-xs"
                  }`}
                  aria-label={`Route to ${activeZone.name}`}
                >
                  <span>Route Me</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5 h-full text-center text-neutral-400 text-[11px] italic">
            <Compass className={`h-4 w-4 text-neutral-300 ${reducedMotion ? "" : "animate-spin-slow"}`} />
            <span>Click or hover any map zone above to inspect live telemetry</span>
          </div>
        )}
      </div>
    </div>
  );
}

import React from "react";

interface ScenarioSimulatorProps {
  isHighContrast: boolean;
  currentScenario: string;
  onSetScenario: (scenario: string) => Promise<void> | void;
}

export default function ScenarioSimulator({
  isHighContrast,
  currentScenario,
  onSetScenario,
}: ScenarioSimulatorProps) {
  return (
    <div
      className={`p-5 rounded-2xl border transition-all ${
        isHighContrast
          ? "bg-black border-4 border-white text-white"
          : "bg-gradient-to-r from-teal-50/50 to-neutral-50/50 border-neutral-200/80 shadow-xs"
      }`}
      id="interactive-simulator-panel"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200/60 pb-3 mb-4">
        <div>
          <h4 className="font-display font-bold text-xs uppercase tracking-wider text-neutral-900 flex items-center gap-2">
            <span className="p-1 bg-teal-100 text-teal-700 rounded-md shrink-0">
              ⚡
            </span>
            FIFA World Cup 2026 Telemetry Scenario Simulator
          </h4>
          <p className="text-[11px] text-neutral-500">
            For evaluation: Inject real-time crowd dynamics, crises, or
            weather alerts to verify immediate AI and rule-engine adaptation.
          </p>
        </div>
        <div className="shrink-0">
          <span
            className={`text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider border flex items-center gap-1.5 ${
              currentScenario === "normal"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : currentScenario === "crowd_rush"
                  ? "bg-amber-50 text-amber-800 border-amber-200 animate-pulse"
                  : currentScenario === "gate_b_emergency"
                    ? "bg-rose-50 text-rose-800 border-rose-200 animate-pulse"
                    : currentScenario === "extreme_rain"
                      ? "bg-blue-50 text-blue-800 border-blue-200"
                      : "bg-purple-50 text-purple-800 border-purple-200 animate-pulse"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-current" />
            Scenario: {currentScenario.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <button
          onClick={() => onSetScenario("normal")}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-22 ${
            currentScenario === "normal"
              ? "bg-white border-emerald-500 ring-2 ring-emerald-500/20 text-neutral-900 shadow-xs font-bold"
              : "bg-white border-neutral-200 hover:border-teal-500/50 text-neutral-700"
          }`}
        >
          <span className="text-xs font-bold block">🏟️ Base Load</span>
          <span className="text-[10px] text-neutral-400 block leading-tight mt-1 font-normal">
            Normal baseline crowd flow and fluctuations.
          </span>
        </button>

        <button
          onClick={() => onSetScenario("crowd_rush")}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-22 ${
            currentScenario === "crowd_rush"
              ? "bg-white border-amber-500 ring-2 ring-amber-500/20 text-neutral-900 shadow-xs font-bold"
              : "bg-white border-neutral-200 hover:border-teal-500/50 text-neutral-700"
          }`}
        >
          <span className="text-xs font-bold block text-amber-700">
            🔥 Crowd Rush
          </span>
          <span className="text-[10px] text-neutral-400 block leading-tight mt-1 font-normal">
            Spike Gate A & C northwest/south entries.
          </span>
        </button>

        <button
          onClick={() => onSetScenario("gate_b_emergency")}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-22 ${
            currentScenario === "gate_b_emergency"
              ? "bg-white border-rose-500 ring-2 ring-rose-500/20 text-neutral-900 shadow-xs font-bold"
              : "bg-white border-neutral-200 hover:border-teal-500/50 text-neutral-700"
          }`}
        >
          <span className="text-xs font-bold block text-rose-700">
            ⚠️ Gate B Lock
          </span>
          <span className="text-[10px] text-neutral-400 block leading-tight mt-1 font-normal">
            Simulate scanning node outage at Gate B.
          </span>
        </button>

        <button
          onClick={() => onSetScenario("extreme_rain")}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-22 ${
            currentScenario === "extreme_rain"
              ? "bg-white border-blue-500 ring-2 ring-blue-500/20 text-neutral-900 shadow-xs font-bold"
              : "bg-white border-neutral-200 hover:border-teal-500/50 text-neutral-700"
          }`}
        >
          <span className="text-xs font-bold block text-blue-700">
            🌧️ Heavy Rain
          </span>
          <span className="text-[10px] text-neutral-400 block leading-tight mt-1 font-normal">
            Universal pedestrian slow footing velocity.
          </span>
        </button>

        <button
          onClick={() => onSetScenario("egress_surge")}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-22 ${
            currentScenario === "egress_surge"
              ? "bg-white border-purple-500 ring-2 ring-purple-500/20 text-neutral-900 shadow-xs font-bold"
              : "bg-white border-neutral-200 hover:border-teal-500/50 text-neutral-700"
          }`}
        >
          <span className="text-xs font-bold block text-purple-700">
            🚪 Egress Surge
          </span>
          <span className="text-[10px] text-neutral-400 block leading-tight mt-1 font-normal">
            Simulate transit outbound links post-match egress.
          </span>
        </button>
      </div>
    </div>
  );
}

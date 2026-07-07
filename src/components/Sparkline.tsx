import React from "react";

interface SparklineProps {
  history?: number[];
  width?: number;
  height?: number;
  isHighContrast: boolean;
}

export default function Sparkline({ history = [], width = 100, height = 30, isHighContrast }: SparklineProps) {
  if (history.length < 2) {
    return (
      <div className="text-[10px] text-neutral-400 font-mono" aria-label="Not enough historical data yet">
        Gathering...
      </div>
    );
  }

  // Calculate scaling factors
  const minVal = Math.min(...history);
  const maxVal = Math.max(...history);
  const range = maxVal - minVal === 0 ? 1 : maxVal - minVal;

  const points = history.map((val, idx) => {
    const x = (idx / (history.length - 1)) * width;
    // Invert y because SVG coordinates start from top-left
    const y = height - ((val - minVal) / range) * height;
    return `${x},${y}`;
  }).join(" ");

  // Analyze the trend
  const startAvg = history.slice(0, Math.max(1, Math.floor(history.length / 3))).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(history.length / 3));
  const endAvg = history.slice(-Math.max(1, Math.floor(history.length / 3))).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(history.length / 3));
  
  const diff = endAvg - startAvg;
  let trendWord = "stable";
  let colorClass = isHighContrast ? "stroke-white" : "stroke-teal-500";
  
  if (diff > 0.15) {
    trendWord = "rising";
    colorClass = isHighContrast ? "stroke-yellow-400" : "stroke-rose-500";
  } else if (diff < -0.15) {
    trendWord = "falling";
    colorClass = isHighContrast ? "stroke-white" : "stroke-emerald-500";
  }

  const ariaLabel = `Density ${trendWord} over the last ${history.length} data samples, ranging from ${minVal.toFixed(2)} to ${maxVal.toFixed(2)} people per square meter.`;

  return (
    <div className="flex flex-col gap-1 shrink-0" title={ariaLabel}>
      <svg 
        width={width} 
        height={height} 
        className="overflow-visible" 
        role="img" 
        aria-label={ariaLabel}
      >
        <polyline
          fill="none"
          className={colorClass}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        {/* Draw a subtle small dot at the end */}
        {history.length > 0 && (
          <circle
            cx={width}
            cy={height - ((history[history.length - 1] - minVal) / range) * height}
            r="2"
            className={trendWord === "rising" ? "fill-rose-500" : "fill-emerald-500"}
          />
        )}
      </svg>
      <span className="text-[8px] font-mono font-bold uppercase tracking-wider text-right text-neutral-400" aria-hidden="true">
        Trend: {trendWord}
      </span>
    </div>
  );
}

import React, { useState } from "react";
import { 
  Sparkles, 
  Terminal, 
  Users, 
  Accessibility, 
  ChevronRight, 
  ChevronLeft, 
  X,
  Compass,
  ArrowRight
} from "lucide-react";

interface OnboardingTourProps {
  isHighContrast: boolean;
  reducedMotion: boolean;
  onDismiss: () => void;
}

export default function OnboardingTour({ isHighContrast, reducedMotion, onDismiss }: OnboardingTourProps) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Welcome to StadiumPulse AI",
      badge: "Intro",
      description: "A state-of-the-art symmetric spatial intelligence system designed for both FIFA World Cup fans and tactical operations supervisors.",
      icon: Compass,
      color: "from-teal-500 to-emerald-600",
      target: "Toggle perspectives to experience symmetric dual-interfaces!"
    },
    {
      title: "Role Switcher & Profile Settings",
      badge: "Symmetry",
      description: "Click your user avatar in the top right to switch between 'Fan Mode' and 'Operator Mode'. The entire dashboard re-configures to match that specific operational profile.",
      icon: Users,
      color: "from-blue-500 to-indigo-600",
      target: "Configure custom languages and default loading roles seamlessly."
    },
    {
      title: "Real-time Optimal Gate Recommendations",
      badge: "Fan Co-Pilot",
      description: "In Fan Assistant mode, our system automatically tracks all stadium gates, pinning the optimal entry route to guide fans around heavy congestion bottlenecks.",
      icon: Sparkles,
      color: "from-amber-500 to-orange-500",
      target: "Activate 'Step-Free Wheelchair Access' to filter only accessible gates."
    },
    {
      title: "Gold Command Operations Console",
      badge: "Tactical Supervisor",
      description: "In Operator mode, access real-time CCTV feeds, telemetry charts, issue logistics dispatches, and consult the Gemini AI-powered operational directive generator.",
      icon: Terminal,
      color: "from-rose-500 to-pink-600",
      target: "Clear/seed incidents to simulate high-risk stadium emergency protocols."
    },
    {
      title: "Universal Accessibility Controls",
      badge: "A11y First",
      description: "Located in the sidebar footer, activate High-Contrast view, Reduced-Motion mode, or dynamic Text-to-Speech narration for eyes-free screen accessibility.",
      icon: Accessibility,
      color: "from-purple-500 to-violet-600",
      target: "Supports full keyboard navigation and screen-reader polite regions."
    }
  ];

  const currentStep = steps[step];
  const IconComponent = currentStep.icon;

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(prev => prev + 1);
    } else {
      onDismiss();
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(prev => prev - 1);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      aria-describedby="onboarding-description"
    >
      <div 
        className={`w-full max-w-md rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 transform ${
          isHighContrast 
            ? "bg-black border-4 border-white text-white" 
            : "bg-white border border-neutral-100 text-neutral-800"
        } ${reducedMotion ? "" : "animate-fade-in"}`}
      >
        {/* Color Banner */}
        <div className={`h-2.5 bg-gradient-to-r ${isHighContrast ? "bg-white" : currentStep.color}`} />

        {/* Content Area */}
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full font-mono ${
              isHighContrast 
                ? "bg-white text-black font-extrabold" 
                : "bg-teal-50 text-teal-800 border border-teal-150"
            }`}>
              {currentStep.badge} — Step {step + 1} of {steps.length}
            </span>
            <button 
              onClick={onDismiss}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isHighContrast 
                  ? "hover:bg-neutral-800 text-white" 
                  : "hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600"
              }`}
              aria-label="Skip onboarding tour"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Visual Hero Block */}
          <div className="flex items-center gap-4 mb-5">
            <div className={`p-3 rounded-xl flex items-center justify-center shrink-0 ${
              isHighContrast 
                ? "bg-black border-2 border-white text-white" 
                : "bg-neutral-50 border border-neutral-150 text-teal-600"
            }`}>
              <IconComponent className="h-6 w-6" />
            </div>
            <div>
              <h3 id="onboarding-title" className="font-display font-black text-base tracking-tight leading-tight">
                {currentStep.title}
              </h3>
              <p className="text-[11px] text-neutral-400 font-medium">StadiumPulse Feature Guide</p>
            </div>
          </div>

          {/* Body Description */}
          <p id="onboarding-description" className="text-xs leading-relaxed mb-4 text-neutral-500">
            {currentStep.description}
          </p>

          {/* Prompt/Target Nudge */}
          <div className={`p-3 rounded-xl mb-6 text-[10.5px] leading-snug border font-medium ${
            isHighContrast
              ? "bg-neutral-900 border-white text-white"
              : "bg-teal-50/40 border-teal-100/50 text-teal-950"
          }`}>
            <span className="font-bold text-teal-600 uppercase tracking-wider text-[9px] block mb-0.5">Quick Tip</span>
            {currentStep.target}
          </div>

          {/* Progress Indicators */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {steps.map((_, idx) => (
                <div 
                  key={idx} 
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === step 
                      ? "w-6 bg-teal-600" 
                      : "w-1.5 bg-neutral-200"
                  }`} 
                />
              ))}
            </div>

            {/* Nav Action Buttons */}
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  onClick={handleBack}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                    isHighContrast
                      ? "border border-white text-white hover:bg-neutral-800"
                      : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                  }`}
                  aria-label="Previous step"
                >
                  <ChevronLeft className="h-3 w-3" />
                  <span>Back</span>
                </button>
              )}

              <button
                onClick={handleNext}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isHighContrast
                    ? "bg-white text-black hover:bg-neutral-200 font-extrabold"
                    : "bg-teal-600 hover:bg-teal-700 text-white shadow-md"
                }`}
                aria-label={step === steps.length - 1 ? "Finish onboarding tour" : "Next step"}
              >
                <span>{step === steps.length - 1 ? "Explore Now" : "Next"}</span>
                {step === steps.length - 1 ? (
                  <ArrowRight className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

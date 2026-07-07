import React, { useState, useRef, useEffect } from "react";
import { 
  Send, 
  MapPin, 
  Sparkles, 
  Volume2, 
  Accessibility, 
  ArrowRight, 
  ChevronRight, 
  Compass, 
  Navigation, 
  RefreshCw,
  Clock,
  ThumbsUp,
  AlertTriangle,
  HelpCircle,
  Footprints,
  AlertOctagon,
  VolumeX
} from "lucide-react";
import { ZoneRisk, AssistantResponse, UserProfile } from "../types";
import StadiumMap from "./StadiumMap";

interface FanAppProps {
  isHighContrast: boolean;
  reducedMotion: boolean;
  userProfile: UserProfile;
  initialRouteZoneId?: string | null;
  onClearInitialRoute?: () => void;
}

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  isError?: boolean;
}

const LANGUAGE_MAPPING: Record<string, string> = {
  en: "English",
  es: "Spanish (Español)",
  fr: "French (Français)",
  de: "German (Deutsch)",
  hi: "Hindi (हिन्दी)",
  ar: "Arabic (العربية)",
  pt: "Portuguese (Português)",
  ja: "Japanese (日本語)"
};

export default function FanApp({ 
  isHighContrast, 
  reducedMotion, 
  userProfile,
  initialRouteZoneId,
  onClearInitialRoute
}: FanAppProps) {
  const [message, setMessage] = useState("");
  const [needsStepFree, setNeedsStepFree] = useState(false);
  const [zones, setZones] = useState<ZoneRisk[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "ai",
      text: "Welcome to StadiumPulse AI for the FIFA World Cup 2026! ⚽ How can I help you navigate the venue today? Ask me about gates, accessibility routes, transit links, or safety updates. (Soporte disponible en español, français, deutsch, and more!)",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [recommendedZone, setRecommendedZone] = useState<ZoneRisk | null>(null);
  const [detectedLanguage, setDetectedLanguage] = useState<string>("English");
  
  // TTS State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentSpokenText, setCurrentSpokenText] = useState<string | null>(null);

  // Failure & Retry states
  const [lastSentMessage, setLastSentMessage] = useState<string>("");
  const [apiErrorOccurred, setApiErrorOccurred] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
    }
  }, [chatHistory, isTyping]);

  // Sync detected language badge to profile override if manual is set
  useEffect(() => {
    if (userProfile.languageOverride !== "auto") {
      setDetectedLanguage(LANGUAGE_MAPPING[userProfile.languageOverride] || "English");
    } else {
      setDetectedLanguage("Auto-Detect");
    }
  }, [userProfile.languageOverride]);

  // Load initial automatic entrance recommendation on load or preference toggle
  useEffect(() => {
    const loadInitialRecommendation = async () => {
      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "Hello, recommend the best entryway for a fan based on current density.",
            needsStepFree,
            preferredLanguage: userProfile.languageOverride
          })
        });
        if (response.ok) {
          const data: AssistantResponse = await response.json();
          if (data.recommendedZone) {
            setRecommendedZone(data.recommendedZone);
          }
          if (data.allZones) {
            setZones(data.allZones);
          }
        }
      } catch (err) {
        console.error("Initial recommendation error:", err);
      }
    };
    loadInitialRecommendation();
  }, [needsStepFree]);

  // Sync and poll stadium telemetry zones state
  useEffect(() => {
    const fetchTelemetryZones = async () => {
      if (document.hidden) return; // Skip polling when tab is inactive to preserve client/server resources
      try {
        const response = await fetch("/api/operations");
        if (response.ok) {
          const data = await response.json();
          if (data.zones) {
            setZones(data.zones);
            // Auto update recommended zone from polled metrics to keep UI fresh
            if (recommendedZone) {
              const updated = data.zones.find((z: ZoneRisk) => z.zoneId === recommendedZone.zoneId);
              if (updated) {
                setRecommendedZone(updated);
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch telemetry zones for map:", err);
      }
    };
    fetchTelemetryZones();
    const interval = setInterval(fetchTelemetryZones, 10000);
    return () => clearInterval(interval);
  }, [recommendedZone]);

  const QUICK_PROMPTS = [
    { text: "Which entrance has the lowest queue right now?", icon: Navigation },
    { text: "Where is wheelchair-accessible seating and entry?", icon: Accessibility },
    { text: "How do I get to the Metro after the final whistle?", icon: Compass },
    { text: "Fastest way to get food without long queues?", icon: Clock }
  ];

  const getRiskColorClasses = (level: string) => {
    if (isHighContrast) {
      switch (level) {
        case "high": return "bg-black border-4 border-yellow-400 text-yellow-400 font-extrabold";
        case "medium": return "bg-black border-4 border-white text-white";
        default: return "bg-black border border-neutral-400 text-neutral-200";
      }
    }
    switch (level) {
      case "high": return "bg-rose-50 border-rose-200 text-rose-700";
      case "medium": return "bg-amber-50 border-amber-200 text-amber-700";
      default: return "bg-emerald-50 border-emerald-200 text-emerald-700";
    }
  };

  // Text-To-Speech (TTS) engine with robust cancellation & screen accessibility
  const speakText = (text: string) => {
    if (!window.speechSynthesis) return;

    if (isSpeaking && currentSpokenText === text) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setCurrentSpokenText(null);
      return;
    }

    // Cancel current reading
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Map preferred language to TTS voice if applicable
    if (userProfile.languageOverride !== "auto") {
      utterance.lang = userProfile.languageOverride;
    }

    utterance.onend = () => {
      setIsSpeaking(false);
      setCurrentSpokenText(null);
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      setCurrentSpokenText(null);
    };

    setIsSpeaking(true);
    setCurrentSpokenText(text);
    window.speechSynthesis.speak(utterance);
  };

  // Stop speaking on component unmount
  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Trigger initial routing if redirected from the map view with a target zone
  useEffect(() => {
    if (initialRouteZoneId && zones.length > 0) {
      const zoneObj = zones.find(z => z.zoneId === initialRouteZoneId);
      const zoneName = zoneObj ? zoneObj.name : initialRouteZoneId;
      handleSendMessage(`Give me routing directions to ${zoneName}`);
      if (onClearInitialRoute) {
        onClearInitialRoute();
      }
    }
  }, [initialRouteZoneId, zones]);

  // Send message to back-end
  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isTyping) return;

    setApiErrorOccurred(false);
    setLastSentMessage(textToSend);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    setChatHistory(prev => [...prev, userMsg]);
    setMessage("");
    setIsTyping(true);

    try {
      // Prepend manual language instructions if a preference override is defined in profile
      let payloadMessage = textToSend;
      if (userProfile.languageOverride && userProfile.languageOverride !== "auto") {
        const targetLangName = LANGUAGE_MAPPING[userProfile.languageOverride];
        if (targetLangName) {
          payloadMessage = `[Respond ONLY in ${targetLangName}] ${textToSend}`;
        }
      }

      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: payloadMessage,
          needsStepFree: needsStepFree,
          preferredLanguage: userProfile.languageOverride
        })
      });

      if (!response.ok) {
        throw new Error("Server communication breakdown.");
      }

      const data: AssistantResponse = await response.json();

      // Cosmetic language detector
      let lang = "English";
      const replyLower = data.reply.toLowerCase();
      if (replyLower.includes("hola") || replyLower.includes("puerta") || replyLower.includes("entrada")) lang = "Español";
      else if (replyLower.includes("bonjour") || replyLower.includes("porte")) lang = "Français";
      else if (replyLower.includes("willkommen") || replyLower.includes("tor")) lang = "Deutsch";
      else if (replyLower.includes("namaste") || replyLower.includes("swagat")) lang = "Hindi";
      else if (replyLower.includes("marhaban") || replyLower.includes("bawaba")) lang = "العربية";
      
      if (userProfile.languageOverride === "auto") {
        setDetectedLanguage(lang);
      }

      if (data.recommendedZone) {
        setRecommendedZone(data.recommendedZone);
      }
      if (data.allZones) {
        setZones(data.allZones);
      }

      const aiReply = data.reply;
      setChatHistory(prev => [...prev, {
        id: `ai-${Date.now()}`,
        sender: "ai",
        text: aiReply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      }]);

      // TTS Auto-Read Sync
      if (userProfile.accessibility.ttsAutoRead) {
        // Delay slightly for natural UI experience
        setTimeout(() => speakText(aiReply), 400);
      }

    } catch (error) {
      console.error("Error sending message to fan assistant:", error);
      setApiErrorOccurred(true);
      
      setChatHistory(prev => [...prev, {
        id: `ai-err-${Date.now()}`,
        sender: "ai",
        text: "I am having trouble reaching the stadium sensors right now. Please inspect the live safety status cards or try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        isError: true
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleRetryLastMessage = () => {
    if (lastSentMessage) {
      handleSendMessage(lastSentMessage);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6" id="fan-app-view">
      
      {/* Left Column: Core Layout and Map Context */}
      <div className="md:col-span-5 space-y-6">
        
        {/* Accessibility Toggle Panel */}
        <div className={`p-5 rounded-2xl border ${
          isHighContrast ? "bg-black border-4 border-white text-white" : "bg-white border-neutral-200/80"
        }`}>
          <h4 className="font-display font-bold text-xs uppercase tracking-wider mb-2 flex items-center gap-2">
            <Accessibility className="h-4 w-4 text-teal-600" />
            Adaptive Routing Filters
          </h4>
          <p className="text-xs text-neutral-500 mb-4">
            Activate step-free access routing. StadiumPulse will bypass stairs and narrow turnstiles.
          </p>

          <div className="space-y-3">
            <label 
              className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer select-none transition-all ${
                needsStepFree 
                  ? "bg-teal-50 border-teal-500/80 text-teal-950" 
                  : "bg-neutral-50 border-neutral-200 hover:bg-neutral-100/80 text-neutral-700"
              }`}
              id="step-free-toggle-label"
            >
              <div className="flex items-center gap-3">
                <Accessibility className={`h-5 w-5 ${needsStepFree ? "text-teal-700" : "text-neutral-500"}`} />
                <div>
                  <span className="text-xs font-bold block">Step-Free Wheelchair Access</span>
                  <span className="text-[10px] opacity-80 block">Excludes escalators and steps.</span>
                </div>
              </div>
              <input 
                type="checkbox" 
                className="sr-only"
                checked={needsStepFree}
                onChange={(e) => setNeedsStepFree(e.target.checked)}
                aria-label="Toggle step-free wheelchair routing filter"
              />
              <div className={`w-11 h-6 rounded-full transition-colors relative ${needsStepFree ? "bg-teal-600" : "bg-neutral-300"}`}>
                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${needsStepFree ? "translate-x-6" : "translate-x-1"}`} />
              </div>
            </label>
          </div>
        </div>

        {/* Stadium Interactive Map */}
        <StadiumMap
          zones={zones}
          selectedZoneId={recommendedZone ? recommendedZone.zoneId : null}
          onSelectZone={(zoneId) => {
            const selected = zones.find(z => z.zoneId === zoneId);
            if (selected) {
              setRecommendedZone(selected);
              setMessage(`How is the crowd at ${selected.name} and how do I get there?`);
            }
          }}
          isHighContrast={isHighContrast}
          highlightStepFree={needsStepFree}
          reducedMotion={reducedMotion}
        />

        {/* Sustainability & Transport Tip Card */}
        {(() => {
          const transitExit = zones.find(z => z.zoneId === "exit-east");
          if (!transitExit) return null;
          
          const isHigh = transitExit.riskLevel === "high";
          
          return (
            <div className={`p-5 rounded-2xl border transition-all ${
              isHighContrast 
                ? "bg-black border-4 border-yellow-400 text-yellow-400 font-extrabold" 
                : "bg-emerald-50/60 border-emerald-200/60 text-emerald-950 shadow-xs"
            }`}>
              <h4 className="font-display font-bold text-xs uppercase tracking-wider mb-2 flex items-center gap-2">
                <span className="p-1 bg-emerald-100 text-emerald-700 rounded-md shrink-0">🌱</span>
                Post-Match Green Transit Nudge
              </h4>
              <p className="text-xs font-semibold text-neutral-800 mb-1.5 leading-snug">
                {isHigh 
                  ? `High passenger volume detected at Exit East (${transitExit.currentDensity} p/m²).`
                  : `Transit Exit East has optimal throughput flow (${transitExit.currentDensity} p/m²).`
                }
              </p>
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                {isHigh
                  ? "Sustainable recommendation: Board Metro Line 2 via Concourse North to Gate A pathways first. This distributes footprint evenly and avoids queue carbon exhaust."
                  : "Sustainable recommendation: Board Metro Line 2 from Transit Exit East! This is the fastest, lowest-congestion exit route and reduces individual post-match vehicle carbon emissions."
                }
              </p>
            </div>
          );
        })()}

      </div>

      {/* Right Column: Active AI Dialogue Console with Pinned Entryway */}
      <div className="md:col-span-7 flex flex-col h-[540px] bg-white rounded-2xl border border-neutral-200/80 shadow-sm overflow-hidden" id="fan-assistant-chat-panel">
        
        {/* Chat Panel Header */}
        <div className="bg-neutral-50 px-5 py-4 border-b border-neutral-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900 font-display">
                Multilingual Navigation Co-Pilot
              </h4>
              <p className="text-[10px] text-neutral-400">Grounded on real-time crowd metrics</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] bg-teal-50 text-teal-800 border border-teal-200 font-bold px-2 py-0.5 rounded-md font-mono">
              LANG: {detectedLanguage}
            </span>
          </div>
        </div>

        {/* Pinned Recommended Entrance Card right inside dialogue console for persistent viewing */}
        <div className={`px-5 py-3 border-b transition-all ${
          isHighContrast ? "bg-black border-2 border-white text-white" : "bg-teal-50/40 border-neutral-150"
        } shrink-0`}>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <span className="text-[9px] font-bold text-teal-700 uppercase block font-sans tracking-widest flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                Pinned Real-time Optimal Entrance
              </span>
              <h5 className="font-bold text-xs text-neutral-900 truncate font-display mt-0.5">
                {recommendedZone ? recommendedZone.name : "Analyzing stadium entries..."}
              </h5>
            </div>
            
            {recommendedZone ? (
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                  recommendedZone.riskLevel === "high"
                    ? "bg-rose-50 text-rose-700 border-rose-200"
                    : recommendedZone.riskLevel === "medium"
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}>
                  {recommendedZone.riskLevel.toUpperCase()} RISK
                </span>
                {recommendedZone.stepFreeAccess && (
                  <span className="p-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200" title="Step-free entrance">
                    <Accessibility className="h-3 w-3" />
                  </span>
                )}
              </div>
            ) : (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-neutral-400" />
            )}
          </div>
        </div>

        {/* Chat History Messages Stream */}
        <div className="flex-grow overflow-y-auto p-5 space-y-4" id="chat-stream">
          {chatHistory.map((msg) => {
            const isAI = msg.sender === "ai";
            const isCurrentlyPlaying = isSpeaking && currentSpokenText === msg.text;
            return (
              <div 
                key={msg.id}
                className={`flex flex-col max-w-[85%] ${!isAI ? "ml-auto items-end" : "mr-auto items-start"}`}
              >
                <div className={`p-4 rounded-2xl text-xs leading-relaxed ${
                  !isAI
                    ? isHighContrast
                      ? "bg-black border-2 border-white text-white rounded-br-none font-bold"
                      : "bg-teal-600 text-white rounded-br-none font-semibold"
                    : msg.isError
                    ? "bg-red-50 border border-red-200 text-red-900 rounded-bl-none"
                    : isHighContrast
                    ? "bg-white text-black border-2 border-black rounded-bl-none font-bold"
                    : "bg-neutral-100 text-neutral-800 rounded-bl-none"
                }`}>
                  {msg.text}

                  {/* Inline Error retry option */}
                  {msg.isError && (
                    <div className="mt-3">
                      <button
                        onClick={handleRetryLastMessage}
                        className="px-3 py-1 bg-rose-600 text-white rounded-md text-[10px] font-bold hover:bg-rose-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Retry Last Message
                      </button>
                    </div>
                  )}
                </div>

                {/* Sub-label details */}
                <div className="flex items-center gap-2 mt-1 text-[10px] text-neutral-400 font-mono">
                  <span>{msg.timestamp}</span>
                  {isAI && !msg.isError && (
                    <button 
                      onClick={() => speakText(msg.text)}
                      className="hover:text-teal-600 transition-colors p-1 rounded-md hover:bg-neutral-100 flex items-center gap-1 cursor-pointer"
                      title="Read this response aloud"
                      aria-label="Read this response aloud"
                    >
                      <Volume2 className={`h-3 w-3 ${isCurrentlyPlaying ? "text-teal-600 animate-pulse" : "text-neutral-400"}`} />
                      <span className="text-[8px] font-sans font-bold">Listen</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div className="flex flex-col mr-auto max-w-[85%] items-start">
              <div className="p-3 bg-neutral-50 rounded-2xl text-xs text-neutral-400 italic flex items-center gap-2 border border-neutral-100 rounded-bl-none">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-neutral-500" />
                Thinking in language...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Quick suggestions area */}
        <div className="px-5 py-2 bg-neutral-50 border-t border-neutral-100 flex gap-2 overflow-x-auto text-[10.5px] scrollbar-none shrink-0">
          {QUICK_PROMPTS.map((p, idx) => {
            const IconComp = p.icon;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(p.text)}
                className="flex items-center gap-1 bg-white hover:bg-neutral-50 hover:border-neutral-300 text-neutral-600 hover:text-neutral-900 border border-neutral-200 px-3 py-1.5 rounded-full whitespace-nowrap transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-teal-500/20"
              >
                <IconComp className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                <span>{p.text}</span>
              </button>
            );
          })}
        </div>

        {/* Form Chat Input area */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage(message);
          }}
          className="p-3 border-t border-neutral-100 flex gap-2 bg-neutral-50 shrink-0"
        >
          <input 
            type="text"
            className={`flex-1 text-xs px-4 py-3 rounded-xl border focus:outline-hidden focus:ring-3 focus:ring-teal-500/10 transition-all ${
              isHighContrast ? "bg-black border-white text-white" : "bg-white border-neutral-300 focus:border-teal-500"
            }`}
            placeholder="Type your question (e.g. 'How congested is Gate A right now?')..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={isTyping}
            aria-label="Type navigation question here"
          />
          <button
            type="submit"
            disabled={isTyping || !message.trim()}
            className={`px-5 rounded-xl flex items-center justify-center transition-all cursor-pointer select-none ${
              !message.trim() || isTyping
                ? "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                : isHighContrast
                ? "bg-yellow-400 hover:bg-yellow-500 text-black font-extrabold"
                : "bg-teal-600 hover:bg-teal-700 text-white shadow-md active:translate-y-px"
            }`}
            title="Send query"
            aria-label="Send query"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>

      </div>

    </div>
  );
}

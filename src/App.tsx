import React, { useState, useEffect, useRef } from "react";
import { 
  Compass, 
  Activity, 
  Accessibility, 
  ShieldAlert, 
  Info, 
  ChevronRight, 
  ChevronLeft,
  ArrowRight,
  Sparkles,
  Users,
  Terminal,
  Menu,
  X,
  User,
  Clock,
  Globe,
  Volume2,
  Shield,
  HelpCircle,
  FileSpreadsheet,
  AlertOctagon,
  Sliders,
  Settings,
  Map,
  Bell,
  BookOpen,
  Layers,
  RefreshCw
} from "lucide-react";
import FanApp from "./components/FanApp";
import OperatorDashboard from "./components/OperatorDashboard";
import IncidentLogView from "./components/IncidentLogView";
import StadiumMap from "./components/StadiumMap";
import OnboardingTour from "./components/OnboardingTour";
import { UserProfile, AccessibilityPreferences, ZoneRisk, Incident, OperationalNotification } from "./types";

// Default Profile State
const DEFAULT_PROFILE: UserProfile = {
  displayName: "World Cup Guest",
  languageOverride: "auto",
  accessibility: {
    highContrast: false,
    reducedMotion: false,
    ttsAutoRead: false
  },
  defaultRole: "fan"
};

type ViewType = "fan" | "dashboard" | "map" | "incidents" | "settings";

export default function App() {
  // 1. Client-side User Profile & Preferences State
  const [profile, setProfile] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem("stadiumpulse_profile");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Ensure backwards compatibility with structure additions
        return {
          ...DEFAULT_PROFILE,
          ...parsed,
          accessibility: {
            ...DEFAULT_PROFILE.accessibility,
            ...(parsed.accessibility || {})
          }
        };
      }
    } catch (e) {
      console.error("Failed to parse local profile:", e);
    }
    return DEFAULT_PROFILE;
  });

  // 2. Navigation Tab Route State (Initialized based on role UX default)
  const [activeTab, setActiveTab] = useState<ViewType>(() => {
    return profile.defaultRole === "operator" ? "dashboard" : "fan";
  });

  // 3. UI states
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Mobile sidebar toggle drawer
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false); // Desktop sidebar collapsed state
  const [isProfileOpen, setIsProfileOpen] = useState(false); // Right side profile drawer
  const [showInfoBanner, setShowInfoBanner] = useState(true);
  const [lastSensorUpdate, setLastSensorUpdate] = useState<string>("");

  // Spatial & Notification States
  const [sharedZones, setSharedZones] = useState<ZoneRisk[]>([]);
  const [mapSelectedZoneId, setMapSelectedZoneId] = useState<string | null>(null);
  const [routedZoneId, setRoutedZoneId] = useState<string | null>(null);
  
  // Notification center states
  const [notifications, setNotifications] = useState<OperationalNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Onboarding first-run tour state
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return localStorage.getItem("stadiumpulse_onboarded") !== "true";
    } catch {
      return true;
    }
  });

  // Track editing state for profile
  const [editName, setEditName] = useState(profile.displayName);
  const [editLang, setEditLang] = useState(profile.languageOverride);
  const [editRole, setEditRole] = useState(profile.defaultRole);
  const [editContrast, setEditContrast] = useState(profile.accessibility.highContrast);
  const [editMotion, setEditMotion] = useState(profile.accessibility.reducedMotion);
  const [editTTS, setEditTTS] = useState(profile.accessibility.ttsAutoRead);

  // Sync edit form fields when profile state changes
  useEffect(() => {
    setEditName(profile.displayName);
    setEditLang(profile.languageOverride);
    setEditRole(profile.defaultRole);
    setEditContrast(profile.accessibility.highContrast);
    setEditMotion(profile.accessibility.reducedMotion);
    setEditTTS(profile.accessibility.ttsAutoRead);
  }, [profile]);

  // Save profile to localStorage on modification
  const saveProfile = (updated: UserProfile) => {
    setProfile(updated);
    try {
      localStorage.setItem("stadiumpulse_profile", JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save profile to local storage:", e);
    }
  };

  // Live telemetry timer (Simulated for "Last Refreshed" indicator in Top bar)
  useEffect(() => {
    const updateTime = () => {
      setLastSensorUpdate(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  // Keep track of previously high-risk zones and incidents we've seen
  const seenHighRiskZones = useRef<Set<string>>(new Set());
  const seenIncidents = useRef<Set<string>>(new Set());

  // Poller for operations & incidents
  useEffect(() => {
    const pollAll = async () => {
      if (document.hidden) return; // Skip polling when tab is inactive to preserve client/server resources
      try {
        // 1. Fetch operations
        const opsRes = await fetch("/api/operations");
        if (opsRes.ok) {
          const opsData = await opsRes.json();
          if (opsData.zones) {
            setSharedZones(opsData.zones);
            // Check for new high-risk zones
            opsData.zones.forEach((z: ZoneRisk) => {
              if (z.riskLevel === "high") {
                if (!seenHighRiskZones.current.has(z.zoneId)) {
                  seenHighRiskZones.current.add(z.zoneId);
                  addNotification(`CRITICAL ALERT: ${z.name} has entered high density congestion (${z.currentDensity} p/m²)!`, "risk_alert");
                }
              } else {
                seenHighRiskZones.current.delete(z.zoneId);
              }
            });
          }
        }

        // 2. Fetch incidents
        const incRes = await fetch("/api/incidents");
        if (incRes.ok) {
          const incData = await incRes.json();
          incData.forEach((inc: Incident) => {
            if (!seenIncidents.current.has(inc.id)) {
              seenIncidents.current.add(inc.id);
              addNotification(`NEW INCIDENT: ${inc.severity.toUpperCase()} - ${inc.message} in ${inc.zoneName}`, "incident");
            }
          });
        }
      } catch (err) {
        console.error("Poller error in App.tsx:", err);
      }
    };

    pollAll();
    const interval = setInterval(pollAll, 10000);
    return () => clearInterval(interval);
  }, []);

  const addNotification = (message: string, type: "incident" | "risk_alert") => {
    const newNotif = {
      id: `${type}-${Date.now()}-${Math.random()}`,
      message,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      isRead: false,
      type
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  // Save profile changes on form submit
  const handleSaveProfileChanges = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: UserProfile = {
      displayName: editName.trim() || "World Cup Guest",
      languageOverride: editLang,
      defaultRole: editRole,
      accessibility: {
        highContrast: editContrast,
        reducedMotion: editMotion,
        ttsAutoRead: editTTS
      }
    };
    saveProfile(updated);
    setIsProfileOpen(false);
  };

  // Fast direct toggle for accessibility switches directly in UI
  const toggleHighContrast = () => {
    const updated: UserProfile = {
      ...profile,
      accessibility: {
        ...profile.accessibility,
        highContrast: !profile.accessibility.highContrast
      }
    };
    saveProfile(updated);
  };

  const isHighContrast = profile.accessibility.highContrast;
  const reducedMotion = profile.accessibility.reducedMotion;

  // Render navigation list items with key accessibility attributes
  const navItems = [
    { id: "fan" as ViewType, label: "Fan Assistant", icon: Users, desc: "Multilingual navigation chat" },
    { id: "dashboard" as ViewType, label: "Gold Command Dashboard", icon: Terminal, desc: "Stadium telemetry & details" },
    { id: "map" as ViewType, label: "Live Stadium Map", icon: Map, desc: "Interactive spatial grid viewer" },
    { id: "incidents" as ViewType, label: "Incident Log", icon: AlertOctagon, desc: "Emergency logistics tracker" },
    { id: "settings" as ViewType, label: "Settings/Accessibility", icon: Sliders, desc: "Accessibility & layout defaults" }
  ];

  // Helper to retrieve current view title
  const getViewTitle = () => {
    switch (activeTab) {
      case "fan": return "Multilingual Fan Co-Pilot";
      case "dashboard": return "Gold Command Control Centre";
      case "map": return "Live Stadium Spatial View";
      case "incidents": return "Active Emergency Logistics Audit";
      case "settings": return "Accessibility & Application Settings";
      default: return "StadiumPulse AI";
    }
  };

  return (
    <div className={`min-h-screen flex transition-all ${
      isHighContrast 
        ? "bg-black text-white" 
        : "bg-neutral-50 text-neutral-800"
    }`} id="stadiumpulse-root">
      
      {/* 1. LEFT SIDEBAR - Persistent on Desktop, Toggleable drawer on Mobile */}
      <aside 
        className={`fixed inset-y-0 left-0 z-40 border-r transition-all duration-300 md:translate-x-0 md:static flex flex-col justify-between ${
          isSidebarCollapsed ? "w-20" : "w-64"
        } ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${
          isHighContrast 
            ? "bg-black border-white text-white" 
            : "bg-white border-neutral-200/90 shadow-sm"
        }`}
        role="navigation"
        aria-label="Primary Navigation Menu"
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Sidebar Header (App Brand Logo) */}
          <div className={`p-4 flex items-center justify-between border-b ${
            isHighContrast ? "border-white" : "border-neutral-100"
          }`}>
            <div className="flex items-center gap-2.5">
              <div className={`p-1.5 rounded-lg text-white flex items-center justify-center shrink-0 ${
                isHighContrast 
                  ? "bg-white text-black border-2 border-black" 
                  : "bg-gradient-to-br from-teal-500 to-emerald-600"
              }`}>
                <Compass className={`h-5 w-5 ${reducedMotion ? "" : "animate-spin-slow"}`} />
              </div>
              {!isSidebarCollapsed && (
                <div>
                  <h1 className="text-sm font-black tracking-wider uppercase font-display flex items-center gap-1">
                    StadiumPulse <span className="text-teal-600 font-normal">AI</span>
                  </h1>
                  <span className="text-[9px] font-mono opacity-60">FIFA 2026</span>
                </div>
              )}
            </div>

            {/* Mobile Close Button */}
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 cursor-pointer"
              aria-label="Close Navigation Sidebar"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Desktop Collapse Toggle Button */}
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="hidden md:flex p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 cursor-pointer"
              aria-label={isSidebarCollapsed ? "Expand sidebar navigation text" : "Collapse sidebar navigation text"}
            >
              {isSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>

          {/* Sidebar Navigation Items */}
          <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
            {navItems.map((item) => {
              const IconComp = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsSidebarOpen(false); // Auto-close mobile drawer on select
                  }}
                  aria-current={isActive ? "page" : undefined}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center cursor-pointer group focus:outline-hidden focus:ring-2 focus:ring-teal-500/30 ${
                    isSidebarCollapsed ? "justify-center" : "gap-3"
                  } ${
                    isActive
                      ? isHighContrast
                        ? "bg-white text-black font-black border-2 border-black"
                        : "bg-teal-600 text-white font-semibold shadow-sm"
                      : isHighContrast
                      ? "text-white bg-black hover:bg-neutral-900 border border-transparent hover:border-white"
                      : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/70"
                  }`}
                  title={item.label}
                >
                  <IconComp className={`h-4.5 w-4.5 shrink-0 transition-transform ${
                    isActive ? "text-white" : "text-neutral-400 group-hover:text-neutral-600"
                  } ${isActive && isHighContrast ? "text-black" : ""}`} />
                  {!isSidebarCollapsed && (
                    <div className="min-w-0">
                      <span className="text-xs font-bold block leading-none">{item.label}</span>
                      <span className={`text-[9px] block opacity-70 truncate mt-0.5 ${isActive ? "text-white/80" : ""}`}>
                        {item.desc}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer/Status Area */}
        {!isSidebarCollapsed ? (
          <div className={`p-4 border-t text-[10.5px] ${
            isHighContrast ? "border-white" : "border-neutral-100 bg-neutral-50/40 text-neutral-500"
          }`}>
            <div className="space-y-1.5">
              <span className="font-semibold text-neutral-800 block">Accessibility Quick Panel</span>
              <span className="text-[10px] text-neutral-400 block leading-tight">Persistent WCAG contrast overrides.</span>
            </div>
            <button 
              onClick={toggleHighContrast}
              className="mt-3 w-full py-1.5 px-2 text-center rounded-lg border border-neutral-300 hover:bg-neutral-100 text-[10px] font-bold block cursor-pointer transition-all"
            >
              🌗 Contrast: {isHighContrast ? "High" : "Standard"}
            </button>
          </div>
        ) : (
          <div className="p-4 border-t flex flex-col items-center justify-center gap-2">
            <button
              onClick={toggleHighContrast}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                isHighContrast ? "bg-white text-black border-white" : "bg-neutral-100 border-neutral-200 hover:bg-neutral-200"
              }`}
              title="Toggle Contrast"
            >
              🌗
            </button>
          </div>
        )}
      </aside>

      {/* Backdrop overlay for mobile drawer */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/40 z-30 md:hidden backdrop-blur-xs"
        />
      )}

      {/* 2. MAIN APP FRAME - TOP BAR & CONTENT VIEWPORT */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Header Bar */}
        <header className={`border-b transition-all sticky top-0 z-20 ${
          isHighContrast 
            ? "bg-black border-white text-white" 
            : "bg-white border-neutral-200/80 text-neutral-800 shadow-xs"
        }`} id="app-topbar">
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            
            {/* Mobile Menu Hamburger Trigger */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="md:hidden p-2 rounded-xl border border-neutral-200/80 text-neutral-600 hover:text-neutral-900 cursor-pointer"
                aria-label="Open Navigation Sidebar Menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              
              {/* Dynamic View Title */}
              <div>
                <h2 className="text-sm font-black font-display tracking-tight text-neutral-900 leading-tight">
                  {getViewTitle()}
                </h2>
                <div className="hidden sm:flex items-center gap-2 text-[10px] text-neutral-400 font-sans mt-0.5">
                  <span>FIFA World Cup 2026 MetLife Logistics</span>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-neutral-300" />
                    <span>Sensors polled: <strong className="font-mono">{lastSensorUpdate}</strong></span>
                  </div>
                </div>
              </div>
            </div>

            {/* User Profile & Quick Accessibility triggers */}
            <div className="flex items-center gap-2.5">
              
              {/* Notification Center Trigger & Panel */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className={`p-2 rounded-xl border relative transition-all cursor-pointer flex items-center justify-center ${
                    isHighContrast
                      ? "bg-black border-white text-white hover:bg-neutral-900"
                      : "bg-neutral-50 hover:bg-neutral-100 border-neutral-200/80 text-neutral-700"
                  }`}
                  aria-label={`In-App Alerts Center, ${notifications.filter(n => !n.isRead).length} unread alerts`}
                  aria-haspopup="true"
                  aria-expanded={showNotifications}
                >
                  <Bell className="h-4.5 w-4.5" />
                  {notifications.filter(n => !n.isRead).length > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 bg-rose-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center animate-pulse">
                      {notifications.filter(n => !n.isRead).length}
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <div className={`absolute right-0 mt-2 w-80 rounded-2xl border shadow-xl z-50 overflow-hidden ${
                    isHighContrast
                      ? "bg-black border-2 border-white text-white"
                      : "bg-white border border-neutral-200 text-neutral-800"
                  }`}>
                    <div className="p-3 border-b border-neutral-100 flex items-center justify-between bg-neutral-50">
                      <span className="font-bold text-[10px] uppercase tracking-wider text-neutral-800">Operational Alerts</span>
                      <button
                        onClick={() => {
                          setNotifications(notifications.map(n => ({ ...n, isRead: true })));
                        }}
                        className="text-[9px] font-bold text-teal-600 hover:text-teal-700 font-mono cursor-pointer"
                      >
                        Mark all read
                      </button>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-neutral-100">
                      {notifications.length === 0 ? (
                        <div className="p-5 text-center text-neutral-400 text-[11px] italic">
                          No active notifications
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div 
                            key={n.id} 
                            onClick={() => {
                              setNotifications(notifications.map(not => not.id === n.id ? { ...not, isRead: true } : not));
                            }}
                            className={`p-3 text-xs transition-colors cursor-pointer text-left ${
                              n.isRead ? "opacity-60 bg-transparent" : "bg-teal-50/20 font-semibold"
                            }`}
                          >
                            <div className="flex justify-between items-start gap-1">
                              <span className={`inline-block text-[8px] px-1.5 py-0.5 rounded font-mono uppercase shrink-0 ${
                                n.type === "risk_alert" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                              }`}>
                                {n.type.replace("_", " ")}
                              </span>
                              <span className="text-[9px] text-neutral-400 font-mono">{n.timestamp}</span>
                            </div>
                            <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-900">{n.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Profile Avatar Control Button */}
              <button
                onClick={() => setIsProfileOpen(true)}
                className={`flex items-center gap-2 p-1 px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer ${
                  isHighContrast 
                    ? "bg-black border-white text-white hover:bg-neutral-900" 
                    : "bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border-neutral-200/80"
                }`}
                id="user-profile-button"
                aria-haspopup="dialog"
                aria-expanded={isProfileOpen}
                aria-label="Open User Profile Panel"
              >
                <div className="h-6 w-6 rounded-lg bg-teal-600 text-white font-bold flex items-center justify-center text-[10px] uppercase shadow-xs">
                  {profile.displayName.charAt(0)}
                </div>
                <div className="text-left hidden sm:block">
                  <span className="text-[11px] font-bold block leading-none">{profile.displayName}</span>
                  <span className="text-[9px] font-mono opacity-65 uppercase">{profile.defaultRole} mode</span>
                </div>
              </button>
            </div>

          </div>
        </header>

        {/* Primary Page Content Wrapper */}
        <main className="flex-1 p-4 md:p-6 space-y-6 max-w-7xl w-full mx-auto">
          
          {/* Explanatory Banner */}
          {showInfoBanner && (
            <div className={`p-5 rounded-2xl border transition-all relative ${
              isHighContrast 
                ? "bg-black border-4 border-yellow-400 text-yellow-400" 
                : "bg-gradient-to-r from-teal-900 to-emerald-950 text-white shadow-md"
            }`} id="info-explanatory-banner">
              <button
                onClick={() => setShowInfoBanner(false)}
                className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-1.5 rounded-lg text-xs transition-colors"
                title="Dismiss details"
              >
                ✕
              </button>
              <div className="flex gap-4 items-start pr-8">
                <div className="p-3 bg-white/10 rounded-xl hidden sm:flex shrink-0">
                  <Sparkles className="h-6 w-6 text-teal-400" />
                </div>
                <div className="space-y-1.5 text-xs">
                  <h2 className="text-sm font-bold font-display tracking-tight text-white flex items-center gap-2">
                    StadiumPulse AI — Smart Stadium Tournament Operations
                  </h2>
                  <p className="opacity-85 leading-relaxed text-[11px]">
                    StadiumPulse uses actual rule-based safety equations for density risk metrics, and synthesizes that context in a <strong>Gemini-2.5-Flash</strong> conversational model to guide fans (Fan Assistant) and assist command operators (Gold Command Console) symmetrically.
                  </p>
                  
                  {/* Features Quick List */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 text-[10px] text-teal-200">
                    <div>
                      <strong className="text-white block">📊 Real Safety Models</strong>
                      Calculates congestion and risk limits deterministically for reliable safety logic.
                    </div>
                    <div>
                      <strong className="text-white block">🌍 Intelligent Language</strong>
                      Seamlessly auto-detects user languages or respects manual preferred overrides.
                    </div>
                    <div>
                      <strong className="text-white block">♿ Highly Accessible Layout</strong>
                      Features WCAG AAA contrast theme, reduced-motion bypasses, and auto-read screen optimizations.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Dynamic Tab Panel Switching */}
          <section className="transition-all" id="main-view-deck" role="tabpanel">
            {activeTab === "fan" && (
              <FanApp 
                isHighContrast={isHighContrast} 
                reducedMotion={reducedMotion}
                userProfile={profile}
                initialRouteZoneId={routedZoneId}
                onClearInitialRoute={() => setRoutedZoneId(null)}
              />
            )}
            {activeTab === "dashboard" && (
              <OperatorDashboard 
                isHighContrast={isHighContrast} 
                reducedMotion={reducedMotion}
                userProfile={profile}
              />
            )}
            {activeTab === "map" && (
              <div className={`p-6 rounded-2xl border transition-all ${
                isHighContrast ? "bg-black border-4 border-white text-white" : "bg-white border border-neutral-200/80 shadow-sm"
              }`} id="dedicated-stadium-map-view">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-150 pb-4 mb-4">
                  <div>
                    <h3 className="font-display font-bold text-sm uppercase tracking-wider text-neutral-900 flex items-center gap-2">
                      <Map className="h-5 w-5 text-teal-600" />
                      FIFA 2026 Interactive Spatial Grid
                    </h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Visualizing critical stadium flows and security checkpoints spatially.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-neutral-400">
                      High-Contrast: <strong>{isHighContrast ? "Active" : "Standard"}</strong>
                    </span>
                  </div>
                </div>

                {sharedZones.length > 0 ? (
                  <StadiumMap
                    zones={sharedZones}
                    selectedZoneId={mapSelectedZoneId}
                    onSelectZone={(zoneId) => setMapSelectedZoneId(zoneId)}
                    isHighContrast={isHighContrast}
                    reducedMotion={reducedMotion}
                    onRouteMeHere={(zoneId) => {
                      setRoutedZoneId(zoneId);
                      setActiveTab("fan");
                    }}
                  />
                ) : (
                  <div className="py-20 text-center text-xs text-neutral-400 space-y-2">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto text-neutral-300" />
                    <p>Connecting to MetLife Stadium security nodes...</p>
                  </div>
                )}
              </div>
            )}
            {activeTab === "incidents" && (
              <IncidentLogView 
                isHighContrast={isHighContrast} 
                reducedMotion={reducedMotion}
              />
            )}
            {activeTab === "settings" && (
              <div className={`p-6 rounded-2xl border transition-all ${
                isHighContrast ? "bg-black border-4 border-white text-white" : "bg-white border-neutral-200/80 shadow-xs"
              }`} id="accessibility-settings-tab">
                <h3 className="font-display font-bold text-base text-neutral-900 mb-2 flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-teal-600" />
                  StadiumPulse Interface Preferences
                </h3>
                <p className="text-xs text-neutral-500 mb-6">
                  Manage persistent local language, screen display modes, and automatic audio narration controls.
                </p>

                <div className="space-y-6 max-w-xl">
                  {/* Preferences form inside dedicated page */}
                  <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-100 space-y-4 text-xs">
                    <div className="space-y-1">
                      <span className="font-bold block text-neutral-900">High-Contrast Mode</span>
                      <span className="text-neutral-500 block text-[11px]">Enables bright WCAG 2.1 AAA high contrast lines.</span>
                      <button 
                        onClick={toggleHighContrast}
                        className={`mt-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          isHighContrast 
                            ? "bg-yellow-400 text-black border-yellow-400" 
                            : "bg-white border-neutral-300 text-neutral-700"
                        }`}
                      >
                        {isHighContrast ? "Disable High-Contrast" : "Enable High-Contrast"}
                      </button>
                    </div>

                    <hr className="border-neutral-200" />

                    <div className="space-y-1">
                      <span className="font-bold block text-neutral-900">Reduced Motion</span>
                      <span className="text-neutral-500 block text-[11px]">Excludes panning waves and fast transition spins.</span>
                      <button 
                        onClick={() => {
                          saveProfile({
                            ...profile,
                            accessibility: {
                              ...profile.accessibility,
                              reducedMotion: !profile.accessibility.reducedMotion
                            }
                          });
                        }}
                        className={`mt-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          profile.accessibility.reducedMotion 
                            ? "bg-teal-600 text-white border-teal-600" 
                            : "bg-white border-neutral-300 text-neutral-700"
                        }`}
                      >
                        {profile.accessibility.reducedMotion ? "Motion: Disabled" : "Motion: Standard"}
                      </button>
                    </div>

                    <hr className="border-neutral-200" />

                    <div className="space-y-1">
                      <span className="font-bold block text-neutral-900">TTS Audio Auto-Read</span>
                      <span className="text-neutral-500 block text-[11px]">Narrate AI messages aloud immediately upon retrieval.</span>
                      <button 
                        onClick={() => {
                          saveProfile({
                            ...profile,
                            accessibility: {
                              ...profile.accessibility,
                              ttsAutoRead: !profile.accessibility.ttsAutoRead
                            }
                          });
                        }}
                        className={`mt-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          profile.accessibility.ttsAutoRead 
                            ? "bg-teal-600 text-white border-teal-600" 
                            : "bg-white border-neutral-300 text-neutral-700"
                        }`}
                      >
                        {profile.accessibility.ttsAutoRead ? "Auto-Read: On" : "Auto-Read: Off"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

        </main>

        {/* Simple Global Footer */}
        <footer className={`border-t py-5 mt-12 text-center text-xs transition-all ${
          isHighContrast 
            ? "bg-black border-white text-white" 
            : "bg-white border-neutral-200/80 text-neutral-400"
        }`} id="app-footer">
          <div className="px-4 space-y-1.5">
            <p>© 2026 StadiumPulse AI — Smart Stadium & Tournament Operations (FIFA Challenge 4)</p>
            <p className="text-[10px] opacity-70">Unified rule-based density matrix scoring grounded on real-time sensory feeds.</p>
          </div>
        </footer>

      </div>

      {/* 3. RIGHT PROFILE PANEL - Slide-out drawer overlay */}
      {isProfileOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="profile-panel-title">
          {/* Backdrop overlay */}
          <div 
            onClick={() => setIsProfileOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
          />

          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className={`w-screen max-w-sm border-l transition-all ${
              isHighContrast 
                ? "bg-black border-white text-white" 
                : "bg-white border-neutral-200/90 shadow-2xl text-neutral-800"
            }`}>
              
              {/* Form container */}
              <form onSubmit={handleSaveProfileChanges} className="h-full flex flex-col justify-between p-6">
                
                <div className="space-y-6">
                  {/* Panel Header */}
                  <div className="flex items-center justify-between border-b pb-4">
                    <h3 id="profile-panel-title" className="font-display font-black text-sm uppercase tracking-wider flex items-center gap-2">
                      <User className="h-4.5 w-4.5 text-teal-600" />
                      Client Profile & Preferences
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsProfileOpen(false)}
                      className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                      aria-label="Close Profile Panel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Profile Note */}
                  <div className="p-3 bg-teal-50/50 border border-teal-100 rounded-xl text-[10.5px] leading-relaxed text-teal-800">
                    <strong>Local Environment Storage Only:</strong> All display modifications are kept on this physical client browser index for safety (No login accounts, no PII tracking).
                  </div>

                  {/* Settings fields */}
                  <div className="space-y-4 text-xs">
                    
                    {/* Name edit */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
                        Display Name
                      </label>
                      <input
                        type="text"
                        className={`w-full p-2.5 rounded-lg border text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden ${
                          isHighContrast ? "bg-black border-white text-white" : "bg-white border-neutral-300"
                        }`}
                        placeholder="World Cup Guest"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={25}
                      />
                    </div>

                    {/* Language pick override */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
                        Preferred Language Override
                      </label>
                      <select
                        className={`w-full p-2.5 rounded-lg border text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden ${
                          isHighContrast ? "bg-black border-white text-white" : "bg-white border-neutral-300"
                        }`}
                        value={editLang}
                        onChange={(e) => setEditLang(e.target.value)}
                      >
                        <option value="auto">Auto-Detect Query Language (Default)</option>
                        <option value="en">English (English)</option>
                        <option value="es">Español (Spanish)</option>
                        <option value="fr">Français (French)</option>
                        <option value="de">Deutsch (German)</option>
                        <option value="hi">हिन्दी (Hindi)</option>
                        <option value="ar">العربية (Arabic)</option>
                        <option value="pt">Português (Portuguese)</option>
                        <option value="ja">日本語 (Japanese)</option>
                      </select>
                      <span className="text-[10px] text-neutral-400 leading-tight block">
                        Saves manual choice override for Gemini conversation returns.
                      </span>
                    </div>

                    {/* Default mode role switcher */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
                        UX Default View Role
                      </label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setEditRole("fan")}
                          className={`py-2 text-center rounded-lg font-bold border transition-all cursor-pointer ${
                            editRole === "fan"
                              ? isHighContrast
                                ? "bg-white text-black border-white"
                                : "bg-teal-600 text-white border-teal-600 shadow-sm"
                              : "bg-transparent border-neutral-300 text-neutral-500 hover:text-neutral-800"
                          }`}
                        >
                          Fan Mode
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditRole("operator")}
                          className={`py-2 text-center rounded-lg font-bold border transition-all cursor-pointer ${
                            editRole === "operator"
                              ? isHighContrast
                                ? "bg-white text-black border-white"
                                : "bg-teal-600 text-white border-teal-600 shadow-sm"
                              : "bg-transparent border-neutral-300 text-neutral-500 hover:text-neutral-800"
                          }`}
                        >
                          Operator Mode
                        </button>
                      </div>
                      <span className="text-[10px] text-neutral-400 leading-tight block">
                        Determines default landing screen upon application reload.
                      </span>
                    </div>

                    {/* Quick Toggles */}
                    <div className="space-y-2.5 pt-2 border-t">
                      <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
                        Accessibility Quick Config
                      </span>
                      
                      {/* Contrast toggle */}
                      <label className="flex items-center justify-between cursor-pointer select-none">
                        <span className="text-xs font-semibold">High Contrast (WCAG 2.1)</span>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={editContrast}
                          onChange={(e) => setEditContrast(e.target.checked)}
                        />
                        <div className={`w-9 h-5 rounded-full transition-colors relative ${editContrast ? "bg-teal-600" : "bg-neutral-300"}`}>
                          <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-transform ${editContrast ? "translate-x-4.5" : "translate-x-0.75"}`} />
                        </div>
                      </label>

                      {/* Motion toggle */}
                      <label className="flex items-center justify-between cursor-pointer select-none">
                        <span className="text-xs font-semibold">Reduced Motion</span>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={editMotion}
                          onChange={(e) => setEditMotion(e.target.checked)}
                        />
                        <div className={`w-9 h-5 rounded-full transition-colors relative ${editMotion ? "bg-teal-600" : "bg-neutral-300"}`}>
                          <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-transform ${editMotion ? "translate-x-4.5" : "translate-x-0.75"}`} />
                        </div>
                      </label>

                      {/* TTS auto toggles */}
                      <label className="flex items-center justify-between cursor-pointer select-none">
                        <span className="text-xs font-semibold">TTS Auto-Read AI Reply</span>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={editTTS}
                          onChange={(e) => setEditTTS(e.target.checked)}
                        />
                        <div className={`w-9 h-5 rounded-full transition-colors relative ${editTTS ? "bg-teal-600" : "bg-neutral-300"}`}>
                          <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-transform ${editTTS ? "translate-x-4.5" : "translate-x-0.75"}`} />
                        </div>
                      </label>
                    </div>

                  </div>
                </div>

                {/* Footer submit action */}
                <div className="pt-4 border-t border-neutral-100 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex-1 py-2 rounded-lg text-xs font-bold text-center border border-neutral-300 text-neutral-600 hover:text-neutral-900 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={`flex-1 py-2 rounded-lg text-xs font-bold text-center shadow-sm cursor-pointer transition-colors ${
                      isHighContrast
                        ? "bg-yellow-400 text-black hover:bg-yellow-500"
                        : "bg-teal-600 text-white hover:bg-teal-700"
                    }`}
                  >
                    Save Changes
                  </button>
                </div>

              </form>
            </div>
          </div>
        </div>
      )}

      {showOnboarding && (
        <OnboardingTour
          isHighContrast={isHighContrast}
          reducedMotion={reducedMotion}
          onDismiss={() => {
            setShowOnboarding(false);
            try {
              localStorage.setItem("stadiumpulse_onboarded", "true");
            } catch (e) {
              console.error(e);
            }
          }}
        />
      )}

    </div>
  );
}

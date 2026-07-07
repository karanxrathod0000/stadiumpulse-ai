import React, { useState, useEffect } from "react";
import { 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle, 
  Plus, 
  Trash2, 
  AlertOctagon, 
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  FileSpreadsheet
} from "lucide-react";
import { ZoneRisk, Incident } from "../types";

interface IncidentLogViewProps {
  isHighContrast: boolean;
  reducedMotion: boolean;
}

export default function IncidentLogView({ isHighContrast, reducedMotion }: IncidentLogViewProps) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [zones, setZones] = useState<ZoneRisk[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "resolved">("all");
  const [severityFilter, setSeverityFilter] = useState<"all" | "info" | "warning" | "critical">("all");

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // New incident form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [formZoneId, setFormZoneId] = useState("");
  const [formSeverity, setFormSeverity] = useState<"info" | "warning" | "critical">("warning");
  const [formMessage, setFormMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch telemetry and incidents
  const fetchData = async () => {
    if (document.hidden) return; // Skip polling when tab is inactive to preserve client/server resources
    setIsLoading(true);
    setError(null);
    try {
      const [zonesRes, incidentsRes] = await Promise.all([
        fetch("/api/operations"),
        fetch("/api/incidents")
      ]);

      if (zonesRes.ok) {
        const zonesData = await zonesRes.json();
        setZones(zonesData.zones);
        if (zonesData.zones.length > 0 && !formZoneId) {
          setFormZoneId(zonesData.zones[0].zoneId);
        }
      }

      if (incidentsRes.ok) {
        const incidentsData = await incidentsRes.json();
        setIncidents(incidentsData);
      } else {
        throw new Error("Failed to fetch incident logs from server.");
      }
    } catch (err: any) {
      setError(err.message || "Network error. Unable to load emergency log telemetry.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll every 10 seconds
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  // Filter incidents based on criteria
  const filteredIncidents = incidents.filter(inc => {
    const matchesSearch = inc.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          inc.zoneName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          inc.id.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" ? true : inc.status === statusFilter;
    const matchesSeverity = severityFilter === "all" ? true : inc.severity === severityFilter;

    return matchesSearch && matchesStatus && matchesSeverity;
  });

  // Paginated incidents
  const totalPages = Math.max(1, Math.ceil(filteredIncidents.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedIncidents = filteredIncidents.slice(startIndex, startIndex + itemsPerPage);

  // Keep page index within bounds if filters change
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [filteredIncidents.length, totalPages, currentPage]);

  // Dispatch manual incident with optimistic UI updates for instant feedback
  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formMessage.trim()) return;

    const matchedZone = zones.find(z => z.zoneId === formZoneId);
    const zoneName = matchedZone ? matchedZone.name : "Unknown Zone";
    setIsSubmitting(true);

    const tempId = `dispatch-${Date.now().toString().slice(-4)}`;
    const newIncident: Incident = {
      id: tempId,
      timestamp: new Date().toISOString(),
      zoneId: formZoneId,
      zoneName,
      severity: formSeverity,
      message: formMessage,
      status: "active"
    };

    // Optimistically prepend new incident for immediate user feedback
    setIncidents(prev => [newIncident, ...prev]);
    setFormMessage("");
    setShowAddForm(false);

    try {
      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zoneId: formZoneId,
          zoneName,
          severity: formSeverity,
          message: formMessage
        })
      });

      if (!response.ok) {
        throw new Error("Server rejected incident logging.");
      }
      
      // Refresh to grab true database record with official ID
      const incResponse = await fetch("/api/incidents");
      if (incResponse.ok) {
        const incData = await incResponse.json();
        setIncidents(incData);
      }
    } catch (err) {
      console.error("Failed to create manual incident:", err);
      alert("Emergency logging failed. Reverting optimistic dashboard entry.");
      // Rollback on failure
      setIncidents(prev => prev.filter(inc => inc.id !== tempId));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resolve incident with optimistic UI state transition
  const handleResolveIncident = async (id: string) => {
    // Optimistic state change
    setIncidents(prev => prev.map(inc => {
      if (inc.id === id) {
        return { ...inc, status: "resolved" as const };
      }
      return inc;
    }));

    try {
      const response = await fetch("/api/incidents/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (!response.ok) {
        throw new Error("Failed to mark incident as resolved on server.");
      }
    } catch (err) {
      console.error("Failed to resolve incident:", err);
      // Revert status on failure
      setIncidents(prev => prev.map(inc => {
        if (inc.id === id) {
          return { ...inc, status: "active" as const };
        }
        return inc;
      }));
    }
  };

  // Purge/Clear logs with instant update
  const handleClearAllIncidents = async () => {
    if (!confirm("Are you sure you want to purge all active incident history logs?")) return;
    const oldIncidents = [...incidents];
    setIncidents([]); // clear immediately

    try {
      const response = await fetch("/api/incidents/clear-all", { method: "POST" });
      if (!response.ok) {
        throw new Error("Purge failed.");
      }
    } catch (err) {
      console.error("Failed to clear logs:", err);
      setIncidents(oldIncidents); // restore on failure
    }
  };

  // Export incident history to CSV for audits and operational analytics
  const handleExportCSV = () => {
    if (incidents.length === 0) {
      alert("No active or historical incidents recorded to export.");
      return;
    }
    
    const headers = ["ID", "Timestamp", "Zone ID", "Zone Name", "Severity", "Message", "Status"];
    const rows = incidents.map(inc => [
      inc.id,
      inc.timestamp,
      inc.zoneId,
      `"${inc.zoneName.replace(/"/g, '""')}"`,
      inc.severity,
      `"${inc.message.replace(/"/g, '""')}"`,
      inc.status
    ]);
    
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `stadiumpulse_incident_log_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6" id="incident-log-view-container">
      {/* Top action header card */}
      <div className={`p-6 rounded-2xl border transition-all ${
        isHighContrast 
          ? "bg-black border-4 border-white text-white" 
          : "bg-white border-neutral-200/80 shadow-xs"
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-bold font-display tracking-tight flex items-center gap-2">
              <AlertOctagon className="h-6 w-6 text-rose-500" />
              Emergency Logistics Dispatch & Audit Logs
            </h2>
            <p className="text-xs text-neutral-500">
              Real-time audit trails of active and resolved tournament safety breaches, crowded blockages, and staff tasks.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleExportCSV}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl border transition-all flex items-center gap-2 cursor-pointer ${
                isHighContrast
                  ? "bg-black border-4 border-white text-white hover:bg-neutral-900"
                  : "bg-white border-neutral-300 hover:bg-neutral-50 text-neutral-700 shadow-xs"
              }`}
              id="export-incident-log-btn"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              Export CSV Audit Log
            </button>
            <button
              onClick={() => setShowAddForm(prev => !prev)}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                isHighContrast
                  ? "bg-yellow-400 text-black font-extrabold hover:bg-yellow-500"
                  : "bg-teal-600 hover:bg-teal-700 text-white shadow-xs"
              }`}
              id="log-new-incident-btn"
            >
              <Plus className="h-4 w-4" />
              Dispatch Emergency Alert
            </button>
            {incidents.length > 0 && (
              <button
                onClick={handleClearAllIncidents}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                  isHighContrast
                    ? "border-red-500 text-red-500 hover:bg-red-950"
                    : "border-neutral-200 hover:border-rose-200 hover:bg-rose-50 text-neutral-400 hover:text-rose-600"
                }`}
                title="Purge logs"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Dispatch Form Card */}
        {showAddForm && (
          <form 
            onSubmit={handleCreateIncident} 
            className={`mt-6 p-5 rounded-xl border space-y-4 ${
              isHighContrast 
                ? "bg-black border-2 border-white" 
                : "bg-neutral-50 border-neutral-200"
            }`}
            id="dispatch-manual-alert-form"
          >
            <div className="flex justify-between items-center border-b border-neutral-200/60 pb-2">
              <span className="font-bold text-sm text-neutral-900 flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 text-rose-600" />
                Dispatch Custom Emergency/Logistics Alert
              </span>
              <button 
                type="button" 
                onClick={() => setShowAddForm(false)} 
                className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
                  Incident Location (Zone)
                </label>
                <select 
                  className={`w-full p-2.5 rounded-lg border text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden ${
                    isHighContrast ? "bg-black border-white text-white" : "bg-white border-neutral-300"
                  }`}
                  value={formZoneId}
                  onChange={(e) => setFormZoneId(e.target.value)}
                  required
                >
                  <option value="" disabled>-- Select MetLife Zone --</option>
                  {zones.map(z => (
                    <option key={z.zoneId} value={z.zoneId}>{z.name} ({z.type.toUpperCase()})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
                  Alert Severity Tier
                </label>
                <select 
                  className={`w-full p-2.5 rounded-lg border text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden ${
                    isHighContrast ? "bg-black border-white text-white" : "bg-white border-neutral-300"
                  }`}
                  value={formSeverity}
                  onChange={(e) => setFormSeverity(e.target.value as any)}
                  required
                >
                  <option value="info">Info (Log Note Only)</option>
                  <option value="warning">Warning (Medium Alert)</option>
                  <option value="critical">Critical (High Level / Police / Medical)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
                Emergency Alert Description
              </label>
              <textarea
                className={`w-full p-3 rounded-lg border text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden font-sans resize-none h-20 ${
                  isHighContrast ? "bg-black border-white text-white" : "bg-white border-neutral-300"
                }`}
                placeholder="Log exact crowd blockages or logistical alerts (e.g., 'West concourse escalators stopped due to spill. Crowd bottle-necking. Dispatch spill response.')"
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200/40">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-all"
              >
                Dismiss
              </button>
              <button 
                type="submit"
                disabled={isSubmitting}
                className={`px-6 py-2 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer ${
                  isHighContrast
                    ? "bg-yellow-400 text-black font-extrabold hover:bg-yellow-500"
                    : "bg-rose-600 hover:bg-rose-700 text-white"
                }`}
              >
                {isSubmitting ? "Dispatching..." : "Publish Emergency Alert"}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Main Grid: Filters & Search Left (or Top) and Paginated Incidents List */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Sidebar Filters */}
        <div className="lg:col-span-1 space-y-4">
          <div className={`p-5 rounded-2xl border transition-all ${
            isHighContrast 
              ? "bg-black border-4 border-white text-white" 
              : "bg-white border-neutral-200/80 shadow-xs"
          }`}>
            <h3 className="font-display font-bold text-sm text-neutral-800 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <Filter className="h-4 w-4 text-teal-600" />
              Filter Audits
            </h3>

            <div className="space-y-4 text-xs">
              {/* Search input */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-neutral-400 uppercase">Search logs</label>
                <div className="relative">
                  <input
                    type="text"
                    className={`w-full pl-8 pr-3 py-2 rounded-lg border text-xs focus:outline-hidden ${
                      isHighContrast ? "bg-black border-white text-white" : "bg-white border-neutral-300"
                    }`}
                    placeholder="Search message, area..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-2.5 top-3" />
                </div>
              </div>

              {/* Status filter */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-neutral-400 uppercase">Status</label>
                <div className="flex flex-col gap-1.5">
                  {[
                    { id: "all", label: "All Items" },
                    { id: "active", label: "🔴 Active Only" },
                    { id: "resolved", label: "🟢 Resolved Only" }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setStatusFilter(opt.id as any)}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition-all font-medium ${
                        statusFilter === opt.id
                          ? isHighContrast
                            ? "bg-white text-black font-black border-white"
                            : "bg-teal-50 text-teal-900 border-teal-200"
                          : isHighContrast
                          ? "bg-black border-transparent text-white hover:border-white"
                          : "bg-transparent border-transparent hover:bg-neutral-50 text-neutral-600 hover:text-neutral-900"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Severity filter */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-neutral-400 uppercase">Severity Tier</label>
                <div className="flex flex-col gap-1.5">
                  {[
                    { id: "all", label: "All Levels" },
                    { id: "critical", label: "🔴 Critical Alerts" },
                    { id: "warning", label: "🟡 Warning Levels" },
                    { id: "info", label: "🔵 Informational" }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setSeverityFilter(opt.id as any)}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition-all font-medium ${
                        severityFilter === opt.id
                          ? isHighContrast
                            ? "bg-white text-black font-black border-white"
                            : "bg-neutral-100 border-neutral-300 text-neutral-900"
                          : isHighContrast
                          ? "bg-black border-transparent text-white hover:border-white"
                          : "bg-transparent border-transparent hover:bg-neutral-50 text-neutral-600 hover:text-neutral-900"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clear filters shortcut */}
              {(searchQuery || statusFilter !== "all" || severityFilter !== "all") && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("all");
                    setSeverityFilter("all");
                  }}
                  className="w-full text-center py-2 border border-dashed border-neutral-300 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50"
                >
                  Reset Active Filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Log stream column */}
        <div className="lg:col-span-3 space-y-4">
          <div className={`p-6 rounded-2xl border transition-all ${
            isHighContrast 
              ? "bg-black border-4 border-white text-white" 
              : "bg-white border-neutral-200/80 shadow-xs"
          }`}>
            <div className="flex justify-between items-center border-b border-neutral-100 pb-3.5 mb-4">
              <span className="font-mono text-xs font-bold text-neutral-400 flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                SHOWING {filteredIncidents.length} OF {incidents.length} ENTRIES
              </span>
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[10px] font-mono text-neutral-400">Live Listening enabled</span>
              </div>
            </div>

            {/* Incident logs list */}
            {isLoading && incidents.length === 0 ? (
              <div className="py-24 text-center text-xs text-neutral-400 space-y-2.5">
                <Compass className="h-8 w-8 text-teal-600 animate-spin-slow mx-auto" />
                <p>Establishing secure socket connection to MetLife IoT log server...</p>
              </div>
            ) : filteredIncidents.length === 0 ? (
              <div className="py-24 text-center text-xs text-neutral-400 space-y-1.5">
                <AlertOctagon className="h-8 w-8 text-neutral-300 mx-auto" />
                <p className="font-bold text-neutral-600">No matching incident logs cataloged</p>
                <p className="max-w-xs mx-auto text-[11px]">
                  All streams nominal. Adjust search queries or filters to explore alternative historical records.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {paginatedIncidents.map((inc) => (
                  <div 
                    key={inc.id}
                    className={`p-4 rounded-xl border flex items-start gap-4 text-xs transition-all ${
                      reducedMotion ? "" : "transform hover:-translate-y-0.5"
                    } ${
                      inc.status === "resolved"
                        ? "bg-neutral-50/50 border-neutral-200/60 text-neutral-400"
                        : inc.severity === "critical"
                        ? "bg-red-50/65 border-red-200 text-red-950"
                        : inc.severity === "warning"
                        ? "bg-amber-50/65 border-amber-200 text-amber-950"
                        : "bg-blue-50/65 border-blue-200 text-blue-950"
                    }`}
                  >
                    <div className="shrink-0 mt-0.5">
                      {inc.status === "resolved" ? (
                        <span className="p-1 rounded-full bg-neutral-100 block border border-neutral-300">
                          <CheckCircle className="h-4 w-4 text-neutral-500" />
                        </span>
                      ) : inc.severity === "critical" ? (
                        <span className="p-1 rounded-full bg-red-100 block border border-red-300 animate-pulse">
                          <ShieldAlert className="h-4.5 w-4.5 text-red-600" />
                        </span>
                      ) : (
                        <span className="p-1 rounded-full bg-amber-100 block border border-amber-300">
                          <AlertTriangle className="h-4.5 w-4.5 text-amber-600" />
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-bold font-display text-sm ${inc.status === "resolved" ? "line-through" : "text-neutral-900"}`}>
                          {inc.zoneName}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border ${
                            inc.status === "resolved"
                              ? "bg-neutral-100 border-neutral-300 text-neutral-500"
                              : inc.severity === "critical"
                              ? "bg-red-100 border-red-300 text-red-700"
                              : inc.severity === "warning"
                              ? "bg-amber-100 border-amber-300 text-amber-700"
                              : "bg-blue-100 border-blue-300 text-blue-700"
                          }`}>
                            {inc.status === "resolved" ? "Resolved" : `${inc.severity} Alert`}
                          </span>
                          <span className="text-[10px] font-mono text-neutral-400">
                            ID: {inc.id}
                          </span>
                        </div>
                      </div>

                      <p className={`text-[11px] leading-relaxed ${inc.status === "resolved" ? "line-through opacity-80" : "text-neutral-700 font-semibold"}`}>
                        {inc.message}
                      </p>

                      <div className="flex items-center justify-between text-[10px] font-mono pt-1 opacity-80 border-t border-neutral-200/40">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-neutral-400" />
                          <span>Dispatched: {new Date(inc.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </div>
                        {inc.status === "active" && (
                          <button
                            onClick={() => handleResolveIncident(inc.id)}
                            className="text-[10px] font-bold text-emerald-800 bg-white border border-emerald-300 hover:bg-emerald-50 px-3 py-1 rounded-lg transition-all cursor-pointer shadow-xs shrink-0"
                          >
                            Mark Resolved
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-6 mt-6 border-t border-neutral-100">
                <span className="text-xs text-neutral-500 font-mono">
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-2 border border-neutral-200 rounded-lg text-neutral-500 hover:text-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    aria-label="Previous Page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 border border-neutral-200 rounded-lg text-neutral-500 hover:text-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    aria-label="Next Page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

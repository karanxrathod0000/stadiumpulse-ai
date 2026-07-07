import React from "react";
import { Users } from "lucide-react";
import { ZoneRisk } from "../types";

interface StaffVolunteerDispatchProps {
  zones: ZoneRisk[];
  volunteerStaffCounts: Record<string, number>;
  onDispatchVolunteer: (zoneId: string) => void;
}

export default function StaffVolunteerDispatch({
  zones,
  volunteerStaffCounts,
  onDispatchVolunteer,
}: StaffVolunteerDispatchProps) {
  return (
    <div
      className="bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-sm space-y-4"
      id="staff-volunteer-dispatch-center"
    >
      <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
        <h3 className="font-display font-bold text-neutral-900 text-base flex items-center gap-2">
          <Users className="h-4.5 w-4.5 text-teal-600 animate-pulse" />
          Staff & Volunteer Dispatch Grid
        </h3>
        <span className="text-[10px] bg-teal-50 text-teal-800 border border-teal-200 font-bold px-2 py-0.5 rounded-md font-mono uppercase">
          Active Coordination
        </span>
      </div>

      <div className="p-3.5 bg-teal-50/50 border border-teal-100 rounded-xl text-xs space-y-1">
        <span className="font-bold text-teal-950 block">
          Persona Support: Venue Staff & Volunteers
        </span>
        <p className="text-neutral-600 text-[11px] leading-relaxed">
          Coordinate and deploy MetLife Stadium tournament volunteers to
          high-density gates and concourses to help guide spectators
          safely.
        </p>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-neutral-400 uppercase tracking-wider pb-1">
          <span>Stadium Location Zone</span>
          <span className="text-right">Deployed Staff / Action</span>
        </div>

        {zones.map((zone) => {
          const staffCount = volunteerStaffCounts[zone.zoneId] || 0;
          const isHighRisk = zone.riskLevel === "high";

          return (
            <div
              key={zone.zoneId}
              className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                isHighRisk
                  ? "bg-rose-50/50 border-rose-200"
                  : "bg-neutral-50/50 border-neutral-200/50"
              }`}
            >
              <div className="flex flex-col">
                <span className="font-bold text-neutral-900">
                  {zone.name}
                </span>
                <span className="text-[10.5px] text-neutral-400 uppercase tracking-wide font-semibold">
                  {zone.type} · Risk:{" "}
                  <strong
                    className={
                      isHighRisk ? "text-rose-600" : "text-neutral-500"
                    }
                  >
                    {zone.riskLevel}
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="text-right">
                  <span className="font-mono font-bold text-neutral-900 bg-neutral-100/80 px-2 py-1 rounded border border-neutral-200/50">
                    {staffCount} staff
                  </span>
                </div>
                <button
                  onClick={() => onDispatchVolunteer(zone.zoneId)}
                  className={`text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                    isHighRisk
                      ? "bg-rose-600 hover:bg-rose-700 text-white border-rose-600 shadow-xs"
                      : "bg-white hover:bg-neutral-100 text-teal-800 border-neutral-300 shadow-xs"
                  }`}
                  title={`Deploy additional volunteer staff to ${zone.name}`}
                >
                  Deploy +2
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

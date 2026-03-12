import React, { useEffect, useState, useMemo } from "react";
import { Calendar } from "./components/Calendar";
import { FloorPicker } from "./components/FloorPicker";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

declare global {
  interface ImportMeta {
    readonly env: { VITE_API_URL: string };
  }
}

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

const buildingMap: Record<string, string> = {
  StudentLearningCenter: "Student Learning Center",
  EngineeringBuilding: "Engineering Building",
  TedRogersSchoolofManagement: "Ted Rogers School of Management",
  Library: "Library",
};
const buildings = Object.keys(buildingMap);

type Page = "seats" | "suggested" | "wellness" | "history";

const ALL_WELLNESS_TIPS = [
  { title: "Use the Pomodoro Technique", body: "Study for 25 minutes, then take a 5-minute break. After 4 cycles take a longer 15-30 min break. This keeps focus sharp and prevents burnout." },
  { title: "Stay Hydrated", body: "Keep a water bottle at your desk. Dehydration reduces concentration by up to 20%. Aim for 8 cups a day, especially during exam season." },
  { title: "Move Between Sessions", body: "A short walk between study blocks improves memory consolidation and reduces physical tension from sitting. Even 5 minutes around the floor helps." },
  { title: "Find a Quieter Floor", body: "Higher floors of the SLC tend to be quieter. If you are easily distracted, filter for upper floors using the Available Seats page." },
  { title: "Use White Noise or Ambient Sound", body: "Busy campus environments can be distracting. Brown or white noise helps mask background chatter. Apps like Noisli or a YouTube ambient stream work well." },
  { title: "Prioritise Sleep Over All-Nighters", body: "Sleep is when your brain consolidates what you studied. A 7-8 hour night before an exam outperforms cramming through the night every time." },
  { title: "Eat Before Long Study Sessions", body: "Your brain uses around 20% of your body's energy. Do not study on an empty stomach. Bring a snack like nuts, fruit, or a granola bar." },
  { title: "Set a Phone-Free Block", body: "Put your phone face-down or in a bag during your focus block. Apps like Forest or iOS Focus Mode can help if you struggle with the habit." },
  { title: "Book Group Rooms Early", body: "Group study rooms fill up fast between 11 AM and 3 PM. Use the Suggested Rooms page to find a room with enough capacity for your group." },
  { title: "Do Not Skip Breaks", body: "Pushing through for 3 or more hours straight leads to diminishing returns. Scheduled breaks are not wasted time — they are part of effective studying." },
  { title: "Review Notes Within 24 Hours", body: "The forgetting curve drops steeply in the first day after learning. Even a 10-minute review the same evening dramatically improves long-term retention." },
  { title: "Use Active Recall, Not Re-reading", body: "Closing your notes and recalling key points from memory is far more effective than re-reading. Flashcard apps like Anki are great for this." },
  { title: "Change Your Study Space Occasionally", body: "Studying the same material in different locations has been shown to improve recall. Try a different floor or building for variety." },
  { title: "Manage Exam Anxiety", body: "Light exercise, deep breathing, or a 10-minute walk before an exam can lower cortisol and improve performance. TMU also offers free counselling through Student Wellbeing." },
  { title: "Track Your Energy, Not Just Your Time", body: "Schedule your hardest tasks during your peak energy hours. Most people are sharpest in the mid-morning. Save lighter tasks for lower-energy periods." },
  { title: "Avoid Multitasking", body: "Switching between tasks reduces efficiency by up to 40%. Focus on one subject per session before moving to the next." },
  { title: "Teach What You Learn", body: "Explaining a concept to someone else — or even out loud to yourself — forces you to identify gaps in your understanding that passive studying misses." },
  { title: "Keep Your Study Space Tidy", body: "A cluttered desk creates visual noise that competes for your attention. Clear your immediate workspace before starting even if the rest of the room is messy." },
  { title: "Set a Finish Time, Not Just a Start Time", body: "Knowing your session ends at a specific time creates urgency that improves focus. Open-ended sessions tend to expand into unproductive stretches." },
  { title: "Get Natural Light When Possible", body: "Natural light improves alertness and mood. When choosing a study spot, prefer seats near windows or well-lit areas over dim corners." },
];

const TIPS_PER_PAGE = 12;

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const formatDuration = (hours: number) => {
  if (!hours || hours === 0) return "—";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const labelStyle: React.CSSProperties = { fontWeight: 600, display: "block", marginBottom: "8px", whiteSpace: "nowrap", fontSize: "14px" };
const filterWrap: React.CSSProperties = { display: "flex", flexDirection: "column" };
const inputStyle: React.CSSProperties = { padding: "10px 14px", borderRadius: "10px", border: "1px solid #ccc", background: "white", whiteSpace: "nowrap", cursor: "pointer", fontSize: "14px" };

export default function App() {
  const [page, setPage] = useState<Page>("seats");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState<string>(buildings[0]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "AVAILABLE" | "UNAVAILABLE">("ALL");
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [showFloorPickerSeats, setShowFloorPickerSeats] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string>("09:00");
  const [selectedCapacity, setSelectedCapacity] = useState<string>("ALL");
  const [minCapacity, setMinCapacity] = useState<number>(1);
  const [suggestedFloor, setSuggestedFloor] = useState<number | null>(null);
  const [showFloorPickerSuggested, setShowFloorPickerSuggested] = useState(false);
  const [suggestedTime, setSuggestedTime] = useState<string>("09:00");
  const [roomInsights, setRoomInsights] = useState<Record<string, { label: string; color: string; pct: number | null; samples?: number }>>({});
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [wellnessTips, setWellnessTips] = useState(() => shuffleArray(ALL_WELLNESS_TIPS).slice(0, TIPS_PER_PAGE));

  const [historyData, setHistoryData] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyBuilding, setHistoryBuilding] = useState<string>("ALL");
  const [historyEndDate, setHistoryEndDate] = useState<Date>(new Date());
  const [showHistoryCalendar, setShowHistoryCalendar] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/trends/date-range`)
      .then((r) => r.json())
      .then((json) => {
        if (json.latest) {
          const d = new Date(json.latest + "T12:00:00");
          if (!isNaN(d.getTime())) setHistoryEndDate(d);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (page === "wellness") setWellnessTips(shuffleArray(ALL_WELLNESS_TIPS).slice(0, TIPS_PER_PAGE));
  }, [page]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const dateStr = selectedDate.toISOString().split("T")[0];
      const params = new URLSearchParams();
      params.append("date", dateStr);
      params.append("time", selectedTime);
      if (selectedFloor) params.append("floor", `F${selectedFloor}`);
      const res = await fetch(`${API_URL}/availability/${building}?${params.toString()}`);
      const json = await res.json();
      setData(Array.isArray(json) ? json : []);
    } catch (err) {
      console.error("Fetch error:", err);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [building, selectedDate, selectedTime, selectedFloor]);

  const fetchHistory = async (bldg: string, endDate: Date) => {
    try {
      setHistoryLoading(true);
      const endStr = endDate.toISOString().split("T")[0];
      const params = new URLSearchParams();
      params.append("end_date", endStr);
      if (bldg !== "ALL") params.append("building", bldg);
      const res = await fetch(`${API_URL}/trends?${params.toString()}`);
      const json = await res.json();
      setHistoryData(Array.isArray(json) ? json : []);
    } catch {
      setHistoryData([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (page === "history") fetchHistory(historyBuilding, historyEndDate);
  }, [page, historyBuilding, historyEndDate]);

  const availableFloors = Array.from(new Set(data.map((row) => parseInt(row.floor_id?.replace("F", "") || "0")).filter((n) => !isNaN(n) && n > 0))).sort((a, b) => a - b);
  const availableCapacities = Array.from(new Set(data.map((row) => Number(row.capacity)))).sort((a, b) => a - b);

  const filteredSeats = data.filter((row) => {
    if (filter === "AVAILABLE" && row.occupied !== 0) return false;
    if (filter === "UNAVAILABLE" && row.occupied !== 1) return false;
    if (selectedCapacity !== "ALL" && row.capacity !== Number(selectedCapacity)) return false;
    return true;
  });

  const suggestedRooms = useMemo(() => {
    const roomMap: Record<string, any> = {};
    for (const row of data) {
      const id = row.room_id;
      if (!id) continue;
      if (!roomMap[id] || row.timestamp_iso > roomMap[id].timestamp_iso) roomMap[id] = row;
    }
    return Object.values(roomMap).filter((row) => {
      if (row.occupied !== 0) return false;
      if ((row.capacity || 0) < minCapacity) return false;
      if (suggestedFloor) { const f = parseInt(row.floor_id?.replace("F", "") || "0"); if (f !== suggestedFloor) return false; }
      return true;
    }).sort((a, b) => (b.capacity || 0) - (a.capacity || 0));
  }, [data, minCapacity, suggestedFloor]);

  const suggestedRoomKey = suggestedRooms.map((r: any) => r.room_id).join(",");
  useEffect(() => {
    if (page !== "suggested" || !suggestedRoomKey) return;
    const hour = parseInt(suggestedTime.split(":")[0], 10);
    const day = selectedDate.getDay() === 0 ? 6 : selectedDate.getDay() - 1;
    setInsightsLoading(true);
    fetch(`${API_URL}/room-insights/${building}?hour=${hour}&day=${day}&rooms=${encodeURIComponent(suggestedRoomKey)}`)
      .then((r) => r.json())
      .then((json) => setRoomInsights(typeof json === "object" ? json : {}))
      .catch(() => setRoomInsights({}))
      .finally(() => setInsightsLoading(false));
  }, [page, building, suggestedTime, selectedDate, suggestedRoomKey]);

  // Updated NavItem helper for Header
  const NavItem = ({ p, label }: { p: Page; label: string }) => (
    <button onClick={() => setPage(p)} style={{ 
      background: page === p ? "#374151" : "transparent", 
      border: page === p ? "1px solid #4B5563" : "1px solid transparent",
      color: "white", padding: "8px 16px", borderRadius: "20px", cursor: "pointer", fontSize: "13px", fontWeight: 500, transition: "0.2s" 
    }}>
      {label}
    </button>
  );

  const SeatsPage = () => (
    <div>
      <h1 style={{ marginBottom: "24px" }}>Available Seats</h1>
      <div style={{ display: "flex", gap: "16px", marginBottom: "24px", alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={filterWrap}>
          <label style={labelStyle}>Building</label>
          <select value={building} onChange={(e) => { setSelectedFloor(null); setSelectedCapacity("ALL"); setBuilding(e.target.value); }} style={inputStyle}>
            {buildings.map((b) => <option key={b} value={b}>{buildingMap[b]}</option>)}
          </select>
        </div>
        <div style={{ ...filterWrap, position: "relative" }}>
          <label style={labelStyle}>Date</label>
          <button onClick={() => { setShowCalendar(!showCalendar); setShowFloorPickerSeats(false); }} style={inputStyle}>{selectedDate.toDateString()}</button>
          {showCalendar && (<div style={{ position: "absolute", top: "100%", zIndex: 100 }}><Calendar selectedDate={selectedDate} onSelectDate={(d) => { setSelectedDate(d); setShowCalendar(false); }} onClose={() => setShowCalendar(false)} /></div>)}
        </div>
        <div style={filterWrap}>
          <label style={labelStyle}>Time</label>
          <select value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} style={inputStyle}>
            {Array.from({ length: 16 }, (_, i) => { const hour = 9 + Math.floor(i / 2); const minute = i % 2 === 0 ? "00" : "30"; const time = `${hour.toString().padStart(2, "0")}:${minute}`; return <option key={time} value={time}>{time}</option>; })}
          </select>
        </div>
        <div style={{ ...filterWrap, position: "relative", minWidth: "140px" }}>
          <label style={labelStyle}>Floor</label>
          <button onClick={() => { setShowFloorPickerSeats(!showFloorPickerSeats); setShowCalendar(false); }} style={inputStyle}>{selectedFloor ? `Floor ${selectedFloor}` : "All Floors"}</button>
          {showFloorPickerSeats && (<FloorPicker selectedFloor={selectedFloor || 0} onSelectFloor={(n) => { setSelectedFloor(n === 0 ? null : n); setShowFloorPickerSeats(false); }} onClose={() => setShowFloorPickerSeats(false)} availableFloors={availableFloors} />)}
        </div>
        <div style={filterWrap}>
          <label style={labelStyle}>Capacity</label>
          <select value={selectedCapacity} onChange={(e) => setSelectedCapacity(e.target.value)} style={inputStyle}>
            <option value="ALL">All Capacities</option>
            {availableCapacities.map((cap) => <option key={cap} value={cap}>{cap} Seats</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: "24px", display: "flex", gap: "10px" }}>
        {(["ALL", "AVAILABLE", "UNAVAILABLE"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "10px 20px", borderRadius: "20px", border: "1px solid #ccc", fontWeight: 600, cursor: "pointer", background: filter === f ? (f === "AVAILABLE" ? "#16A34A" : f === "UNAVAILABLE" ? "#B91C1C" : "#2563EB") : "white", color: filter === f ? "white" : "black" }}>
            {f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      {loading ? <p>Loading results...</p> : filteredSeats.length === 0 ? <p style={{ color: "#6B7280" }}>No room data found for this selection.</p> : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {filteredSeats.map((row, i) => {
            const ts = new Date(row.timestamp_iso);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px", background: "white", borderRadius: "12px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Room {row.room_id} — Floor {row.floor_id}</div>
                  <div style={{ fontSize: "14px", color: "#6B7280" }}>{ts.toLocaleDateString()} {ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} | Duration: {formatDuration(row.booking_duration)} | Capacity: {row.capacity} | Occupied: {row.occupied === 1 ? "Yes" : "No"}</div>
                </div>
                <div style={{ width: "24px", height: "24px", borderRadius: "50%", backgroundColor: row.occupied === 0 ? "#16A34A" : "#B91C1C", flexShrink: 0, marginLeft: "16px" }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const SuggestedPage = () => (
    <div>
      <h1 style={{ marginBottom: "8px" }}>Suggested Rooms</h1>
      <p style={{ color: "#6B7280", marginBottom: "24px" }}>Rooms that are currently free, sorted by capacity.</p>
      <div style={{ display: "flex", gap: "16px", marginBottom: "30px", alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={filterWrap}>
          <label style={labelStyle}>Building</label>
          <select value={building} onChange={(e) => { setSuggestedFloor(null); setBuilding(e.target.value); }} style={inputStyle}>
            {buildings.map((b) => <option key={b} value={b}>{buildingMap[b]}</option>)}
          </select>
        </div>
        <div style={{ ...filterWrap, position: "relative" }}>
          <label style={labelStyle}>Date</label>
          <button onClick={() => { setShowCalendar(!showCalendar); setShowFloorPickerSuggested(false); }} style={inputStyle}>{selectedDate.toDateString()}</button>
          {showCalendar && (<div style={{ position: "absolute", top: "100%", zIndex: 100 }}><Calendar selectedDate={selectedDate} onSelectDate={(d) => { setSelectedDate(d); setShowCalendar(false); }} onClose={() => setShowCalendar(false)} /></div>)}
        </div>
        <div style={filterWrap}>
          <label style={labelStyle}>Time</label>
          <select value={suggestedTime} onChange={(e) => setSuggestedTime(e.target.value)} style={inputStyle}>
            {Array.from({ length: 29 }, (_, i) => {
              const totalMins = 7 * 60 + i * 30;
              const h = Math.floor(totalMins / 60).toString().padStart(2, "0");
              const m = (totalMins % 60).toString().padStart(2, "0");
              return `${h}:${m}`;
            }).map((t) => (
              <option key={t} value={t}>{(() => {
                const [h, m] = t.split(":").map(Number);
                const ampm = h < 12 ? "AM" : "PM";
                const h12 = h % 12 || 12;
                return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
              })()}</option>
            ))}
          </select>
        </div>
        <div style={filterWrap}>
          <label style={labelStyle}>Min. Capacity</label>
          <select value={minCapacity} onChange={(e) => setMinCapacity(Number(e.target.value))} style={inputStyle}>
            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}+ people</option>)}
          </select>
        </div>
        <div style={{ ...filterWrap, position: "relative", minWidth: "140px" }}>
          <label style={labelStyle}>Floor</label>
          <button onClick={() => { setShowFloorPickerSuggested(!showFloorPickerSuggested); setShowCalendar(false); }} style={inputStyle}>{suggestedFloor ? `Floor ${suggestedFloor}` : "All Floors"}</button>
          {showFloorPickerSuggested && (<FloorPicker selectedFloor={suggestedFloor || 0} onSelectFloor={(n) => { setSuggestedFloor(n === suggestedFloor ? null : n); setShowFloorPickerSuggested(false); }} onClose={() => setShowFloorPickerSuggested(false)} availableFloors={availableFloors} />)}
        </div>
      </div>
      {loading ? <p>Loading...</p> : suggestedRooms.length === 0 ? (
        <div style={{ padding: "40px", textAlign: "center", background: "white", borderRadius: "12px", color: "#6B7280" }}>No available rooms match your criteria.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
          {suggestedRooms.map((row: any, i: number) => {
            const insight = roomInsights[row.room_id];
            return (
              <div key={i} style={{ background: "white", borderRadius: "14px", padding: "20px", boxShadow: i === 0 ? "0 0 0 2px #16A34A, 0 4px 12px rgba(0,0,0,0.08)" : "0 2px 6px rgba(0,0,0,0.06)", position: "relative", display: "flex", flexDirection: "column" }}>
                {i === 0 && <div style={{ position: "absolute", top: "14px", right: "14px", background: "#DCFCE7", color: "#15803D", fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "6px" }}>Best Match</div>}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                  <div style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "#16A34A" }} />
                  <span style={{ fontWeight: 700, fontSize: "16px" }}>Room {row.room_id}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "14px", color: "#374151" }}>
                  <div><strong>Floor:</strong> {row.floor_id}</div>
                  <div><strong>Capacity:</strong> {row.capacity} people</div>
                  {row.booking_duration > 0 && <div><strong>Typical booking:</strong> {formatDuration(row.booking_duration)}</div>}
                </div>
                {insightsLoading ? (
                  <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "14px", height: "14px", borderRadius: "50%", background: "#E5E7EB", animation: "pulse 1.2s ease-in-out infinite" }} />
                    <div style={{ height: "12px", width: "160px", borderRadius: "6px", background: "#E5E7EB", animation: "pulse 1.2s ease-in-out infinite" }} />
                  </div>
                ) : insight ? (
                  <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: insight.color || "#6B7280", fontWeight: 600 }}>
                    <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: `radial-gradient(circle, ${insight.color} 0%, transparent 70%)`, animation: "pulse 2s infinite" }} />
                    <span style={{ fontSize: "14px" }}>
                      {insight.color === "#15803D" ? "🟢" : insight.color === "#65A30D" ? "🟡" : insight.color === "#D97706" ? "🟠" : insight.color === "#DC2626" ? "🔴" : "⚪"}
                    </span>
                    {insight.label}
                    {insight.pct !== null && insight.pct !== undefined && (
                      <span style={{ color: "#9CA3AF", fontWeight: 400 }}>({insight.pct}%)</span>
                    )}
                  </div>
                ) : null}
                <div style={{ marginTop: "14px", background: "#F0FDF4", color: "#15803D", fontWeight: 600, fontSize: "13px", padding: "6px 12px", borderRadius: "8px", textAlign: "center" }}>Available</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const WellnessPage = () => (
    <div>
      <h1 style={{ marginBottom: "8px" }}>Study Wellness Tips</h1>
      <p style={{ color: "#6B7280", marginBottom: "6px" }}>Finding a seat is only half the battle.</p>
      <p style={{ color: "#9CA3AF", fontSize: "13px", marginBottom: "28px" }}>Navigate away and come back for a fresh set of tips.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
        {wellnessTips.map((tip, i) => (
          <div key={i} style={{ background: "white", borderRadius: "14px", padding: "22px", boxShadow: "0 2px 6px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ fontWeight: 700, fontSize: "15px", color: "#111827" }}>{tip.title}</div>
            <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: "1.6" }}>{tip.body}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const HistoryPage = () => {
    const shortMonth = (m: string) => { const [y, mo] = m.split("-"); const d = new Date(parseInt(y), parseInt(mo) - 1, 1); return d.toLocaleDateString("en-CA", { month: "short" }) + " '" + y.slice(2); };
    const fmtMonth = (m: string) => { const [y, mo] = m.split("-"); const d = new Date(parseInt(y), parseInt(mo) - 1, 1); return d.toLocaleDateString("en-CA", { month: "long", year: "numeric" }); };
    const fmtDur = (h: number | null) => { if (h == null) return "—"; const mins = Math.round(h * 60); const hh = Math.floor(mins / 60); const mm = mins % 60; return hh > 0 ? `${hh}h ${mm}m` : `${mm}m`; };
    const startDate = new Date(historyEndDate);
    startDate.setDate(startDate.getDate() - 90);
    const totalRecords = historyData.reduce((s, r) => s + (r.total_records || 0), 0);
    const avgOcc = historyData.length ? historyData.reduce((s, r) => s + (r.avg_occupancy ?? 0), 0) / historyData.length : 0;
    const peak = [...historyData].sort((a, b) => (b.avg_occupancy ?? 0) - (a.avg_occupancy ?? 0))[0];

    return (
      <div style={{ maxWidth: "960px" }}>
        <h1 style={{ marginBottom: "4px" }}>Historical Logs</h1>
        <p style={{ color: "#6B7280", marginTop: 0, marginBottom: "24px", fontSize: "14px" }}>
          Showing 3 months of data: {startDate.toLocaleDateString("en-CA", { month: "short", year: "numeric" })} → {historyEndDate.toLocaleDateString("en-CA", { month: "short", year: "numeric" })}
        </p>
        <div style={{ display: "flex", gap: "16px", marginBottom: "24px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={filterWrap}>
            <label style={labelStyle}>Building</label>
            <select value={historyBuilding} onChange={(e) => setHistoryBuilding(e.target.value)} style={inputStyle}>
              <option value="ALL">All Buildings</option>
              {buildings.map((b) => (<option key={b} value={b}>{buildingMap[b]}</option>))}
            </select>
          </div>
          <div style={{ ...filterWrap, position: "relative" }}>
            <label style={labelStyle}>End Date</label>
            <button onClick={() => setShowHistoryCalendar(!showHistoryCalendar)} style={inputStyle}>{historyEndDate.toDateString()}</button>
            {showHistoryCalendar && (
              <div style={{ position: "absolute", top: "100%", zIndex: 100 }}>
                <Calendar selectedDate={historyEndDate} onSelectDate={(d: any) => { setHistoryEndDate(d); setShowHistoryCalendar(false); }} onClose={() => setShowHistoryCalendar(false)} />
              </div>
            )}
          </div>
        </div>
        {historyLoading ? <p>Loading history...</p> : historyData.length === 0 ? (
          <div style={{ background: "white", borderRadius: "12px", padding: "48px", textAlign: "center", color: "#9CA3AF" }}>No data found for this selection.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "24px" }}>
              {[
                { label: "Months Tracked", value: historyData.length.toString(), color: "#3B82F6" },
                { label: "Total Records", value: totalRecords.toLocaleString(), color: "#8B5CF6" },
                { label: "Avg Occupancy", value: `${Math.round(avgOcc * 100)}%`, color: "#F59E0B" },
                { label: "Peak Month", value: peak ? fmtMonth(peak.month) : "—", color: "#EF4444" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: "white", borderRadius: "12px", padding: "18px 22px", borderLeft: `4px solid ${color}`, flex: 1, minWidth: "140px", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
                  <div style={{ fontSize: "11px", color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                  <div style={{ fontSize: "24px", fontWeight: 800, color: "#111827", marginTop: "6px" }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ background: "white", borderRadius: "14px", padding: "24px", marginBottom: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
              <h2 style={{ margin: "0 0 16px", fontSize: "15px", fontWeight: 700 }}>Monthly Avg Occupancy Rate</h2>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={historyData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="histOccGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="month" tickFormatter={shortMonth} tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} domain={[0, 1]} tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip formatter={(v: any) => [`${Math.round(v * 100)}%`, "Avg Occupancy"]} labelFormatter={(l: any) => fmtMonth(l)} contentStyle={{ borderRadius: "8px", fontSize: "13px" }} />
                  <Area type="monotone" dataKey="avg_occupancy" stroke="#3B82F6" strokeWidth={2.5} fill="url(#histOccGrad)" dot={false} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: "white", borderRadius: "14px", padding: "24px", marginBottom: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
              <h2 style={{ margin: "0 0 16px", fontSize: "15px", fontWeight: 700 }}>Monthly Record Volume</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={historyData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={shortMonth} tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip formatter={(v: any) => [v.toLocaleString(), "Records"]} labelFormatter={(l: any) => fmtMonth(l)} contentStyle={{ borderRadius: "8px", fontSize: "13px" }} />
                  <Bar dataKey="total_records" fill="#8B5CF6" radius={[4, 4, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: "white", borderRadius: "14px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.07)", overflowX: "auto" }}>
              <h2 style={{ margin: "0 0 16px", fontSize: "15px", fontWeight: 700 }}>Monthly Breakdown</h2>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #F3F4F6" }}>
                    {["Month", "Avg Occupancy", "Records", "Avg Duration"].map((h) => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#6B7280", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...historyData].reverse().map((row, i) => (
                    <tr key={row.month} style={{ borderBottom: "1px solid #F9FAFB", background: i % 2 === 0 ? "white" : "#FAFAFA" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>{fmtMonth(row.month)}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{ width: "72px", height: "6px", background: "#E5E7EB", borderRadius: "3px", overflow: "hidden" }}>
                            <div style={{ width: `${Math.round((row.avg_occupancy ?? 0) * 100)}%`, height: "100%", borderRadius: "3px", background: (row.avg_occupancy ?? 0) > 0.75 ? "#EF4444" : (row.avg_occupancy ?? 0) > 0.4 ? "#F59E0B" : "#10B981" }} />
                          </div>
                          <span>{Math.round((row.avg_occupancy ?? 0) * 100)}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#374151" }}>{row.total_records?.toLocaleString()}</td>
                      <td style={{ padding: "10px 12px", color: "#374151" }}>{fmtDur(row.avg_duration_h)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", fontFamily: "Arial", minHeight: "100vh", background: "#F3F4F6" }}>
      <style>{`@keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.5; } }`}</style>
      
      {/* --- HORIZONTAL NAVIGATION HEADER --- */}
      <header style={{ 
        width: "100%", 
        padding: "15px 40px", 
        background: "#111827", 
        color: "white", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 1000,
        boxShadow: "0 2px 10px rgba(0,0,0,0.2)"
      }}>
        
        {/* Branding (Left) */}
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: "20px", margin: 0, fontWeight: 800, letterSpacing: "0.5px" }}>TMU Seats</h2>
        </div>

        {/* Navigation Links (Middle - Side by Side) */}
        <nav style={{ display: "flex", gap: "10px", flex: 2, justifyContent: "center" }}>
          <NavItem p="seats"     label="Available Seats" />
          <NavItem p="suggested" label="Suggested Rooms" />
          <NavItem p="wellness"  label="Wellness Tips" />
          <NavItem p="history"   label="Historical Logs" />
        </nav>

        {/* Right side status indicator */}
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
          <div style={{ padding: "8px 20px", background: "white", color: "#111827", borderRadius: "20px", fontSize: "12px", fontWeight: 700 }}>Live Data</div>
        </div>
      </header>

      {/* --- MAIN CONTENT AREA --- */}
      <main style={{ flex: 1, padding: "40px", maxWidth: "1200px", margin: "0 auto", width: "100%" }}>
        {page === "seats"     && <SeatsPage />}
        {page === "suggested" && <SuggestedPage />}
        {page === "wellness"  && <WellnessPage />}
        {page === "history"   && <HistoryPage />}
      </main>

    </div>
  );
}
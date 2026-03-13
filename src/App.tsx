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

type Page = "seats" | "suggested" | "wellness" | "history" | "maps";

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

const ERGONOMIC_EXERCISES = [
  "Neck Tilts: Gently tilt your head toward each shoulder for 10 seconds.",
  "Chin Tucks: Pull your chin straight back to stretch the back of your neck.",
  "Shoulder Rolls: Roll your shoulders backward in a circular motion 10 times.",
  "Wrist Flexion: Gently pull your hand down at the wrist and hold for 15 seconds.",
  "Wrist Extension: Gently pull your hand up at the wrist and hold for 15 seconds.",
  "Seated Spinal Twist: Twist your torso to the right, then left, using your chair for support.",
  "Chest Opener: Interlace fingers behind your back and lift your arms slightly.",
  "Ankle Circles: Rotate each ankle clockwise and counter-clockwise 10 times.",
  "Leg Extensions: Straighten one leg under your desk and hold for 5 seconds.",
  "Eye Palming: Rub hands together and cup them over closed eyes for 30 seconds.",
  "Standing Calf Stretch: Stand and push one heel into the floor with a straight leg.",
  "Overhead Reach: Reach both arms toward the ceiling and stretch upward.",
  "Forward Fold: Reach for your toes while seated to stretch your lower back.",
  "Ear-to-Shoulder: Stretch the side of your neck by dropping your ear toward your shoulder.",
  "Hand Squeezes: Make a tight fist, then splay your fingers wide.",
  "Upper Back Stretch: Push your arms forward and round your upper back.",
  "Cross-Body Arm Stretch: Pull one arm across your chest and hold.",
  "Desk Press: Push your palms down on the desk and straighten your arms.",
  "Tricep Stretch: Reach one arm overhead and drop your hand behind your neck.",
  "Glute Squeeze: Squeeze your glutes for 5 seconds while sitting, then release.",
  "Hip Marches: Lift each knee toward the ceiling while seated.",
  "Wall Sit: If near a wall, hold a seated position against it for 20 seconds.",
  "Finger Fans: Spread your fingers as wide as possible, then relax.",
  "Shoulder Shrugs: Lift shoulders to ears, hold, then drop them completely.",
  "Looking Far: Look at an object 20 feet away for 20 seconds to reduce eye strain.",
  "Abdominal Bracing: Tighten your core muscles for 10 seconds while breathing.",
  "Knee-to-Chest: Pull one knee toward your chest while seated.",
  "Side Bends: Reach one arm over your head and lean to the opposite side.",
  "Thumb Stretch: Pull your thumb gently away from your palm.",
  "Nose Circles: Draw small circles in the air with your nose.",
  "Heel-Toe Raises: Alternate lifting your heels and toes off the floor.",
  "Desk Pushups: Do 5 incline pushups using the edge of your desk.",
  "Quad Stretch: Stand on one leg and pull your other heel toward your glutes.",
  "Forearm Massage: Use one hand to massage the muscles of your opposite forearm.",
  "Deep Belly Breaths: Take 3 slow breaths that expand your stomach.",
  "Scapular Squeezes: Pull your shoulder blades together as if holding a pencil.",
  "Palm Press: Press palms together in front of your chest like a prayer.",
  "Wrist Rotations: Make loose fists and rotate your wrists slowly.",
  "Lower Back Extension: Place hands on hips and lean back slightly while standing.",
  "Walking Minute: Walk to a nearby water fountain and back."
];

const BUILDING_FLOOR_MAPS: Record<string, number[]> = {
  StudentLearningCenter: [5, 7, 8],
  TedRogersSchoolofManagement: [2, 3],
  Library: [5, 6, 7, 8, 9],
  EngineeringBuilding: [1, 2, 3, 4, 5, 6, 7]
};

const TIPS_PER_PAGE = 6;

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

const inputStyle: React.CSSProperties = { 
  padding: "10px 14px", 
  borderRadius: "10px", 
  border: "1px solid #ccc", 
  background: "white", 
  whiteSpace: "nowrap", 
  cursor: "pointer", 
  fontSize: "14px",
  minWidth: "150px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center"
};

const dropdownListStyle: React.CSSProperties = {
  position: "absolute",
  top: "105%",
  left: 0,
  width: "100%",
  maxHeight: "200px",
  overflowY: "auto",
  background: "white",
  border: "1px solid #ccc",
  borderRadius: "10px",
  zIndex: 1000,
  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
  padding: "5px 0"
};

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
  const [selectedCapacity, setSelectedCapacity] = useState<number>(1);
  const [minCapacity, setMinCapacity] = useState<number>(1);
  const [suggestedFloor, setSuggestedFloor] = useState<number | null>(null);
  const [showFloorPickerSuggested, setShowFloorPickerSuggested] = useState(false);
  
  const [suggestedTime] = useState<string>(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes() < 30 ? "00" : "30"}`;
  });

  const [roomInsights, setRoomInsights] = useState<Record<string, { label: string; color: string; pct: number | null; samples?: number }>>({});
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [wellnessTips, setWellnessTips] = useState(() => shuffleArray(ALL_WELLNESS_TIPS).slice(0, TIPS_PER_PAGE));

  const [currentExercise, setCurrentExercise] = useState("Ready for a stretch?");

  const [showBldgDropdown, setShowBldgDropdown] = useState(false);
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [showCapDropdown, setShowCapDropdown] = useState(false);
  const [showMinCapDropdown, setShowMinCapDropdown] = useState(false);

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
      const queryTime = page === "suggested" ? suggestedTime : selectedTime;
      params.append("time", queryTime);
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

  useEffect(() => { fetchData(); }, [building, selectedDate, selectedTime, selectedFloor, page, suggestedTime]);

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

  const filteredSeats = data.filter((row) => {
    if (filter === "AVAILABLE" && row.occupied !== 0) return false;
    if (filter === "UNAVAILABLE" && row.occupied !== 1) return false;
    if (row.capacity < selectedCapacity) return false;
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

  const rankedRooms = useMemo(() => {
    if (!suggestedRooms.length) return suggestedRooms;
    return [...suggestedRooms].sort((a, b) => {
      const ia = roomInsights[a.room_id];
      const ib = roomInsights[b.room_id];
      const vacA = ia?.pct != null ? 100 - ia.pct : null;
      const vacB = ib?.pct != null ? 100 - ib.pct : null;
      if (vacA !== null && vacB !== null) {
        if (vacA !== vacB) return vacB - vacA;
        return (b.capacity || 0) - (a.capacity || 0);
      }
      if (vacA !== null) return -1;
      if (vacB !== null) return 1;
      return (b.capacity || 0) - (a.capacity || 0);
    });
  }, [suggestedRooms, roomInsights]);

  const suggestedRoomKey = useMemo(() => suggestedRooms.map((r: any) => r.room_id).join(","), [suggestedRooms]);
  
  useEffect(() => {
    if (page !== "suggested" || !suggestedRoomKey) return;
    const hour = parseInt(suggestedTime.split(":")[0], 10);
    const day = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
    setInsightsLoading(true);
    fetch(`${API_URL}/room-insights/${building}?hour=${hour}&day=${day}&rooms=${encodeURIComponent(suggestedRoomKey)}`)
      .then((r) => r.json())
      .then((json) => setRoomInsights(typeof json === "object" ? json : {}))
      .catch(() => setRoomInsights({}))
      .finally(() => setInsightsLoading(false));
  }, [page, building, suggestedTime, suggestedRoomKey]);

  const NavItem = ({ p, label }: { p: Page; label: string }) => (
    <button 
      onClick={() => setPage(p)} 
      style={{ 
        background: page === p ? "#374151" : "transparent", 
        border: "1px solid",
        borderColor: page === p ? "#4B5563" : "transparent",
        color: "white", 
        padding: "10px 22px", 
        borderRadius: "25px", 
        cursor: "pointer", 
        fontSize: "14px", 
        fontWeight: 600, 
        transition: "background 0.2s ease, border-color 0.2s ease",
        whiteSpace: "nowrap"
      }}
    >
      {label}
    </button>
  );

  const SeatsPage = () => (
    <div>
      <h1 style={{ marginBottom: "24px" }}>Available Seats</h1>
      <div style={{ display: "flex", gap: "16px", marginBottom: "24px", alignItems: "flex-end", flexWrap: "wrap" }}>
        
        <div style={{ ...filterWrap, position: "relative" }}>
          <label style={labelStyle}>Building</label>
          <button onClick={() => setShowBldgDropdown(!showBldgDropdown)} style={inputStyle}>
            {buildingMap[building]} <span>▼</span>
          </button>
          {showBldgDropdown && (
            <div style={dropdownListStyle}>
              {buildings.map(b => (
                <div key={b} onClick={() => { setBuilding(b); setShowBldgDropdown(false); setSelectedFloor(null); }} style={{ padding: "10px", cursor: "pointer", fontSize: "14px" }}>{buildingMap[b]}</div>
              ))}
            </div>
          )}
        </div>

        <div style={{ ...filterWrap, position: "relative" }}>
          <label style={labelStyle}>Date</label>
          <button onClick={() => { setShowCalendar(!showCalendar); setShowFloorPickerSeats(false); }} style={inputStyle}>{selectedDate.toDateString()}</button>
          {showCalendar && (<div style={{ position: "absolute", top: "100%", zIndex: 100 }}><Calendar selectedDate={selectedDate} onSelectDate={(d: any) => { setSelectedDate(d); setShowCalendar(false); }} onClose={() => setShowCalendar(false)} /></div>)}
        </div>

        <div style={{ ...filterWrap, position: "relative" }}>
          <label style={labelStyle}>Time</label>
          <button onClick={() => setShowTimeDropdown(!showTimeDropdown)} style={inputStyle}>
            {selectedTime} <span>▼</span>
          </button>
          {showTimeDropdown && (
            <div style={dropdownListStyle}>
              {Array.from({ length: 48 }, (_, i) => {
                const h = Math.floor(i / 2);
                const m = i % 2 === 0 ? "00" : "30";
                const t = `${h.toString().padStart(2, "0")}:${m}`;
                return <div key={t} onClick={() => { setSelectedTime(t); setShowTimeDropdown(false); }} style={{ padding: "10px", cursor: "pointer", fontSize: "14px" }}>{t}</div>;
              })}
            </div>
          )}
        </div>

        <div style={{ ...filterWrap, position: "relative", minWidth: "140px" }}>
          <label style={labelStyle}>Floor</label>
          <button onClick={() => { setShowFloorPickerSeats(!showFloorPickerSeats); setShowCalendar(false); }} style={inputStyle}>{selectedFloor ? `Floor ${selectedFloor}` : "All Floors"}</button>
          {showFloorPickerSeats && (<FloorPicker selectedFloor={selectedFloor || 0} onSelectFloor={(n: any) => { setSelectedFloor(n === 0 ? null : n); setShowFloorPickerSeats(false); }} onClose={() => setShowFloorPickerSeats(false)} availableFloors={availableFloors} />)}
        </div>

        <div style={{ ...filterWrap, position: "relative" }}>
          <label style={labelStyle}>Capacity</label>
          <button onClick={() => setShowCapDropdown(!showCapDropdown)} style={inputStyle}>
            {selectedCapacity}+ Seats <span>▼</span>
          </button>
          {showCapDropdown && (
            <div style={dropdownListStyle}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(cap => (
                <div key={cap} onClick={() => { setSelectedCapacity(cap); setShowCapDropdown(false); }} style={{ padding: "10px", cursor: "pointer", fontSize: "14px" }}>{cap}+ Seats</div>
              ))}
            </div>
          )}
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
      <p style={{ color: "#6B7280", marginBottom: "24px" }}>Rooms currently free, ranked by vacancy likelihood.</p>
      <div style={{ display: "flex", gap: "16px", marginBottom: "30px", alignItems: "flex-end", flexWrap: "wrap" }}>
        
        <div style={{ ...filterWrap, position: "relative" }}>
          <label style={labelStyle}>Building</label>
          <button onClick={() => setShowBldgDropdown(!showBldgDropdown)} style={inputStyle}>
            {buildingMap[building]} <span>▼</span>
          </button>
          {showBldgDropdown && (
            <div style={dropdownListStyle}>
              {buildings.map(b => (
                <div key={b} onClick={() => { setBuilding(b); setShowBldgDropdown(false); setSuggestedFloor(null); }} style={{ padding: "10px", cursor: "pointer", fontSize: "14px" }}>{buildingMap[b]}</div>
              ))}
            </div>
          )}
        </div>

        <div style={{ ...filterWrap, position: "relative" }}>
          <label style={labelStyle}>Min. Capacity</label>
          <button onClick={() => setShowMinCapDropdown(!showMinCapDropdown)} style={inputStyle}>
            {minCapacity}+ people <span>▼</span>
          </button>
          {showMinCapDropdown && (
            <div style={dropdownListStyle}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                <div key={n} onClick={() => { setMinCapacity(n); setShowMinCapDropdown(false); }} style={{ padding: "10px", cursor: "pointer", fontSize: "14px" }}>{n}+ people</div>
              ))}
            </div>
          )}
        </div>

        <div style={{ ...filterWrap, position: "relative", minWidth: "140px" }}>
          <label style={labelStyle}>Floor</label>
          <button onClick={() => { setShowFloorPickerSuggested(!showFloorPickerSuggested); setShowCalendar(false); }} style={inputStyle}>{suggestedFloor ? `Floor ${suggestedFloor}` : "All Floors"}</button>
          {showFloorPickerSuggested && (<FloorPicker selectedFloor={suggestedFloor || 0} onSelectFloor={(n) => { setSuggestedFloor(n === suggestedFloor ? null : n); setShowFloorPickerSuggested(false); }} onClose={() => setShowFloorPickerSuggested(false)} availableFloors={availableFloors} />)}
        </div>
      </div>
      {loading ? <p>Loading...</p> : rankedRooms.length === 0 ? (
        <div style={{ padding: "40px", textAlign: "center", background: "white", borderRadius: "12px", color: "#6B7280" }}>No available rooms match your criteria.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
          {rankedRooms.map((row: any, i: number) => {
            const insight = roomInsights[row.room_id];
            return (
              <div key={i} style={{ background: "white", borderRadius: "14px", padding: "24px", boxShadow: i === 0 ? "0 0 0 2px #16A34A, 0 4px 12px rgba(0,0,0,0.08)" : "0 2px 6px rgba(0,0,0,0.06)", position: "relative" }}>
                {i === 0 && <div style={{ position: "absolute", top: "14px", right: "14px", background: "#DCFCE7", color: "#15803D", fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "6px" }}>Best Match</div>}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                  <div style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "#16A34A" }} />
                  <span style={{ fontWeight: 700, fontSize: "18px" }}>Room {row.room_id}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "15px", color: "#374151" }}>
                  <div><strong>Floor:</strong> {row.floor_id}</div>
                  <div><strong>Capacity:</strong> {row.capacity} people</div>
                </div>
                {insight ? (
                  <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: insight.color || "#6B7280", fontWeight: 600 }}>
                    <span style={{ fontSize: "16px" }}>
                      {insight.color === "#15803D" ? "🟢" : insight.color === "#65A30D" ? "🟡" : insight.color === "#D97706" ? "🟠" : "🔴"}
                    </span>
                    {insight.label} ({insight.pct}%)
                  </div>
                ) : null}
                <div style={{ marginTop: "18px", background: "#F0FDF4", color: "#15803D", fontWeight: 700, fontSize: "13px", padding: "8px", borderRadius: "8px", textAlign: "center" }}>Available</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const InteractiveMapPage = () => {
    const floorList = BUILDING_FLOOR_MAPS[building] || [];
    const [currentMapFloor, setCurrentMapFloor] = useState<number>(floorList[0] || 0);
    const [showMapFloorDropdown, setShowMapFloorDropdown] = useState(false);

    useEffect(() => {
      if (!floorList.includes(currentMapFloor)) {
        setCurrentMapFloor(floorList[0] || 0);
      }
    }, [building, floorList, currentMapFloor]);

    const floorRooms = data.filter(row => parseInt(row.floor_id?.replace("F", "") || "0") === currentMapFloor);

    return (
      <div>
        <h1 style={{ marginBottom: "8px" }}>Interactive Floor Map</h1>
        <p style={{ color: "#6B7280", marginBottom: "24px" }}>Visual representation of room availability across campus.</p>
        
        <div style={{ display: "flex", gap: "16px", marginBottom: "30px", alignItems: "flex-end" }}>
          <div style={{ ...filterWrap, position: "relative" }}>
            <label style={labelStyle}>Building</label>
            <button onClick={() => setShowBldgDropdown(!showBldgDropdown)} style={inputStyle}>
              {buildingMap[building]} <span>▼</span>
            </button>
            {showBldgDropdown && (
              <div style={dropdownListStyle}>
                {buildings.map(b => (
                  <div key={b} onClick={() => { setBuilding(b); setShowBldgDropdown(false); }} style={{ padding: "10px", cursor: "pointer", fontSize: "14px" }}>{buildingMap[b]}</div>
                ))}
              </div>
            )}
          </div>

          <div style={{ ...filterWrap, position: "relative" }}>
            <label style={labelStyle}>Floor</label>
            <button onClick={() => setShowMapFloorDropdown(!showMapFloorDropdown)} style={inputStyle}>
              Floor {currentMapFloor} <span>▼</span>
            </button>
            {showMapFloorDropdown && (
              <div style={dropdownListStyle}>
                {floorList.map(f => (
                  <div key={f} onClick={() => { setCurrentMapFloor(f); setShowMapFloorDropdown(false); }} style={{ padding: "10px", cursor: "pointer", fontSize: "14px" }}>Floor {f}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ background: "white", padding: "40px", borderRadius: "14px", border: "1px solid #E5E7EB", display: "flex", gap: "40px" }}>
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "15px" }}>
            {floorRooms.length === 0 ? (
              <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#9CA3AF", padding: "20px" }}>No room data for this floor.</div>
            ) : (
              floorRooms.map(room => (
                <div key={room.room_id} style={{ 
                  background: room.occupied === 0 ? "#DCFCE7" : "#FEE2E2",
                  border: `2px solid ${room.occupied === 0 ? "#16A34A" : "#EF4444"}`,
                  borderRadius: "8px",
                  height: "80px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "0.2s"
                }}>
                  <div style={{ fontWeight: 800, color: room.occupied === 0 ? "#15803D" : "#B91C1C" }}>{room.room_id}</div>
                  <div style={{ fontSize: "11px", color: room.occupied === 0 ? "#16A34A" : "#EF4444" }}>{room.capacity} seats</div>
                </div>
              ))
            )}
          </div>
          
          <div style={{ width: "200px", background: "#F9FAFB", padding: "20px", borderRadius: "10px", height: "fit-content" }}>
            <h3 style={{ fontSize: "14px", marginBottom: "15px" }}>Map Legend</h3>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", fontSize: "13px" }}>
              <div style={{ width: "16px", height: "16px", background: "#DCFCE7", border: "2px solid #16A34A", borderRadius: "4px" }} /> Available
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
              <div style={{ width: "16px", height: "16px", background: "#FEE2E2", border: "2px solid #EF4444", borderRadius: "4px" }} /> Occupied
            </div>
          </div>
        </div>
      </div>
    );
  };

  const WellnessPage = () => (
    <div>
      <div style={{ marginBottom: "32px", padding: "20px", background: "white", borderRadius: "14px", boxShadow: "0 2px 6px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", gap: "16px", border: "1px solid #E5E7EB" }}>
        <div style={{ fontSize: "14px", color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Quick Study Stretch</div>
        <div style={{ fontSize: "18px", fontWeight: 700, color: "#111827", lineHeight: "1.4" }}>{currentExercise}</div>
        <button 
          onClick={() => {
            const rand = Math.floor(Math.random() * ERGONOMIC_EXERCISES.length);
            setCurrentExercise(ERGONOMIC_EXERCISES[rand]);
          }}
          style={{ 
            padding: "12px 24px", 
            background: "#111827", 
            color: "white", 
            border: "none", 
            borderRadius: "10px", 
            fontWeight: 700, 
            cursor: "pointer",
            width: "fit-content",
            transition: "0.2s"
          }}
          onMouseOver={(e) => e.currentTarget.style.background = "#374151"}
          onMouseOut={(e) => e.currentTarget.style.background = "#111827"}
        >
          Generate New Stretch
        </button>
      </div>

      <h1 style={{ marginBottom: "24px" }}>Study Wellness Tips</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
        {wellnessTips.map((tip, i) => (
          <div key={i} style={{ background: "white", borderRadius: "14px", padding: "26px", boxShadow: "0 2px 6px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontWeight: 700, fontSize: "16px", color: "#111827" }}>{tip.title}</div>
            <div style={{ fontSize: "14px", color: "#6B7280", lineHeight: "1.6" }}>{tip.body}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const HistoryPage = () => {
    const shortMonth = (m: string) => { const [y, mo] = m.split("-"); const d = new Date(parseInt(y), parseInt(mo) - 1, 1); return d.toLocaleDateString("en-CA", { month: "short" }) + " '" + y.slice(2); };
    const fmtMonth = (m: string) => { const [y, mo] = m.split("-"); const d = new Date(parseInt(y), parseInt(mo) - 1, 1); return d.toLocaleDateString("en-CA", { month: "long", year: "numeric" }); };
    const fmtDur = (h: number | null) => { if (h == null) return "—"; const mins = Math.round(h * 60); const hh = Math.floor(mins / 60); const mm = mins % 60; return hh > 0 ? `${hh}h ${mm}m` : `${mm}m`; };

    const totalRecords = historyData.reduce((s, r) => s + (r.total_records || 0), 0);
    const avgOcc = historyData.length ? historyData.reduce((s, r) => s + (r.avg_occupancy ?? 0), 0) / historyData.length : 0;
    const peak = [...historyData].sort((a, b) => (b.avg_occupancy ?? 0) - (a.avg_occupancy ?? 0))[0];

    return (
      <div style={{ maxWidth: "1100px" }}>
        <h1 style={{ marginBottom: "24px" }}>Historical Logs</h1>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "30px" }}>
          {[
            { label: "Months Tracked", value: historyData.length.toString(), color: "#3B82F6" },
            { label: "Total Records", value: totalRecords.toLocaleString(), color: "#8B5CF6" },
            { label: "Avg Occupancy", value: `${Math.round(avgOcc * 100)}%`, color: "#F59E0B" },
            { label: "Peak Month", value: peak ? fmtMonth(peak.month) : "—", color: "#EF4444" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "white", borderRadius: "12px", padding: "22px", borderLeft: `5px solid ${color}`, flex: 1, minWidth: "180px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize: "12px", color: "#6B7280", fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
              <div style={{ fontSize: "28px", fontWeight: 900, marginTop: "8px" }}>{value}</div>
            </div>
          ))}
        </div>
        
        <div style={{ background: "white", borderRadius: "14px", padding: "30px", marginBottom: "30px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "20px" }}>Monthly Avg Occupancy Rate</h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={historyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tickFormatter={shortMonth} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} axisLine={false} tickLine={false} />
              <Tooltip />
              <Area type="monotone" dataKey="avg_occupancy" stroke="#3B82F6" strokeWidth={3} fill="#3B82F6" fillOpacity={0.1} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: "white", borderRadius: "14px", padding: "30px", marginBottom: "30px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "20px" }}>Monthly Record Volume</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={historyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tickFormatter={shortMonth} axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="total_records" fill="#8B5CF6" radius={[6, 6, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: "white", borderRadius: "14px", padding: "30px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "20px" }}>Monthly Breakdown</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #F3F4F6", textAlign: "left" }}>
                <th style={{ padding: "12px", color: "#6B7280", fontSize: "12px", fontWeight: 700, textTransform: "uppercase" }}>Month</th>
                <th style={{ padding: "12px", color: "#6B7280", fontSize: "12px", fontWeight: 700, textTransform: "uppercase" }}>Avg Occupancy</th>
                <th style={{ padding: "12px", color: "#6B7280", fontSize: "12px", fontWeight: 700, textTransform: "uppercase" }}>Records</th>
                <th style={{ padding: "12px", color: "#6B7280", fontSize: "12px", fontWeight: 700, textTransform: "uppercase" }}>Avg Duration</th>
              </tr>
            </thead>
            <tbody>
              {[...historyData].reverse().map((row) => (
                <tr key={row.month} style={{ borderBottom: "1px solid #F9FAFB" }}>
                  <td style={{ padding: "12px", fontWeight: 600 }}>{fmtMonth(row.month)}</td>
                  <td style={{ padding: "12px" }}>{Math.round((row.avg_occupancy ?? 0) * 100)}%</td>
                  <td style={{ padding: "12px" }}>{row.total_records?.toLocaleString()}</td>
                  <td style={{ padding: "12px" }}>{fmtDur(row.avg_duration_h)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", fontFamily: "Arial", minHeight: "100vh", background: "#F3F4F6" }}>
      <header style={{ 
        width: "100%", padding: "18px 45px", background: "#111827", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 1000, boxShadow: "0 4px 15px rgba(0,0,0,0.2)"
      }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: "22px", margin: 0, fontWeight: 900, letterSpacing: "0.5px" }}>FindMySeat TMU</h2>
        </div>

        <nav style={{ display: "flex", gap: "12px", flex: 3, justifyContent: "center", alignItems: "center" }}>
          <NavItem p="seats"     label="Available Seats" />
          <NavItem p="suggested" label="Suggested Rooms" />
          <NavItem p="maps"      label="Interactive Maps" />
          <NavItem p="wellness"  label="Wellness Tips" />
          <NavItem p="history"   label="Historical Logs" />
        </nav>

        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
          <div style={{ padding: "8px 24px", background: "white", color: "#111827", borderRadius: "25px", fontSize: "13px", fontWeight: 800 }}>Live Data</div>
        </div>
      </header>

      <main style={{ flex: 1, padding: "45px", maxWidth: "1350px", margin: "0 auto", width: "100%" }}>
        {page === "seats"     && <SeatsPage />}
        {page === "suggested" && <SuggestedPage />}
        {page === "maps"      && <InteractiveMapPage />}
        {page === "wellness"  && <WellnessPage />}
        {page === "history"   && <HistoryPage />}
      </main>
    </div>
  );
}
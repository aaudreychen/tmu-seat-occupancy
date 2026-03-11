import React, { useEffect, useState, useMemo } from "react";
import { Calendar } from "./components/Calendar";
import { FloorPicker } from "./components/FloorPicker";

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

type Page = "seats" | "suggested" | "wellness";

// ---------------------------------------------------------------------------
// Wellness tips pool -- randomized on each visit.
// Each entry has an emoji, title, and body.
// ---------------------------------------------------------------------------
const ALL_WELLNESS_TIPS = [
  {
    emoji: "🧠",
    title: "Use the Pomodoro Technique",
    body: "Study for 25 minutes, then take a 5-minute break. After 4 cycles take a longer 15-30 min break. This keeps focus sharp and prevents burnout.",
  },
  {
    emoji: "💧",
    title: "Stay Hydrated",
    body: "Keep a water bottle at your desk. Dehydration reduces concentration by up to 20%. Aim for 8 cups a day, especially during exam season.",
  },
  {
    emoji: "🚶",
    title: "Move Between Sessions",
    body: "A short walk between study blocks improves memory consolidation and reduces physical tension from sitting. Even 5 minutes around the floor helps.",
  },
  {
    emoji: "🌿",
    title: "Find a Quieter Floor",
    body: "Higher floors of the SLC tend to be quieter. If you are easily distracted, filter for upper floors using the Available Seats page.",
  },
  {
    emoji: "🎧",
    title: "Use White Noise or Ambient Sound",
    body: "Busy campus environments can be distracting. Brown or white noise helps mask background chatter. Apps like Noisli or a YouTube ambient stream work well.",
  },
  {
    emoji: "😴",
    title: "Prioritise Sleep Over All-Nighters",
    body: "Sleep is when your brain consolidates what you studied. A 7-8 hour night before an exam outperforms cramming through the night every time.",
  },
  {
    emoji: "🍎",
    title: "Eat Before Long Study Sessions",
    body: "Your brain uses around 20% of your body's energy. Do not study on an empty stomach. Bring a snack like nuts, fruit, or a granola bar.",
  },
  {
    emoji: "📴",
    title: "Set a Phone-Free Block",
    body: "Put your phone face-down or in a bag during your focus block. Apps like Forest or iOS Focus Mode can help if you struggle with the habit.",
  },
  {
    emoji: "🤝",
    title: "Book Group Rooms Early",
    body: "Group study rooms fill up fast between 11 AM and 3 PM. Use the Suggested Rooms page to find a room with enough capacity for your group.",
  },
  {
    emoji: "🧘",
    title: "Do Not Skip Breaks",
    body: "Pushing through for 3 or more hours straight leads to diminishing returns. Scheduled breaks are not wasted time — they are part of effective studying.",
  },
  {
    emoji: "📝",
    title: "Review Notes Within 24 Hours",
    body: "The forgetting curve drops steeply in the first day after learning. Even a 10-minute review the same evening dramatically improves long-term retention.",
  },
  {
    emoji: "🔁",
    title: "Use Active Recall, Not Re-reading",
    body: "Closing your notes and recalling key points from memory is far more effective than re-reading. Flashcard apps like Anki are great for this.",
  },
  {
    emoji: "🗺️",
    title: "Change Your Study Space Occasionally",
    body: "Studying the same material in different locations has been shown to improve recall. Try a different floor or building for variety.",
  },
  {
    emoji: "💬",
    title: "Manage Exam Anxiety",
    body: "Light exercise, deep breathing, or a 10-minute walk before an exam can lower cortisol and improve performance. TMU also offers free counselling through Student Wellbeing.",
  },
  {
    emoji: "⚡",
    title: "Track Your Energy, Not Just Your Time",
    body: "Schedule your hardest tasks during your peak energy hours. Most people are sharpest in the mid-morning. Save lighter tasks for lower-energy periods.",
  },
  {
    emoji: "🎯",
    title: "Avoid Multitasking",
    body: "Switching between tasks reduces efficiency by up to 40%. Focus on one subject per session before moving to the next.",
  },
  {
    emoji: "🗣️",
    title: "Teach What You Learn",
    body: "Explaining a concept to someone else — or even out loud to yourself — forces you to identify gaps in your understanding that passive studying misses.",
  },
  {
    emoji: "🧹",
    title: "Keep Your Study Space Tidy",
    body: "A cluttered desk creates visual noise that competes for your attention. Clear your immediate workspace before starting even if the rest of the room is messy.",
  },
  {
    emoji: "⏰",
    title: "Set a Finish Time, Not Just a Start Time",
    body: "Knowing your session ends at a specific time creates urgency that improves focus. Open-ended sessions tend to expand into unproductive stretches.",
  },
  {
    emoji: "☀️",
    title: "Get Natural Light When Possible",
    body: "Natural light improves alertness and mood. When choosing a study spot, prefer seats near windows or well-lit areas over dim corners.",
  },
];

// Number of tips shown per visit
const TIPS_PER_PAGE = 12;

// ---------------------------------------------------------------------------
// Shuffle utility -- returns a new shuffled copy of an array.
// ---------------------------------------------------------------------------
function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Duration formatter -- converts fractional hours to a readable string.
// ---------------------------------------------------------------------------
const formatDuration = (hours: number) => {
  if (!hours || hours === 0) return "—";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

// ---------------------------------------------------------------------------
// Shared style constants
// ---------------------------------------------------------------------------
const labelStyle: React.CSSProperties = {
  fontWeight: 600,
  display: "block",
  marginBottom: "8px",
  whiteSpace: "nowrap",
  fontSize: "14px",
};

const filterWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
};

const inputStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: "10px",
  border: "1px solid #ccc",
  background: "white",
  whiteSpace: "nowrap",
  cursor: "pointer",
  fontSize: "14px",
};

// ---------------------------------------------------------------------------
// Main App component
// ---------------------------------------------------------------------------
export default function App() {
  const [page, setPage] = useState<Page>("seats");

  // -- Shared data state -----------------------------------------------------
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState<string>(buildings[0]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);

  // -- Available Seats page state --------------------------------------------
  const [filter, setFilter] = useState<"ALL" | "AVAILABLE" | "UNAVAILABLE">("ALL");
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [showFloorPickerSeats, setShowFloorPickerSeats] = useState(false);

  // -- Suggested Rooms page state --------------------------------------------
  const [minCapacity, setMinCapacity] = useState<number>(1);
  const [suggestedFloor, setSuggestedFloor] = useState<number | null>(null);
  const [showFloorPickerSuggested, setShowFloorPickerSuggested] = useState(false);

  // -- Wellness page state ---------------------------------------------------
  // A new random subset is selected each time the user navigates to the page.
  const [wellnessTips, setWellnessTips] = useState(() =>
    shuffleArray(ALL_WELLNESS_TIPS).slice(0, TIPS_PER_PAGE)
  );

  useEffect(() => {
    if (page === "wellness") {
      setWellnessTips(shuffleArray(ALL_WELLNESS_TIPS).slice(0, TIPS_PER_PAGE));
    }
  }, [page]);

  // -------------------------------------------------------------------------
  // Fetch occupancy data. Floor is not sent to the backend so the full floor
  // list is always available for the picker regardless of current selection.
  // -------------------------------------------------------------------------
  const fetchData = async () => {
    try {
      setLoading(true);
      const dateStr = selectedDate.toISOString().split("T")[0];
      const res = await fetch(`${API_URL}/availability/${building}?date=${dateStr}`);
      const json = await res.json();
      setData(Array.isArray(json) ? json : []);
    } catch (err) {
      console.error("Fetch error:", err);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [building, selectedDate]);

  // -------------------------------------------------------------------------
  // All unique floor numbers present in the current dataset.
  // -------------------------------------------------------------------------
  const availableFloors = Array.from(
    new Set(
      data
        .map((row) => parseInt(row.floor_id?.replace("F", "") || "0"))
        .filter((n) => !isNaN(n) && n > 0)
    )
  ).sort((a, b) => a - b);

  // -------------------------------------------------------------------------
  // Available Seats: client-side filter by floor and occupancy status.
  // -------------------------------------------------------------------------
  const filteredSeats = data.filter((row) => {
    const f = parseInt(row.floor_id?.replace("F", "") || "0");
    if (selectedFloor && f !== selectedFloor) return false;
    if (filter === "AVAILABLE") return row.occupied === 0;
    if (filter === "UNAVAILABLE") return row.occupied === 1;
    return true;
  });

  // -------------------------------------------------------------------------
  // Suggested Rooms: one card per room, using the most recent record.
  // Only rooms whose latest record shows occupied === 0 are included.
  // Sorted by capacity descending so larger rooms appear first.
  // -------------------------------------------------------------------------
  const suggestedRooms = useMemo(() => {
    // Collapse all records down to one per room keeping the latest timestamp
    const roomMap: Record<string, any> = {};
    for (const row of data) {
      const id = row.room_id;
      if (!id) continue;
      if (!roomMap[id] || row.timestamp_iso > roomMap[id].timestamp_iso) {
        roomMap[id] = row;
      }
    }

    return Object.values(roomMap)
      .filter((row) => {
        if (row.occupied !== 0) return false;
        if ((row.capacity || 0) < minCapacity) return false;
        if (suggestedFloor) {
          const f = parseInt(row.floor_id?.replace("F", "") || "0");
          if (f !== suggestedFloor) return false;
        }
        return true;
      })
      .sort((a, b) => (b.capacity || 0) - (a.capacity || 0));
  }, [data, minCapacity, suggestedFloor]);

  // -------------------------------------------------------------------------
  // Sidebar nav item -- whiteSpace nowrap prevents the label from ever
  // wrapping to a second line and causing layout shift.
  // -------------------------------------------------------------------------
  const NavItem = ({ p, label, emoji }: { p: Page; label: string; emoji: string }) => (
    <button
      onClick={() => setPage(p)}
      style={{
        background: page === p ? "#1F2937" : "transparent",
        border: "none",
        color: page === p ? "white" : "#9CA3AF",
        padding: "10px 14px",
        borderRadius: "8px",
        cursor: "pointer",
        textAlign: "left",
        fontSize: "13px",
        fontWeight: page === p ? 700 : 400,
        display: "flex",
        alignItems: "center",
        gap: "10px",
        width: "100%",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: "16px" }}>{emoji}</span>
      {label}
    </button>
  );

  // =========================================================================
  // Available Seats page
  // =========================================================================
  const SeatsPage = () => (
    <div>
      <h1 style={{ marginBottom: "24px" }}>Available Seats</h1>

      {/* Filter row -- nowrap keeps all controls on one line */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "24px", alignItems: "flex-end", flexWrap: "nowrap" }}>

        <div style={filterWrap}>
          <label style={labelStyle}>Building</label>
          <select
            value={building}
            onChange={(e) => { setSelectedFloor(null); setBuilding(e.target.value); }}
            style={inputStyle}
          >
            {buildings.map((b) => <option key={b} value={b}>{buildingMap[b]}</option>)}
          </select>
        </div>

        <div style={{ ...filterWrap, position: "relative" }}>
          <label style={labelStyle}>Date</label>
          <button
            onClick={() => { setShowCalendar(!showCalendar); setShowFloorPickerSeats(false); }}
            style={inputStyle}
          >
            {selectedDate.toDateString()}
          </button>
          {showCalendar && (
            <div style={{ position: "absolute", top: "100%", zIndex: 100 }}>
              <Calendar
                selectedDate={selectedDate}
                onSelectDate={(d) => { setSelectedDate(d); setShowCalendar(false); }}
                onClose={() => setShowCalendar(false)}
              />
            </div>
          )}
        </div>

        {/* minWidth prevents the floor button from collapsing */}
        <div style={{ ...filterWrap, position: "relative", minWidth: "140px" }}>
          <label style={labelStyle}>Floor</label>
          <button
            onClick={() => { setShowFloorPickerSeats(!showFloorPickerSeats); setShowCalendar(false); }}
            style={inputStyle}
          >
            {selectedFloor ? `Floor ${selectedFloor}` : "All Floors"}
          </button>
          {showFloorPickerSeats && (
            <FloorPicker
              selectedFloor={selectedFloor || 0}
              onSelectFloor={(n) => {
                setSelectedFloor(n === selectedFloor ? null : n);
                setShowFloorPickerSeats(false);
              }}
              onClose={() => setShowFloorPickerSeats(false)}
              availableFloors={availableFloors}
            />
          )}
        </div>
      </div>

      {/* Occupancy status filter buttons */}
      <div style={{ marginBottom: "24px", display: "flex", gap: "10px" }}>
        {(["ALL", "AVAILABLE", "UNAVAILABLE"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "10px 20px",
              borderRadius: "20px",
              border: "1px solid #ccc",
              fontWeight: 600,
              cursor: "pointer",
              background: filter === f
                ? (f === "AVAILABLE" ? "#16A34A" : f === "UNAVAILABLE" ? "#B91C1C" : "#2563EB")
                : "white",
              color: filter === f ? "white" : "black",
            }}
          >
            {f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Room list */}
      {loading ? <p>Loading results...</p> : filteredSeats.length === 0 ? (
        <p style={{ color: "#6B7280" }}>No room data found for this selection.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {filteredSeats.map((row, i) => {
            const ts = new Date(row.timestamp_iso);
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "20px",
                  background: "white",
                  borderRadius: "12px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>Room {row.room_id} — Floor {row.floor_id}</div>
                  <div style={{ fontSize: "14px", color: "#6B7280" }}>
                    {ts.toLocaleDateString()} {ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {" | Duration: "}{formatDuration(row.booking_duration)}
                    {" | Capacity: "}{row.capacity}
                    {" | Occupied: "}{row.occupied === 1 ? "Yes" : "No"}
                  </div>
                </div>
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    backgroundColor: row.occupied === 0 ? "#16A34A" : "#B91C1C",
                    flexShrink: 0,
                    marginLeft: "16px",
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // =========================================================================
  // Suggested Rooms page
  // Cards show floor, capacity, and typical booking duration as plain text.
  // No emojis on the detail lines. "Available" badge kept as a clean status
  // indicator consistent with the RAG approach used elsewhere.
  // =========================================================================
  const SuggestedPage = () => (
    <div>
      <h1 style={{ marginBottom: "8px" }}>Suggested Rooms</h1>
      <p style={{ color: "#6B7280", marginBottom: "24px" }}>
        Rooms that are currently free, sorted by capacity. Filter by group size or floor to narrow your options.
      </p>

      {/* Filter row */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "30px", alignItems: "flex-end", flexWrap: "nowrap" }}>

        <div style={filterWrap}>
          <label style={labelStyle}>Building</label>
          <select
            value={building}
            onChange={(e) => { setSuggestedFloor(null); setBuilding(e.target.value); }}
            style={inputStyle}
          >
            {buildings.map((b) => <option key={b} value={b}>{buildingMap[b]}</option>)}
          </select>
        </div>

        <div style={{ ...filterWrap, position: "relative" }}>
          <label style={labelStyle}>Date</label>
          <button
            onClick={() => { setShowCalendar(!showCalendar); setShowFloorPickerSuggested(false); }}
            style={inputStyle}
          >
            {selectedDate.toDateString()}
          </button>
          {showCalendar && (
            <div style={{ position: "absolute", top: "100%", zIndex: 100 }}>
              <Calendar
                selectedDate={selectedDate}
                onSelectDate={(d) => { setSelectedDate(d); setShowCalendar(false); }}
                onClose={() => setShowCalendar(false)}
              />
            </div>
          )}
        </div>

        <div style={filterWrap}>
          <label style={labelStyle}>Min. Capacity</label>
          <select
            value={minCapacity}
            onChange={(e) => setMinCapacity(Number(e.target.value))}
            style={inputStyle}
          >
            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
              <option key={n} value={n}>{n}+ people</option>
            ))}
          </select>
        </div>

        <div style={{ ...filterWrap, position: "relative", minWidth: "140px" }}>
          <label style={labelStyle}>Floor</label>
          <button
            onClick={() => { setShowFloorPickerSuggested(!showFloorPickerSuggested); setShowCalendar(false); }}
            style={inputStyle}
          >
            {suggestedFloor ? `Floor ${suggestedFloor}` : "All Floors"}
          </button>
          {showFloorPickerSuggested && (
            <FloorPicker
              selectedFloor={suggestedFloor || 0}
              onSelectFloor={(n) => {
                setSuggestedFloor(n === suggestedFloor ? null : n);
                setShowFloorPickerSuggested(false);
              }}
              onClose={() => setShowFloorPickerSuggested(false)}
              availableFloors={availableFloors}
            />
          )}
        </div>
      </div>

      {/* Room cards */}
      {loading ? <p>Loading...</p> : suggestedRooms.length === 0 ? (
        <div style={{ padding: "40px", textAlign: "center", background: "white", borderRadius: "12px", color: "#6B7280" }}>
          No available rooms match your criteria. Try adjusting the capacity or floor filter.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
          {suggestedRooms.map((row, i) => {
            const isTop = i === 0;
            return (
              <div
                key={i}
                style={{
                  background: "white",
                  borderRadius: "14px",
                  padding: "20px",
                  // Top-ranked card gets a green outline to draw the eye
                  boxShadow: isTop
                    ? "0 0 0 2px #16A34A, 0 4px 12px rgba(0,0,0,0.08)"
                    : "0 2px 6px rgba(0,0,0,0.06)",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0",
                }}
              >
                {/* Best match badge -- only on the highest-capacity available room */}
                {isTop && (
                  <div
                    style={{
                      position: "absolute",
                      top: "14px",
                      right: "14px",
                      background: "#DCFCE7",
                      color: "#15803D",
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: "6px",
                    }}
                  >
                    Best Match
                  </div>
                )}

                {/* Room title with green availability dot */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                  <div
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: "#16A34A",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontWeight: 700, fontSize: "16px" }}>Room {row.room_id}</span>
                </div>

                {/* Room detail lines -- plain text, no emojis */}
                <div style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "14px", color: "#374151" }}>
                  <div><strong>Floor:</strong> {row.floor_id}</div>
                  <div><strong>Capacity:</strong> {row.capacity} people</div>
                  {row.booking_duration > 0 && (
                    <div><strong>Typical booking:</strong> {formatDuration(row.booking_duration)}</div>
                  )}
                </div>

                {/* Green available badge -- consistent with RAG status used across the dashboard */}
                <div
                  style={{
                    marginTop: "14px",
                    background: "#F0FDF4",
                    color: "#15803D",
                    fontWeight: 600,
                    fontSize: "13px",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    textAlign: "center",
                  }}
                >
                  Available
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // =========================================================================
  // Wellness Tips page -- reshuffled on every visit, emojis on each card.
  // =========================================================================
  const WellnessPage = () => (
    <div>
      <h1 style={{ marginBottom: "8px" }}>Study Wellness Tips</h1>
      <p style={{ color: "#6B7280", marginBottom: "6px" }}>
        Finding a seat is only half the battle. Here are some tips to make your session as effective as possible.
      </p>
      <p style={{ color: "#9CA3AF", fontSize: "13px", marginBottom: "28px" }}>
        Navigate away and come back for a fresh set of tips.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
        {wellnessTips.map((tip, i) => (
          <div
            key={i}
            style={{
              background: "white",
              borderRadius: "14px",
              padding: "22px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ fontSize: "28px" }}>{tip.emoji}</div>
            <div style={{ fontWeight: 700, fontSize: "15px", color: "#111827" }}>{tip.title}</div>
            <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: "1.6" }}>{tip.body}</div>
          </div>
        ))}
      </div>
    </div>
  );

  // =========================================================================
  // Root layout
  // =========================================================================
  return (
    <div style={{ display: "flex", fontFamily: "Arial", minHeight: "100vh" }}>

      {/* Sidebar -- emojis on nav items make each entry visually distinct */}
      <div
        style={{
          width: "200px",
          background: "#111827",
          color: "white",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          flexShrink: 0,
        }}
      >
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "18px", margin: 0 }}>TMU Seats</h2>
          <p style={{ color: "#9CA3AF", fontSize: "12px", margin: "4px 0 0 0" }}>Real-Time Data</p>
        </div>

        <NavItem p="seats"     label="Available Seats"  emoji="🪑" />
        <NavItem p="suggested" label="Suggested Rooms"  emoji="💡" />
        <NavItem p="wellness"  label="Wellness Tips"    emoji="🌿" />
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: "40px", background: "#F3F4F6", overflowY: "auto" }}>
        {page === "seats"     && <SeatsPage />}
        {page === "suggested" && <SuggestedPage />}
        {page === "wellness"  && <WellnessPage />}
      </div>
    </div>
  );
}

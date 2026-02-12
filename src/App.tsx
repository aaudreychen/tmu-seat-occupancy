import React, { useEffect, useState } from "react";
import { Calendar } from "./components/Calendar";
import { TimePicker } from "./components/TimePicker";
import { FloorPicker } from "./components/FloorPicker";
import { PeoplePicker } from "./components/PeoplePicker";

declare global {
  interface ImportMeta {
    readonly env: { VITE_API_URL: string };
  }
}

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

const buildingMap: Record<string, string> = {
  TedRogersSchoolofManagement: "Ted Rogers School of Management",
  Library: "Library",
  StudentLearningCenter: "Student Learning Center",
  EngineeringBuilding: "Engineering Building",
};
const buildings = Object.keys(buildingMap);

function App() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "AVAILABLE" | "UNAVAILABLE">("ALL");
  const [building, setBuilding] = useState<string>(buildings[0]);

  // Filter States
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  
  const [selectedTime, setSelectedTime] = useState<{
    hour: number;
    minute: number;
    period: "AM" | "PM";
  }>({ hour: 10, minute: 0, period: "AM" });
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [showFloorPicker, setShowFloorPicker] = useState(false);

  const [selectedPeople, setSelectedPeople] = useState<string>("");
  const [showPeoplePicker, setShowPeoplePicker] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const dateStr = selectedDate.toISOString().split('T')[0]; 
      const params = new URLSearchParams();
      params.append("date", dateStr);

      // If filter is NOT "ALL", apply specific room constraints
      if (filter !== "ALL") {
        const timeStr = `${selectedTime.hour}:${selectedTime.minute.toString().padStart(2, '0')} ${selectedTime.period}`;
        params.append("time", timeStr);
        
        if (selectedFloor) {
          params.append("floor", selectedFloor.toString());
        }

        if (selectedPeople) {
          const peopleNum = selectedPeople.includes("More") ? 5 : parseInt(selectedPeople);
          params.append("people", peopleNum.toString());
        }
      }

      const res = await fetch(`${API_URL}/availability/${building}?${params.toString()}`);
      const json = await res.json();
      
      setData(Array.isArray(json) ? json : []);
      setLoading(false);
    } catch (err) {
      console.error("Fetch error:", err);
      setData([]);
      setLoading(false);
    }
  };

  // Re-fetch when building, date, or the top-level filter changes
  useEffect(() => {
    fetchData();
  }, [building, selectedDate, selectedTime, selectedFloor, selectedPeople, filter]);

  // Frontend logic for status indicators
  const filteredData = data.filter((row) => {
    if (filter === "AVAILABLE") return row.predicted === 0;
    if (filter === "UNAVAILABLE") return row.predicted === 1;
    return true; 
  });

  return (
    <div style={{ display: "flex", fontFamily: "Arial", minHeight: "100vh" }}>
      {/* Sidebar */}
      <div style={{ width: "150px", background: "#111827", color: "white", padding: "20px" }}>
        <h2 style={{ fontSize: "18px" }}>TMU Seats</h2>
        <p style={{ color: "#9CA3AF", fontSize: "12px" }}>Real-Time Data</p>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: "40px", background: "#F3F4F6" }}>
        <h1 style={{ marginBottom: "30px" }}>TMU Seat Occupancy Dashboard</h1>

        {/* Filters Row */}
        <div style={{ display: "flex", gap: "20px", marginBottom: "30px", alignItems: "flex-end", flexWrap: "wrap" }}>
          
          {/* Building */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <label style={{ fontWeight: 600 }}>Building:</label>
            <select value={building} onChange={(e) => setBuilding(e.target.value)} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #ccc" }}>
              {buildings.map((b) => <option key={b} value={b}>{buildingMap[b]}</option>)}
            </select>
          </div>

          {/* Date Picker */}
          <div style={{ position: "relative" }}>
            <label style={{ fontWeight: 600, display: "block", marginBottom: "10px" }}>Date:</label>
            <button onClick={() => { setShowCalendar(!showCalendar); setShowTimePicker(false); setShowFloorPicker(false); setShowPeoplePicker(false); }} style={{ padding: "12px", borderRadius: "10px", background: "white", border: "1px solid #ccc" }}>
              {selectedDate.toDateString()}
            </button>
            {showCalendar && (
              <div style={{ position: "absolute", zIndex: 100 }}><Calendar selectedDate={selectedDate} onSelectDate={(d) => { setSelectedDate(d); setShowCalendar(false); }} onClose={() => setShowCalendar(false)} /></div>
            )}
          </div>

          {/* Time Selection (Disabled if filter is ALL) */}
          <div style={{ position: "relative" }}>
            <label style={{ fontWeight: 600, display: "block", marginBottom: "10px", opacity: filter === "ALL" ? 0.5 : 1 }}>Time Window:</label>
            <button 
              disabled={filter === "ALL"}
              onClick={() => { setShowTimePicker(!showTimePicker); setShowCalendar(false); setShowFloorPicker(false); setShowPeoplePicker(false); }} 
              style={{ padding: "12px", borderRadius: "10px", background: filter === "ALL" ? "#e5e7eb" : "white", border: "1px solid #ccc" }}
            >
              {selectedTime.hour}:{selectedTime.minute.toString().padStart(2, '0')} {selectedTime.period}
            </button>
            {showTimePicker && <TimePicker selectedTime={selectedTime} onSelectTime={(t) => { setSelectedTime(t); setShowTimePicker(false); }} onClose={() => setShowTimePicker(false)} />}
          </div>

          {/* Floor Selection (Disabled if filter is ALL) */}
          <div style={{ position: "relative", minWidth: "120px" }}>
            <label style={{ fontWeight: 600, display: "block", marginBottom: "10px", opacity: filter === "ALL" ? 0.5 : 1 }}>Floor:</label>
            <button 
              disabled={filter === "ALL"}
              onClick={() => { setShowFloorPicker(!showFloorPicker); setShowCalendar(false); setShowTimePicker(false); setShowPeoplePicker(false); }} 
              style={{ padding: "12px", borderRadius: "10px", background: filter === "ALL" ? "#e5e7eb" : "white", border: "1px solid #ccc", width: "100%" }}
            >
              {selectedFloor ? `Floor ${selectedFloor}` : "All Floors"}
            </button>
            {showFloorPicker && <FloorPicker selectedFloor={selectedFloor || 0} onSelectFloor={setSelectedFloor} onClose={() => setShowFloorPicker(false)} availableFloors={[1, 2, 3, 4, 5, 6, 7, 8]} />}
          </div>

          {/* People Selection (Disabled if filter is ALL) */}
          <div style={{ position: "relative", minWidth: "150px" }}>
            <label style={{ fontWeight: 600, display: "block", marginBottom: "10px", opacity: filter === "ALL" ? 0.5 : 1 }}>Min Capacity:</label>
            <button 
              disabled={filter === "ALL"}
              onClick={() => { setShowPeoplePicker(!showPeoplePicker); setShowCalendar(false); setShowTimePicker(false); setShowFloorPicker(false); }} 
              style={{ padding: "12px", borderRadius: "10px", background: filter === "ALL" ? "#e5e7eb" : "white", border: "1px solid #ccc", width: "100%" }}
            >
              {selectedPeople || "Any Capacity"}
            </button>
            {showPeoplePicker && <PeoplePicker selectedPeople={selectedPeople} onSelectPeople={setSelectedPeople} onClose={() => setShowPeoplePicker(false)} />}
          </div>
        </div>

        {/* Status Filter Buttons */}
        <div style={{ marginBottom: "30px", display: "flex", gap: "10px" }}>
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

        {/* Results List */}
        {loading ? (
          <p>Loading results...</p>
        ) : filteredData.length === 0 ? (
          <p>No room data found for this selection.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {filteredData.map((row, index) => (
              <div key={index} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px", background: "white", borderRadius: "12px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Room {row.room_id} — Floor {row.floor_id}</div>
                  <div style={{ fontSize: "14px", color: "#6B7280" }}>Reported at: {row.time} | Capacity: {row.capacity}</div>
                </div>
                <div style={{ width: "24px", height: "24px", borderRadius: "50%", backgroundColor: row.predicted === 0 ? "#16A34A" : "#B91C1C" }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
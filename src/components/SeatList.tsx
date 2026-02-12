/// <reference types="vite/client" />
import React, { useState, useEffect } from 'react';
import { Badge } from "./ui/badge";

// 1. Define the structure outside the function
interface SeatData {
  _id: string;
  room_id: string;
  occupied: number;
  co2_ppm?: number;
  temperature_c?: number;
}

export function SeatList() {
  const [seats, setSeats] = useState<SeatData[]>([]); 
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchSeats = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL; 
        
        const response = await fetch(`${apiUrl}/api/seats`);
        const data = await response.json();
        setSeats(data);
      } catch (error) {
        console.error("Error fetching from MongoDB:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSeats();
  }, []);

  if (loading) return <div className="p-8 text-center">Loading TMU study spaces...</div>;

  return (
    <div className="grid gap-4 p-4">
      {seats.map((seat) => (
        <div key={seat._id} className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
          <div className="flex justify-between items-center">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-muted-foreground">Location</span>
              <span className="text-lg font-semibold">{seat.room_id || "General Study Space"}</span>
            </div>
            
            <Badge variant={seat.occupied === 1 ? "destructive" : "default"}>
              {seat.occupied === 1 ? "Occupied" : "Available"}
            </Badge>
          </div>
          
          <div className="mt-4 text-xs text-muted-foreground">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      ))}
    </div>
  );
}
import React from 'react';
import { Header } from './Header';
import { SeatFilters } from './SeatFilters';
import { AnalyticsMetrics } from './AnalyticsMetrics';
import { RoomHistory } from './RoomHistory';

interface AnalyticsProps {
  selectedBuilding: string;
  onBuildingChange: (building: string) => void;
  availableSeats: number;
  availableFloors: number[];
  selectedFloor: number;
  setSelectedFloor: (floor: number) => void;
}

export function Analytics({ 
  selectedBuilding, 
  onBuildingChange, 
  availableSeats,
  availableFloors,
  selectedFloor,
  setSelectedFloor
}: AnalyticsProps) {
  return (
    <div className="max-w-7xl mx-auto p-8">
      <Header 
        selectedBuilding={selectedBuilding}
        onBuildingChange={onBuildingChange}
        availableSeats={availableSeats}
      />
      <SeatFilters 
        activeFilter="all"
        setActiveFilter={() => {}}
        availableFloors={availableFloors}
        selectedFloor={selectedFloor}
        setSelectedFloor={setSelectedFloor}
      />
      <AnalyticsMetrics />
      <RoomHistory selectedFloor={selectedFloor} />
    </div>
  );
}

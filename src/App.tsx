import React from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { SeatFilters } from './components/SeatFilters';
import { SeatList } from './components/SeatList';
import { Analytics } from './components/Analytics';
import { useState } from 'react';
import { buildings } from './utils/buildingData';

export default function App() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedBuilding, setSelectedBuilding] = useState('Student Learning Centre (SLC)');
  const [selectedFloor, setSelectedFloor] = useState(buildings[selectedBuilding].defaultFloor);
  const [currentPage, setCurrentPage] = useState<'available-seats' | 'analytics'>('available-seats');

  const handleBuildingChange = (building: string) => {
    setSelectedBuilding(building);
    setSelectedFloor(buildings[building].defaultFloor);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {currentPage === 'available-seats' ? (
            <div className="max-w-7xl mx-auto p-8">
              <Header 
                selectedBuilding={selectedBuilding}
                onBuildingChange={handleBuildingChange}
                availableSeats={buildings[selectedBuilding].availableSeats}
              />
              <SeatFilters 
                activeFilter={activeFilter} 
                setActiveFilter={setActiveFilter}
                availableFloors={buildings[selectedBuilding].floors}
                selectedFloor={selectedFloor}
                setSelectedFloor={setSelectedFloor}
              />
              <SeatList 
                activeFilter={activeFilter}
                selectedFloor={selectedFloor}
              />
            </div>
          ) : (
            <Analytics
              selectedBuilding={selectedBuilding}
              onBuildingChange={handleBuildingChange}
              availableSeats={buildings[selectedBuilding].availableSeats}
              availableFloors={buildings[selectedBuilding].floors}
              selectedFloor={selectedFloor}
              setSelectedFloor={setSelectedFloor}
            />
          )}
        </main>
      </div>
    </div>
  );
}
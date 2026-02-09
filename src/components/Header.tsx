import React from 'react';
import { Search } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface HeaderProps {
  selectedBuilding: string;
  onBuildingChange: (building: string) => void;
  availableSeats: number;
}

export function Header({ selectedBuilding, onBuildingChange, availableSeats }: HeaderProps) {
  const [showBuildingOptions, setShowBuildingOptions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);

  const buildings = [
    'Student Learning Centre (SLC)',
    'George Vari Engineering and Computing Centre',
    'Ted Rogers School of Management'
  ];

  const filteredBuildings = buildings.filter(building =>
    building.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleBuildingSelect = (building: string) => {
    onBuildingChange(building);
    setSearchQuery('');
    setShowBuildingOptions(false);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowBuildingOptions(false);
        setSearchQuery('');
      }
    }

    if (showBuildingOptions) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showBuildingOptions]);

  return (
    <div className="mb-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-1">{selectedBuilding}</h1>
          <p className="text-gray-600">{availableSeats} Seats Available</p>
        </div>
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-2 mb-1">
            <div className="bg-blue-600 text-white px-3 py-2 font-bold text-lg">TM</div>
            <div className="bg-yellow-400 text-gray-900 px-3 py-2 font-bold text-lg">U</div>
          </div>
          <div className="text-right">
            <div className="font-semibold text-sm">Toronto</div>
            <div className="font-semibold text-sm">Metropolitan</div>
            <div className="font-semibold text-sm">University</div>
          </div>
        </div>
      </div>

      <div className="relative max-w-xl" ref={searchRef}>
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Which building would you like to study in?"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setShowBuildingOptions(true)}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {showBuildingOptions && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg py-2 z-50 max-h-64 overflow-y-auto">
            {filteredBuildings.length > 0 ? (
              filteredBuildings.map((building) => (
                <button
                  key={building}
                  onClick={() => handleBuildingSelect(building)}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-100 transition-colors ${
                    selectedBuilding === building ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-900'
                  }`}
                >
                  {building}
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-gray-500">No buildings found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
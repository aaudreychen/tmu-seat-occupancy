import React from 'react';
interface FloorPickerProps {
  selectedFloor: number;
  onSelectFloor: (floor: number) => void;
  onClose: () => void;
  availableFloors: number[];
}

export function FloorPicker({ selectedFloor, onSelectFloor, onClose, availableFloors }: FloorPickerProps) {
  const handleFloorClick = (floor: number) => {
    onSelectFloor(floor);
    onClose();
  };

  return (
    <div className="absolute top-full left-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg py-2 z-50 w-full">
      {availableFloors.map((floor) => (
        <button
          key={floor}
          onClick={() => handleFloorClick(floor)}
          className={`w-full px-4 py-2.5 text-left hover:bg-gray-100 transition-colors ${
            selectedFloor === floor ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-900'
          }`}
        >
          Floor {floor}
        </button>
      ))}
    </div>
  );
}
import React from 'react';
import { Accessibility } from 'lucide-react';

interface RoomHistoryProps {
  selectedFloor: number;
}

export function RoomHistory({ selectedFloor }: RoomHistoryProps) {
  // Generate room numbers based on selected floor
  const rooms = [
    {
      id: 1,
      number: `Room ${selectedFloor}01`,
      status: 'Available',
      accessible: true,
    },
    {
      id: 2,
      number: `Room ${selectedFloor}02`,
      status: 'Available',
      accessible: true,
    },
    {
      id: 3,
      number: `Room ${selectedFloor}03`,
      status: 'Available',
      accessible: true,
    },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Based on Historical Data:</h2>
      <div className="space-y-4">
        {rooms.map((room) => (
          <div
            key={room.id}
            className="flex items-center gap-4 px-6 py-4 bg-white border border-gray-200 rounded-xl"
          >
            <div className="w-6 h-6 rounded-full bg-green-500 flex-shrink-0" />
            <span className="flex-1 text-left font-medium text-gray-900">
              {room.number}
            </span>
            <span className="text-gray-900 font-medium">{room.status}</span>
            {room.accessible && (
              <Accessibility className="w-6 h-6 text-gray-700" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

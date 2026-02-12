import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface TimePickerProps {
  selectedTime: { hour: number; minute: number; period: 'AM' | 'PM' };
  onSelectTime: (time: { hour: number; minute: number; period: 'AM' | 'PM' }) => void;
  onClose: () => void;
}

export function TimePicker({ selectedTime, onSelectTime, onClose }: TimePickerProps) {
  const [hour, setHour] = useState(selectedTime.hour);
  const [minute, setMinute] = useState(selectedTime.minute);
  const [period, setPeriod] = useState(selectedTime.period);

  const incrementHour = () => {
    setHour(hour === 12 ? 1 : hour + 1);
  };

  const decrementHour = () => {
    setHour(hour === 1 ? 12 : hour - 1);
  };

  // Restricts minutes to 30-minute steps (:00 or :30)
  const toggleMinute = () => {
    setMinute(minute === 0 ? 30 : 0);
  };

  const handleConfirm = () => {
    onSelectTime({ hour, minute, period });
    onClose();
  };

  return (
    <div className="absolute top-full left-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg p-6 z-50 w-64">
      <div className="text-center mb-4">
        <div className="text-sm font-medium text-gray-600 mb-2">Select 30-Min Window</div>
      </div>

      {/* Time Picker Controls */}
      <div className="flex items-center justify-center gap-4 mb-6">
        {/* Hour Control */}
        <div className="flex flex-col items-center">
          <button
            onClick={incrementHour}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <ChevronUp className="w-5 h-5 text-gray-600" />
          </button>
          <div className="w-16 h-12 flex items-center justify-center text-2xl font-semibold text-gray-900 my-1">
            {hour.toString().padStart(2, '0')}
          </div>
          <button
            onClick={decrementHour}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <ChevronDown className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="text-2xl font-semibold text-gray-900">:</div>

        {/* Minute Control (Half-Hour Steps Only) */}
        <div className="flex flex-col items-center">
          <button
            onClick={toggleMinute}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <ChevronUp className="w-5 h-5 text-gray-600" />
          </button>
          <div className="w-16 h-12 flex items-center justify-center text-2xl font-semibold text-gray-900 my-1">
            {minute.toString().padStart(2, '0')}
          </div>
          <button
            onClick={toggleMinute}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <ChevronDown className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* AM/PM Control */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => setPeriod('AM')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              period === 'AM'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            AM
          </button>
          <button
            onClick={() => setPeriod('PM')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              period === 'PM'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            PM
          </button>
        </div>
      </div>

      <button
        onClick={handleConfirm}
        className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
      >
        Confirm Window
      </button>
    </div>
  );
}
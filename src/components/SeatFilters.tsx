import React from 'react';
import { Calendar as CalendarIcon, Clock, Building2, Users, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { Calendar } from './Calendar';
import { TimePicker } from './TimePicker';
import { FloorPicker } from './FloorPicker';
import { PeoplePicker } from './PeoplePicker';

interface SeatFiltersProps {
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  availableFloors: number[];
  selectedFloor: number;
  setSelectedFloor: (floor: number) => void;
}

export function SeatFilters({ activeFilter, setActiveFilter, availableFloors, selectedFloor, setSelectedFloor }: SeatFiltersProps) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date(2025, 9, 25)); // October 25, 2025
  const calendarRef = useRef<HTMLDivElement>(null);

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedTime, setSelectedTime] = useState({ hour: 2, minute: 0, period: 'PM' as 'AM' | 'PM' });
  const timePickerRef = useRef<HTMLDivElement>(null);

  const [showFloorPicker, setShowFloorPicker] = useState(false);
  const floorPickerRef = useRef<HTMLDivElement>(null);

  const [showPeoplePicker, setShowPeoplePicker] = useState(false);
  const [selectedPeople, setSelectedPeople] = useState('1 Person');
  const peoplePickerRef = useRef<HTMLDivElement>(null);

  const formatDate = (date: Date) => {
    const day = date.getDate();
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  const formatTime = (time: { hour: number; minute: number; period: 'AM' | 'PM' }) => {
    return `${time.hour}:${time.minute.toString().padStart(2, '0')} ${time.period}`;
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setShowCalendar(false);
      }
      if (timePickerRef.current && !timePickerRef.current.contains(event.target as Node)) {
        setShowTimePicker(false);
      }
      if (floorPickerRef.current && !floorPickerRef.current.contains(event.target as Node)) {
        setShowFloorPicker(false);
      }
      if (peoplePickerRef.current && !peoplePickerRef.current.contains(event.target as Node)) {
        setShowPeoplePicker(false);
      }
    }

    if (showCalendar || showTimePicker || showFloorPicker || showPeoplePicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCalendar, showTimePicker, showFloorPicker, showPeoplePicker]);

  return (
    <div className="mb-6">
      {/* Status Filter Buttons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-4 py-2 rounded-full font-medium transition-colors ${
            activeFilter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          All Seats
        </button>
        <button
          onClick={() => setActiveFilter('available')}
          className={`px-4 py-2 rounded-full font-medium transition-colors ${
            activeFilter === 'available'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          Available
        </button>
      </div>

      {/* Detail Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative" ref={calendarRef}>
          <button 
            onClick={() => setShowCalendar(!showCalendar)}
            className="flex items-center gap-3 bg-white border border-gray-300 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors w-full"
          >
            <CalendarIcon className="w-5 h-5 text-gray-600" />
            <span className="flex-1 text-left text-gray-900">{formatDate(selectedDate)}</span>
            <ChevronDown className="w-4 h-4 text-gray-600" />
          </button>
          {showCalendar && (
            <Calendar
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onClose={() => setShowCalendar(false)}
            />
          )}
        </div>

        <div className="relative" ref={timePickerRef}>
          <button 
            onClick={() => setShowTimePicker(!showTimePicker)}
            className="flex items-center gap-3 bg-white border border-gray-300 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors w-full"
          >
            <Clock className="w-5 h-5 text-gray-600" />
            <span className="flex-1 text-left text-gray-900">{formatTime(selectedTime)}</span>
            <ChevronDown className="w-4 h-4 text-gray-600" />
          </button>
          {showTimePicker && (
            <TimePicker
              selectedTime={selectedTime}
              onSelectTime={setSelectedTime}
              onClose={() => setShowTimePicker(false)}
            />
          )}
        </div>

        <div className="relative" ref={floorPickerRef}>
          <button 
            onClick={() => setShowFloorPicker(!showFloorPicker)}
            className="flex items-center gap-3 bg-white border border-gray-300 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors w-full"
          >
            <Building2 className="w-5 h-5 text-gray-600" />
            <span className="flex-1 text-left text-gray-900">Floor {selectedFloor}</span>
            <ChevronDown className="w-4 h-4 text-gray-600" />
          </button>
          {showFloorPicker && (
            <FloorPicker
              selectedFloor={selectedFloor}
              onSelectFloor={setSelectedFloor}
              onClose={() => setShowFloorPicker(false)}
              availableFloors={availableFloors}
            />
          )}
        </div>

        <div className="relative" ref={peoplePickerRef}>
          <button 
            onClick={() => setShowPeoplePicker(!showPeoplePicker)}
            className="flex items-center gap-3 bg-white border border-gray-300 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors w-full"
          >
            <Users className="w-5 h-5 text-gray-600" />
            <span className="flex-1 text-left text-gray-900">{selectedPeople}</span>
            <ChevronDown className="w-4 h-4 text-gray-600" />
          </button>
          {showPeoplePicker && (
            <PeoplePicker
              selectedPeople={selectedPeople}
              onSelectPeople={setSelectedPeople}
              onClose={() => setShowPeoplePicker(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
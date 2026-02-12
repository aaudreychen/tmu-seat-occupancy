import React from "react";

interface PeoplePickerProps {
  selectedPeople: string;
  onSelectPeople: (people: string) => void;
  onClose: () => void;
}

export function PeoplePicker({
  selectedPeople,
  onSelectPeople,
  onClose,
}: PeoplePickerProps) {

  const peopleOptions = [
    "1 Person",
    "2 People",
    "3 People",
    "4 People",
    "More than 4",
  ];

  const handlePeopleClick = (people: string) => {
    onSelectPeople(people);
    onClose();
  };

  return (
    <div className="absolute top-full left-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg py-2 z-50 w-full">
      
      {/* Any Capacity Option */}
      <button
        onClick={() => handlePeopleClick("")}
        className={`w-full px-4 py-2.5 text-left hover:bg-gray-100 transition-colors ${
          selectedPeople === ""
            ? "bg-blue-50 text-blue-600 font-medium"
            : "text-gray-900"
        }`}
      >
        Any Capacity
      </button>

      {peopleOptions.map((option) => (
        <button
          key={option}
          onClick={() => handlePeopleClick(option)}
          className={`w-full px-4 py-2.5 text-left hover:bg-gray-100 transition-colors ${
            selectedPeople === option
              ? "bg-blue-50 text-blue-600 font-medium"
              : "text-gray-900"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

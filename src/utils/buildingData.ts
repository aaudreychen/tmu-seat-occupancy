export interface BuildingConfig {
  name: string;
  availableSeats: number;
  floors: number[];
  defaultFloor: number;
}

export const buildings: Record<string, BuildingConfig> = {
  'Student Learning Centre (SLC)': {
    name: 'Student Learning Centre (SLC)',
    availableSeats: 48,
    floors: [3, 4, 5, 6, 7, 8, 9, 10],
    defaultFloor: 8,
  },
  'George Vari Engineering and Computing Centre': {
    name: 'George Vari Engineering and Computing Centre',
    availableSeats: 30,
    floors: [2],
    defaultFloor: 2,
  },
  'Ted Rogers School of Management': {
    name: 'Ted Rogers School of Management',
    availableSeats: 40,
    floors: [7, 8, 9],
    defaultFloor: 7,
  },
};

export function generateSeatsForFloor(floor: number, count: number = 8) {
  const seats = [];
  const baseNumber = floor * 100;
  
  for (let i = 0; i < count; i++) {
    const seatNumber = baseNumber + i;
    seats.push({
      id: seatNumber.toString(),
      number: `Seat ${seatNumber}`,
      available: Math.random() > 0.3, // Random availability
      accessible: Math.random() > 0.7, // Some seats are accessible
    });
  }
  
  return seats;
}
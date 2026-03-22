export interface Bus {
  id: string;
  busNumber: string;
  plateNumber: string;
  schoolId: string;
  status: "online" | "offline" | "idle";
  driverName: string;
}

export interface GPSLocation {
  busId: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  timestamp: string;
}

export interface Attendance {
  id: string;
  studentId: string;
  studentName: string;
  busId: string;
  timestamp: string;
  direction: "boarding" | "alighting";
  confidence: number;
  clipUrl: string | null;
}

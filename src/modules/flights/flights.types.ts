export const FLIGHT_PROVIDERS = ['auto', 'amadeus', 'mock'] as const;
export type FlightProvider = typeof FLIGHT_PROVIDERS[number];

export const CABIN_CLASSES = ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'] as const;
export type CabinClass = typeof CABIN_CLASSES[number];

export interface FlightSearchInput {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  children?: number;
  infants?: number;
  cabinClass?: CabinClass;
  currencyCode?: string;
  maxPrice?: number;
  maxStops?: number;
  nonStop?: boolean;
  provider?: FlightProvider;
  limit?: number;
}

export interface FlightSegment {
  departureAirport: string;
  arrivalAirport: string;
  departureAt: string;
  arrivalAt: string;
  carrierCode: string;
  carrierName?: string;
  flightNumber?: string;
  aircraft?: string;
  durationMinutes: number;
}

export interface FlightItinerary {
  durationMinutes: number;
  stops: number;
  segments: FlightSegment[];
}

export interface FlightOffer {
  id: string;
  provider: Exclude<FlightProvider, 'auto'>;
  providerOfferId: string;
  price: {
    total: number;
    currency: string;
  };
  itineraries: FlightItinerary[];
  validatingAirlineCodes: string[];
  bookableSeats?: number;
  cabinClass?: CabinClass;
  deepLinks: FlightDeepLinks;
  score: number;
  tradeoffs: string[];
  raw?: unknown;
}

export interface FlightDeepLinks {
  googleFlights: string;
  skyscanner: string;
  kayak: string;
}

export interface FlightSearchResult {
  provider: Exclude<FlightProvider, 'auto'>;
  live: boolean;
  searchedAt: string;
  query: FlightSearchInput;
  summary: string;
  offers: FlightOffer[];
  warnings: string[];
}

export interface ProviderStatus {
  name: Exclude<FlightProvider, 'auto'>;
  enabled: boolean;
  live: boolean;
  purpose: string;
  requiredEnv?: string[];
}

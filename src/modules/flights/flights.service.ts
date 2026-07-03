import {
  FlightDeepLinks,
  FlightItinerary,
  FlightOffer,
  FlightProvider,
  FlightSearchInput,
  FlightSearchResult,
  FlightSegment,
  ProviderStatus
} from './flights.types.js';

interface AmadeusToken {
  accessToken: string;
  expiresAt: number;
}

export class FlightsService {
  private amadeusToken?: AmadeusToken;

  async search(input: FlightSearchInput): Promise<FlightSearchResult> {
    const normalized = this.normalizeSearchInput(input);
    const provider = this.resolveProvider(normalized.provider);
    const warnings: string[] = [];

    if (provider === 'amadeus') {
      try {
        const offers = await this.searchAmadeus(normalized);
        return this.toSearchResult('amadeus', true, normalized, offers, warnings);
      } catch (error: any) {
        if (normalized.provider === 'amadeus') {
          throw error;
        }
        warnings.push(`Amadeus live search failed: ${error.message}`);
      }
    } else if (normalized.provider === 'amadeus') {
      throw new Error('Amadeus provider requested, but AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET are not configured.');
    }

    if (provider === 'aviationstack' || (normalized.provider === 'auto' && this.hasAviationstackCredentials())) {
      if (!this.hasAviationstackCredentials()) {
        throw new Error('Aviationstack provider requested, but AVIATIONSTACK_API_KEY is not configured.');
      }
      try {
        const result = await this.searchAviationstack(normalized);
        return this.toSearchResult('aviationstack', true, normalized, result.offers, [...warnings, ...result.warnings]);
      } catch (error: any) {
        if (normalized.provider === 'aviationstack') {
          throw error;
        }
        warnings.push(`Aviationstack live schedule search failed: ${error.message}`);
      }
    }

    if (!this.hasAmadeusCredentials() && !this.hasAviationstackCredentials()) {
      warnings.push('No live provider credentials are configured; returned deterministic mock flight offers.');
    }
    const mockOffers = this.searchMock(normalized);
    return this.toSearchResult('mock', false, normalized, mockOffers, warnings);
  }

  compare(offers: FlightOffer[], priorities: {
    priceWeight?: number;
    durationWeight?: number;
    stopsWeight?: number;
  } = {}): {
    rankedOffers: FlightOffer[];
    recommendation?: FlightOffer;
    rationale: string;
  } {
    if (offers.length === 0) {
      return {
        rankedOffers: [],
        rationale: 'No offers were provided to compare.'
      };
    }

    const priceWeight = priorities.priceWeight ?? 0.45;
    const durationWeight = priorities.durationWeight ?? 0.35;
    const stopsWeight = priorities.stopsWeight ?? 0.2;
    const pricedOffers = offers.filter((offer) => offer.price.available !== false && offer.price.total > 0);
    const minPrice = pricedOffers.length ? Math.min(...pricedOffers.map((offer) => offer.price.total)) : 0;
    const minDuration = Math.min(...offers.map((offer) => this.totalDuration(offer)));
    const minStops = Math.min(...offers.map((offer) => this.totalStops(offer)));

    const rankedOffers = offers
      .map((offer) => {
        const pricePenalty = minPrice > 0 && offer.price.available !== false && offer.price.total > 0
          ? offer.price.total / minPrice
          : 1;
        const durationPenalty = minDuration > 0 ? this.totalDuration(offer) / minDuration : 1;
        const stopsPenalty = this.totalStops(offer) - minStops;
        const score = 100 / ((pricePenalty * priceWeight) + (durationPenalty * durationWeight) + ((1 + stopsPenalty) * stopsWeight));
        return {
          ...offer,
          score: Math.round(score * 10) / 10,
          tradeoffs: this.describeTradeoffs(offer, minPrice, minDuration, minStops)
        };
      })
      .sort((a, b) => b.score - a.score);

    const recommendation = rankedOffers[0];
    return {
      rankedOffers,
      recommendation,
      rationale: recommendation
        ? `Best balance is ${recommendation.id}: ${this.formatPrice(recommendation)}, ${this.formatMinutes(this.totalDuration(recommendation))}, ${this.totalStops(recommendation)} total stops.`
        : 'No recommendation available.'
    };
  }

  createSearchLinks(input: FlightSearchInput): FlightDeepLinks {
    return this.createDeepLinks(this.normalizeSearchInput(input));
  }

  providerStatus(): ProviderStatus[] {
    return [
      {
        name: 'amadeus',
        enabled: this.hasAmadeusCredentials(),
        live: this.hasAmadeusCredentials(),
        purpose: 'Live flight search and pricing via Amadeus Flight Offers Search.',
        requiredEnv: ['AMADEUS_CLIENT_ID', 'AMADEUS_CLIENT_SECRET']
      },
      {
        name: 'aviationstack',
        enabled: this.hasAviationstackCredentials(),
        live: this.hasAviationstackCredentials(),
        purpose: 'Live flight status and schedule lookup via Aviationstack. Does not provide ticket fares.',
        requiredEnv: ['AVIATIONSTACK_API_KEY']
      },
      {
        name: 'mock',
        enabled: true,
        live: false,
        purpose: 'Deterministic demo offers used when live credentials are unavailable.'
      }
    ];
  }

  private normalizeSearchInput(input: FlightSearchInput): FlightSearchInput {
    const normalized: FlightSearchInput = {
      ...input,
      origin: input.origin.trim().toUpperCase(),
      destination: input.destination.trim().toUpperCase(),
      adults: input.adults ?? 1,
      children: input.children ?? 0,
      infants: input.infants ?? 0,
      cabinClass: input.cabinClass ?? 'ECONOMY',
      currencyCode: (input.currencyCode ?? 'USD').trim().toUpperCase(),
      provider: input.provider ?? 'auto',
      limit: Math.min(Math.max(input.limit ?? 10, 1), 50)
    };

    if (!/^[A-Z]{3}$/.test(normalized.origin) || !/^[A-Z]{3}$/.test(normalized.destination)) {
      throw new Error('Origin and destination must be 3-letter IATA airport or city codes.');
    }
    if (!this.isIsoDate(normalized.departureDate) || (normalized.returnDate && !this.isIsoDate(normalized.returnDate))) {
      throw new Error('Dates must use YYYY-MM-DD format.');
    }
    if (normalized.adults < 1) {
      throw new Error('At least one adult passenger is required.');
    }

    return normalized;
  }

  private resolveProvider(provider: FlightProvider = 'auto'): Exclude<FlightProvider, 'auto'> {
    if (provider === 'mock') {
      return 'mock';
    }
    if (provider === 'amadeus') {
      return this.hasAmadeusCredentials() ? 'amadeus' : 'mock';
    }
    if (provider === 'aviationstack') {
      return this.hasAviationstackCredentials() ? 'aviationstack' : 'mock';
    }
    if (this.hasAmadeusCredentials()) {
      return 'amadeus';
    }
    if (this.hasAviationstackCredentials()) {
      return 'aviationstack';
    }
    return 'mock';
  }

  private hasAmadeusCredentials(): boolean {
    return Boolean(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET);
  }

  private hasAviationstackCredentials(): boolean {
    return Boolean(process.env.AVIATIONSTACK_API_KEY);
  }

  private async searchAmadeus(input: FlightSearchInput): Promise<FlightOffer[]> {
    const token = await this.getAmadeusToken();
    const baseUrl = process.env.AMADEUS_BASE_URL ?? 'https://test.api.amadeus.com';
    const params = new URLSearchParams({
      originLocationCode: input.origin,
      destinationLocationCode: input.destination,
      departureDate: input.departureDate,
      adults: String(input.adults),
      currencyCode: input.currencyCode ?? 'USD',
      max: String(input.limit ?? 10)
    });

    if (input.returnDate) params.set('returnDate', input.returnDate);
    if (input.children) params.set('children', String(input.children));
    if (input.infants) params.set('infants', String(input.infants));
    if (input.cabinClass) params.set('travelClass', input.cabinClass);
    if (input.maxPrice) params.set('maxPrice', String(input.maxPrice));
    if (input.nonStop !== undefined) params.set('nonStop', String(input.nonStop));

    const response = await fetch(`${baseUrl}/v2/shopping/flight-offers?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Amadeus search failed (${response.status}): ${body.slice(0, 500)}`);
    }

    const payload = await response.json() as any;
    const carrierNames = payload.dictionaries?.carriers ?? {};

    return (payload.data ?? [])
      .map((offer: any, index: number) => this.normalizeAmadeusOffer(offer, input, carrierNames, index + 1))
      .filter((offer: FlightOffer) => input.maxStops === undefined || this.maxStopsPerItinerary(offer) <= input.maxStops)
      .sort((a: FlightOffer, b: FlightOffer) => a.price.total - b.price.total);
  }

  private async getAmadeusToken(): Promise<string> {
    if (this.amadeusToken && this.amadeusToken.expiresAt > Date.now() + 60_000) {
      return this.amadeusToken.accessToken;
    }

    const baseUrl = process.env.AMADEUS_BASE_URL ?? 'https://test.api.amadeus.com';
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.AMADEUS_CLIENT_ID ?? '',
      client_secret: process.env.AMADEUS_CLIENT_SECRET ?? ''
    });

    const response = await fetch(`${baseUrl}/v1/security/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Amadeus token request failed (${response.status}): ${errorBody.slice(0, 500)}`);
    }

    const payload = await response.json() as { access_token: string; expires_in: number };
    this.amadeusToken = {
      accessToken: payload.access_token,
      expiresAt: Date.now() + (payload.expires_in * 1000)
    };
    return payload.access_token;
  }

  private normalizeAmadeusOffer(offer: any, input: FlightSearchInput, carrierNames: Record<string, string>, rank: number): FlightOffer {
    const itineraries = (offer.itineraries ?? []).map((itinerary: any) => this.normalizeAmadeusItinerary(itinerary, carrierNames));
    const flightOffer: FlightOffer = {
      id: `amadeus-${offer.id ?? rank}`,
      provider: 'amadeus',
      providerOfferId: String(offer.id ?? rank),
      price: {
        total: Number(offer.price?.grandTotal ?? offer.price?.total ?? 0),
        currency: offer.price?.currency ?? input.currencyCode ?? 'USD'
      },
      itineraries,
      validatingAirlineCodes: offer.validatingAirlineCodes ?? [],
      bookableSeats: offer.numberOfBookableSeats,
      cabinClass: input.cabinClass,
      deepLinks: this.createDeepLinks(input),
      score: 0,
      tradeoffs: [],
      raw: offer
    };
    return {
      ...flightOffer,
      score: this.baseScore(flightOffer),
      tradeoffs: this.basicTradeoffs(flightOffer)
    };
  }

  private normalizeAmadeusItinerary(itinerary: any, carrierNames: Record<string, string>): FlightItinerary {
    const segments: FlightSegment[] = (itinerary.segments ?? []).map((segment: any) => ({
      departureAirport: segment.departure?.iataCode,
      arrivalAirport: segment.arrival?.iataCode,
      departureAt: segment.departure?.at,
      arrivalAt: segment.arrival?.at,
      carrierCode: segment.carrierCode,
      carrierName: carrierNames[segment.carrierCode],
      flightNumber: segment.number,
      aircraft: segment.aircraft?.code,
      durationMinutes: this.parseIsoDuration(segment.duration)
    }));

    return {
      durationMinutes: this.parseIsoDuration(itinerary.duration),
      stops: Math.max(segments.length - 1, 0),
      segments
    };
  }

  private async searchAviationstack(input: FlightSearchInput): Promise<{ offers: FlightOffer[]; warnings: string[] }> {
    const outbound = await this.fetchAviationstackFlights(input.origin, input.destination, input.departureDate, input.limit ?? 10);
    const returnFlights = input.returnDate
      ? await this.fetchAviationstackFlights(input.destination, input.origin, input.returnDate, input.limit ?? 10)
      : [];
    const warnings = [
      'Aviationstack returns flight schedules/status, not fare prices or ticket availability.'
    ];

    if (input.returnDate && outbound.length > 0 && returnFlights.length === 0) {
      warnings.push('No Aviationstack return-leg records matched the requested route/date; returned outbound schedule matches only.');
    }

    const count = Math.min(outbound.length, input.limit ?? 10);
    const offers: FlightOffer[] = [];

    for (let index = 0; index < count; index += 1) {
      const outboundItinerary = this.normalizeAviationstackItinerary(outbound[index]);
      const returnItinerary = input.returnDate && returnFlights[index]
        ? this.normalizeAviationstackItinerary(returnFlights[index])
        : undefined;
      const firstFlight = outbound[index]?.flight?.iata ?? outbound[index]?.flight?.icao ?? `route-${index + 1}`;
      const offer: FlightOffer = {
        id: `aviationstack-${firstFlight}-${index + 1}`.toLowerCase(),
        provider: 'aviationstack',
        providerOfferId: String(firstFlight),
        price: {
          total: 0,
          currency: input.currencyCode ?? 'USD',
          available: false
        },
        itineraries: returnItinerary ? [outboundItinerary, returnItinerary] : [outboundItinerary],
        validatingAirlineCodes: [outbound[index]?.airline?.iata ?? outbound[index]?.airline?.icao].filter(Boolean),
        cabinClass: input.cabinClass,
        deepLinks: this.createDeepLinks(input),
        score: 0,
        tradeoffs: [],
        raw: {
          outbound: outbound[index],
          return: returnFlights[index]
        }
      };
      offers.push({
        ...offer,
        score: this.baseScore(offer),
        tradeoffs: this.basicTradeoffs(offer)
      });
    }

    return {
      offers: offers
        .filter((offer) => input.maxStops === undefined || this.maxStopsPerItinerary(offer) <= input.maxStops)
        .sort((a, b) => this.totalDuration(a) - this.totalDuration(b)),
      warnings
    };
  }

  private async fetchAviationstackFlights(origin: string, destination: string, flightDate: string, limit: number): Promise<any[]> {
    const baseUrl = process.env.AVIATIONSTACK_BASE_URL ?? 'http://api.aviationstack.com/v1';
    const safeLimit = String(Math.min(Math.max(limit, 1), 100));
    const attempts: Array<Record<string, string>> = [
      { dep_iata: origin, arr_iata: destination, flight_date: flightDate, limit: safeLimit },
      { dep_iata: origin, flight_date: flightDate, limit: safeLimit },
      { dep_iata: origin, limit: safeLimit }
    ];
    let lastError: string | undefined;

    for (const attempt of attempts) {
      const params = new URLSearchParams({
        access_key: process.env.AVIATIONSTACK_API_KEY ?? '',
        ...attempt
      });
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/flights?${params.toString()}`);
      const body = await response.text();

      if (!response.ok) {
        lastError = `Aviationstack request failed (${response.status}): ${body.slice(0, 500)}`;
        if (response.status === 403 || response.status === 401) {
          continue;
        }
        throw new Error(lastError);
      }

      const payload = JSON.parse(body) as any;
      if (payload.error) {
        lastError = `Aviationstack error: ${JSON.stringify(payload.error).slice(0, 500)}`;
        if (payload.error.code === 'function_access_restricted' || payload.error.code === 'https_access_restricted') {
          continue;
        }
        throw new Error(lastError);
      }

      const records = Array.isArray(payload.data) ? payload.data : [];
      const filtered = records.filter((record: any) => {
        const matchesDestination = !destination || record.arrival?.iata === destination;
        const matchesDate = !flightDate || record.flight_date === flightDate;
        return matchesDestination && matchesDate;
      });
      return filtered.length > 0 ? filtered : records.filter((record: any) => record.arrival?.iata === destination);
    }

    throw new Error(lastError ?? 'Aviationstack request failed.');
  }

  private normalizeAviationstackItinerary(record: any): FlightItinerary {
    const departureAt = record.departure?.scheduled ?? record.departure?.estimated ?? record.departure?.actual ?? '';
    const arrivalAt = record.arrival?.scheduled ?? record.arrival?.estimated ?? record.arrival?.actual ?? '';
    const durationMinutes = this.minutesBetween(departureAt, arrivalAt);
    const carrierCode = record.airline?.iata ?? record.airline?.icao ?? '';
    const flightNumber = record.flight?.number ?? record.flight?.iata ?? record.flight?.icao;
    const segment: FlightSegment = {
      departureAirport: record.departure?.iata,
      arrivalAirport: record.arrival?.iata,
      departureAt,
      arrivalAt,
      carrierCode,
      carrierName: record.airline?.name,
      flightNumber,
      aircraft: record.aircraft?.iata ?? record.aircraft?.icao,
      durationMinutes
    };

    return {
      durationMinutes,
      stops: 0,
      segments: [segment]
    };
  }

  private searchMock(input: FlightSearchInput): FlightOffer[] {
    const currency = input.currencyCode ?? 'USD';
    const seed = this.seed(input.origin + input.destination + input.departureDate + (input.returnDate ?? ''));
    const basePrice = 320 + (seed % 420);
    const carriers = ['AI', 'EK', 'QR', 'LH', 'BA'];

    const offers: FlightOffer[] = [0, 1, 2, 3].map((index) => {
      const stops = index === 0 && input.nonStop ? 0 : index % 3;
      const totalDuration = 180 + ((seed + index * 83) % 900) + stops * 95;
      const price = basePrice + index * 85 - (stops * 35);
      const carrierCode = carriers[(seed + index) % carriers.length];
      const itinerary = this.mockItinerary(input, carrierCode, totalDuration, stops, index);
      const offer: FlightOffer = {
        id: `mock-${index + 1}`,
        provider: 'mock',
        providerOfferId: `mock-${input.origin}-${input.destination}-${index + 1}`,
        price: { total: Math.max(price, 99), currency },
        itineraries: input.returnDate
          ? [itinerary, this.mockItinerary({ ...input, origin: input.destination, destination: input.origin, departureDate: input.returnDate }, carrierCode, totalDuration + 40, stops, index + 4)]
          : [itinerary],
        validatingAirlineCodes: [carrierCode],
        bookableSeats: 7 - index,
        cabinClass: input.cabinClass,
        deepLinks: this.createDeepLinks(input),
        score: 0,
        tradeoffs: []
      };
      return {
        ...offer,
        score: this.baseScore(offer),
        tradeoffs: this.basicTradeoffs(offer)
      };
    });

    return offers
      .filter((offer) => input.maxPrice === undefined || offer.price.total <= input.maxPrice)
      .filter((offer) => input.maxStops === undefined || this.maxStopsPerItinerary(offer) <= input.maxStops)
      .sort((a, b) => a.price.total - b.price.total)
      .slice(0, input.limit ?? 10);
  }

  private mockItinerary(input: FlightSearchInput, carrierCode: string, durationMinutes: number, stops: number, index: number): FlightItinerary {
    const departureHour = 6 + ((index * 3) % 14);
    const departureAt = `${input.departureDate}T${String(departureHour).padStart(2, '0')}:20:00`;
    const arrivalAt = this.addMinutes(departureAt, durationMinutes);
    const segments: FlightSegment[] = [
      {
        departureAirport: input.origin,
        arrivalAirport: stops > 0 ? 'DXB' : input.destination,
        departureAt,
        arrivalAt: stops > 0 ? this.addMinutes(departureAt, Math.floor(durationMinutes / 2) - 45) : arrivalAt,
        carrierCode,
        carrierName: this.mockCarrierName(carrierCode),
        flightNumber: `${100 + index}`,
        durationMinutes: stops > 0 ? Math.floor(durationMinutes / 2) - 45 : durationMinutes
      }
    ];

    if (stops > 0) {
      segments.push({
        departureAirport: 'DXB',
        arrivalAirport: input.destination,
        departureAt: this.addMinutes(segments[0].arrivalAt, 90),
        arrivalAt,
        carrierCode,
        carrierName: this.mockCarrierName(carrierCode),
        flightNumber: `${200 + index}`,
        durationMinutes: Math.floor(durationMinutes / 2) - 45
      });
    }

    return {
      durationMinutes,
      stops,
      segments
    };
  }

  private createDeepLinks(input: FlightSearchInput): FlightDeepLinks {
    const tripType = input.returnDate ? 'roundtrip' : 'oneway';
    const googleFlights = new URL('https://www.google.com/travel/flights');
    googleFlights.searchParams.set('q', `${input.origin} to ${input.destination} ${input.departureDate}${input.returnDate ? ` returning ${input.returnDate}` : ''}`);

    const skyscanner = new URL(`https://www.skyscanner.com/transport/flights/${input.origin.toLowerCase()}/${input.destination.toLowerCase()}/${input.departureDate.replace(/-/g, '')}/${input.returnDate ? input.returnDate.replace(/-/g, '') : ''}`);
    skyscanner.searchParams.set('adults', String(input.adults));
    skyscanner.searchParams.set('cabinclass', (input.cabinClass ?? 'ECONOMY').toLowerCase());

    const kayak = new URL(`https://www.kayak.com/flights/${input.origin}-${input.destination}/${input.departureDate}${input.returnDate ? `/${input.returnDate}` : ''}`);
    kayak.searchParams.set('sort', 'bestflight_a');
    kayak.searchParams.set('fs', tripType);

    return {
      googleFlights: googleFlights.toString(),
      skyscanner: skyscanner.toString(),
      kayak: kayak.toString()
    };
  }

  private toSearchResult(
    provider: Exclude<FlightProvider, 'auto'>,
    live: boolean,
    query: FlightSearchInput,
    offers: FlightOffer[],
    warnings: string[]
  ): FlightSearchResult {
    const compared = this.compare(offers).rankedOffers;
    const pricedOffers = offers.filter((offer) => offer.price.available !== false && offer.price.total > 0);
    return {
      provider,
      live,
      searchedAt: new Date().toISOString(),
      query,
      summary: offers.length
        ? pricedOffers.length > 0
          ? `Found ${offers.length} ${live ? 'live' : 'mock'} flight options from ${query.origin} to ${query.destination}. Cheapest: ${this.formatPrice(pricedOffers[0])}.`
          : `Found ${offers.length} ${live ? 'live' : 'mock'} flight schedule options from ${query.origin} to ${query.destination}. Fares are not available from this provider.`
        : `No offers found from ${query.origin} to ${query.destination}.`,
      offers: compared,
      warnings
    };
  }

  private basicTradeoffs(offer: FlightOffer): string[] {
    const tradeoffs = [
      this.formatPrice(offer),
      `${this.formatMinutes(this.totalDuration(offer))} total travel time`,
      `${this.totalStops(offer)} total stops`
    ];
    if (offer.bookableSeats !== undefined) {
      tradeoffs.push(`${offer.bookableSeats} bookable seats reported`);
    }
    return tradeoffs;
  }

  private describeTradeoffs(offer: FlightOffer, minPrice: number, minDuration: number, minStops: number): string[] {
    const tradeoffs = this.basicTradeoffs(offer);
    if (offer.price.available !== false && minPrice > 0 && offer.price.total === minPrice) {
      tradeoffs.push('cheapest option');
    }
    if (this.totalDuration(offer) === minDuration) {
      tradeoffs.push('fastest option');
    }
    if (this.totalStops(offer) === minStops) {
      tradeoffs.push('fewest stops');
    }
    return tradeoffs;
  }

  private baseScore(offer: FlightOffer): number {
    const durationHours = Math.max(this.totalDuration(offer) / 60, 1);
    const stops = this.totalStops(offer);
    const priceComponent = offer.price.available === false ? 0 : Math.max(0, 1000 - offer.price.total) / 10;
    const durationComponent = Math.max(0, 24 - durationHours) * 2;
    const stopsComponent = Math.max(0, 3 - stops) * 8;
    return Math.round((priceComponent + durationComponent + stopsComponent) * 10) / 10;
  }

  private totalDuration(offer: FlightOffer): number {
    return offer.itineraries.reduce((sum, itinerary) => sum + itinerary.durationMinutes, 0);
  }

  private totalStops(offer: FlightOffer): number {
    return offer.itineraries.reduce((sum, itinerary) => sum + itinerary.stops, 0);
  }

  private maxStopsPerItinerary(offer: FlightOffer): number {
    return Math.max(...offer.itineraries.map((itinerary) => itinerary.stops));
  }

  private parseIsoDuration(value?: string): number {
    if (!value) {
      return 0;
    }
    const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!match) {
      return 0;
    }
    return (Number(match[1] ?? 0) * 60) + Number(match[2] ?? 0);
  }

  private addMinutes(isoLocal: string, minutes: number): string {
    const date = new Date(`${isoLocal}Z`);
    date.setUTCMinutes(date.getUTCMinutes() + minutes);
    return date.toISOString().replace('.000Z', '');
  }

  private minutesBetween(start?: string, end?: string): number {
    if (!start || !end) {
      return 0;
    }
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
      return 0;
    }
    return Math.round((endMs - startMs) / 60_000);
  }

  private formatPrice(offer: FlightOffer): string {
    return offer.price.available === false
      ? 'fare unavailable'
      : `${offer.price.currency} ${offer.price.total}`;
  }

  private formatMinutes(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  private isIsoDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  }

  private seed(value: string): number {
    return value.split('').reduce((sum, character) => sum + character.charCodeAt(0), 0);
  }

  private mockCarrierName(code: string): string {
    const carriers: Record<string, string> = {
      AI: 'Air India',
      EK: 'Emirates',
      QR: 'Qatar Airways',
      LH: 'Lufthansa',
      BA: 'British Airways'
    };
    return carriers[code] ?? code;
  }
}

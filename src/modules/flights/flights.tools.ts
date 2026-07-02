import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';
import { FlightsService } from './flights.service.js';
import { CABIN_CLASSES, FLIGHT_PROVIDERS } from './flights.types.js';

const searchSchema = z.object({
  origin: z.string().length(3).describe('3-letter IATA origin airport or city code, for example BLR or SFO'),
  destination: z.string().length(3).describe('3-letter IATA destination airport or city code'),
  departureDate: z.string().describe('Departure date in YYYY-MM-DD format'),
  returnDate: z.string().optional().describe('Return date in YYYY-MM-DD format for round trips'),
  adults: z.number().int().min(1).default(1).describe('Adult passenger count'),
  children: z.number().int().min(0).default(0).optional().describe('Child passenger count'),
  infants: z.number().int().min(0).default(0).optional().describe('Infant passenger count'),
  cabinClass: z.enum(CABIN_CLASSES).default('ECONOMY').optional().describe('Cabin class'),
  currencyCode: z.string().length(3).default('USD').optional().describe('3-letter currency code'),
  maxPrice: z.number().positive().optional().describe('Maximum total price'),
  maxStops: z.number().int().min(0).optional().describe('Maximum stops per itinerary'),
  nonStop: z.boolean().optional().describe('Only direct flights when true'),
  provider: z.enum(FLIGHT_PROVIDERS).default('auto').optional().describe('Provider to use. auto uses Amadeus when credentials exist, otherwise mock.'),
  limit: z.number().int().min(1).max(50).default(10).optional().describe('Maximum offers to return')
});

export class FlightsTools {
  private readonly flights = new FlightsService();

  @Tool({
    name: 'search_flights',
    description: 'Search and rank flight offers. Uses Amadeus live search when credentials are configured, with mock fallback for demos.',
    inputSchema: searchSchema
  })
  async searchFlights(input: any, ctx: ExecutionContext) {
    ctx.logger.info('Searching flights', {
      origin: input.origin,
      destination: input.destination,
      departureDate: input.departureDate,
      provider: input.provider
    });
    return this.flights.search(input);
  }

  @Tool({
    name: 'compare_flight_offers',
    description: 'Compare normalized flight offers by price, total duration, and stops, then recommend the best balanced option.',
    inputSchema: z.object({
      offers: z.array(z.any()).describe('Flight offers returned by search_flights'),
      priceWeight: z.number().min(0).max(1).default(0.45).optional().describe('How strongly to prioritize price'),
      durationWeight: z.number().min(0).max(1).default(0.35).optional().describe('How strongly to prioritize duration'),
      stopsWeight: z.number().min(0).max(1).default(0.2).optional().describe('How strongly to prioritize fewer stops')
    })
  })
  async compareFlightOffers(input: any, ctx: ExecutionContext) {
    ctx.logger.info('Comparing flight offers', { count: input.offers?.length ?? 0 });
    return this.flights.compare(input.offers ?? [], {
      priceWeight: input.priceWeight,
      durationWeight: input.durationWeight,
      stopsWeight: input.stopsWeight
    });
  }

  @Tool({
    name: 'create_flight_search_links',
    description: 'Create user-facing flight search links for Google Flights, Skyscanner, and Kayak from the same route and date query.',
    inputSchema: searchSchema
  })
  async createFlightSearchLinks(input: any, ctx: ExecutionContext) {
    ctx.logger.info('Creating flight search links', {
      origin: input.origin,
      destination: input.destination
    });
    return {
      links: this.flights.createSearchLinks(input),
      note: 'These are search/deep links, not guaranteed booking checkout links. Use provider search results before purchase.'
    };
  }

  @Tool({
    name: 'list_flight_providers',
    description: 'List configured flight providers and whether live search credentials are available.',
    inputSchema: z.object({})
  })
  async listFlightProviders(_input: any, ctx: ExecutionContext) {
    ctx.logger.info('Listing flight providers');
    return {
      providers: this.flights.providerStatus()
    };
  }
}

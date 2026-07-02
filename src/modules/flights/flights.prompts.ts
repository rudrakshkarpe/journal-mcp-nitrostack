import { PromptDecorator as Prompt, ExecutionContext } from '@nitrostack/core';

export class FlightsPrompts {
  @Prompt({
    name: 'flight_concierge_search',
    description: 'Plan a flight search with tradeoff-aware comparison.',
    arguments: [
      {
        name: 'trip',
        description: 'Natural language trip request, including route, dates, passengers, and preferences',
        required: true
      }
    ]
  })
  async search(args: any, ctx: ExecutionContext) {
    ctx.logger.info('Generating flight concierge prompt');

    return [
      {
        role: 'user' as const,
        content: `Turn this trip request into a structured flight search, call search_flights, compare the returned offers, and explain the best options with tradeoffs: ${args.trip}`
      }
    ];
  }
}

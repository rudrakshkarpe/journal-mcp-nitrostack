import { ResourceDecorator as Resource, ExecutionContext } from '@nitrostack/core';
import { FlightsService } from './flights.service.js';

export class FlightsResources {
  private readonly flights = new FlightsService();

  @Resource({
    uri: 'flight-concierge://providers',
    name: 'Flight Provider Status',
    description: 'Configured flight provider availability and required credentials.',
    mimeType: 'application/json'
  })
  async getProviders(uri: string, ctx: ExecutionContext) {
    ctx.logger.info('Fetching flight provider status');
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ providers: this.flights.providerStatus() }, null, 2)
      }]
    };
  }
}

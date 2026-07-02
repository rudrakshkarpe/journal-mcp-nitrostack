import { Module } from '@nitrostack/core';
import { FlightsPrompts } from './flights.prompts.js';
import { FlightsResources } from './flights.resources.js';
import { FlightsTools } from './flights.tools.js';

@Module({
  name: 'flights',
  description: 'Flight concierge tools for searching, comparing, and planning trips',
  controllers: [FlightsTools, FlightsResources, FlightsPrompts]
})
export class FlightsModule {}

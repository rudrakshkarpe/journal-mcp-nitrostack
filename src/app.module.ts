import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { FlightsModule } from './modules/flights/flights.module.js';
import { SystemHealthCheck } from './health/system.health.js';

@McpApp({
  module: AppModule,
  server: {
    name: 'flight-concierge-mcp',
    version: '1.0.0'
  },
  logging: {
    level: 'info'
  }
})
@Module({
  name: 'app',
  description: 'Root application module',
  imports: [
    ConfigModule.forRoot(),
    FlightsModule
  ],
  providers: [
    SystemHealthCheck,
  ]
})
export class AppModule {}

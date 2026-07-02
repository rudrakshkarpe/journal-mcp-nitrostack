# Flight Concierge MCP

NitroStack MCP server for searching, comparing, and planning flights.

This replaces the original journal-memory experiment with a more MCP-native
travel workflow: live tools, provider adapters, normalized offers, search links,
and agent-friendly tradeoff analysis.

## What It Does

- Searches flights using Amadeus when credentials are configured.
- Falls back to deterministic mock offers when credentials are missing.
- Compares offers by price, total duration, and stops.
- Creates search links for Google Flights, Skyscanner, and Kayak.
- Exposes provider status so an MCP client can tell whether results are live.

## MCP Tools

- `search_flights`
- `compare_flight_offers`
- `create_flight_search_links`
- `list_flight_providers`

## Environment

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

For live Amadeus search:

```bash
AMADEUS_BASE_URL=https://test.api.amadeus.com
AMADEUS_CLIENT_ID=your_client_id
AMADEUS_CLIENT_SECRET=your_client_secret
```

Without credentials, `search_flights` still works with mock data so demos and
MCP client integration can be tested immediately.

## Quick Start

```bash
npm install
npm run dev
```

## Example MCP Call

```json
{
  "origin": "BLR",
  "destination": "SFO",
  "departureDate": "2026-08-14",
  "returnDate": "2026-08-28",
  "adults": 1,
  "cabinClass": "ECONOMY",
  "currencyCode": "USD",
  "maxStops": 1,
  "limit": 5
}
```

Example user prompt:

```text
Use the flight concierge MCP to find BLR to SFO flights for 2026-08-14,
returning 2026-08-28, economy, one adult, max one stop. Compare the options by
price, duration, and stops, then recommend the best tradeoff.
```

## Provider Roadmap

- Amadeus: live flight search and pricing.
- Duffel: future booking, order management, seats, and bags.
- Skyscanner: future partner/deep-link search provider if API access is
  approved.

The server intentionally does not ticket or take payment yet. Real booking needs
passenger PII, payment handling, refunds, provider compliance, and strong user
confirmation flows.

## Commands

```bash
npm run dev
npm run build
npm start
```

## NitroStudio

Open this folder in NitroStudio to test tools visually, inspect payloads, and
chat with the MCP server.

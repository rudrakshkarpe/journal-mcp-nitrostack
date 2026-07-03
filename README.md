# Flight Concierge MCP

Flight Concierge MCP is a NitroStack-based Model Context Protocol server for searching, comparing, and planning flights across multiple providers.

It gives an assistant a provider-aware travel workflow: call live tools, inspect provider availability, normalize structured results, compare tradeoffs, and hand the user useful next actions.

## Current Status

- Runtime: NitroStack MCP SDK with TypeScript.
- MCP server name: `flight-concierge-mcp`.
- Codex MCP alias used during testing: `flight-mate-mcp`.
- Deployment target: NitroStack Cloud.
- Public GitHub repository: `flight-concierge-nitrostack`.
- Live provider support:
  - Amadeus for priced flight offers when Amadeus credentials are configured.
  - Aviationstack for live flight schedule and status data when an Aviationstack API key is configured.
  - Mock fallback for deterministic demos when no live provider credentials are available.

<details>
<summary><strong>Screenshots from the build</strong></summary>

### Nitro Studio App Canvas

This is the Nitro Studio view of the MCP app after the flight module was built. The canvas shows the central NitroStack agent connected to the flight tools, provider status resource, health checks, and the reusable flight search prompt.

![Nitro Studio App Canvas](docs/assets/nitro-studio-app-canvas.png)

### NitroStack Cloud Deployment Logs

This screenshot captures the NitroStack Cloud deployment pipeline processing the MCP app, building the TypeScript production bundle, and preparing the cloud deployment.

![NitroStack Cloud Deployment Logs](docs/assets/nitrocloud-deployment-logs.png)

</details>

## What This Server Does

The server exposes flight planning capabilities to any MCP-compatible client. In Codex, Claude Desktop, Cursor, or another MCP client, the assistant can use this server to:

- List which flight providers are configured and whether each one is live.
- Search for flights by origin, destination, departure date, return date, passenger count, cabin class, currency, maximum price, and stop preference.
- Use Amadeus when real fare search credentials are available.
- Use Aviationstack when live flight schedules/status are available.
- Fall back to predictable mock data so the MCP integration can still be tested without paid provider credentials.
- Compare returned offers by price, total duration, and number of stops.
- Generate user-facing search links for Google Flights, Skyscanner, and Kayak.
- Provide an agent prompt that turns a natural-language trip request into a structured search and comparison workflow.

<details>
<summary><strong>Project structure</strong></summary>

```text
.
├── .env.example
├── README.md
├── docs/
│   └── assets/
│       ├── nitro-studio-app-canvas.png
│       └── nitrocloud-deployment-logs.png
├── package.json
├── package-lock.json
├── src/
│   ├── app.module.ts
│   ├── health/
│   │   └── system.health.ts
│   ├── index.ts
│   └── modules/
│       └── flights/
│           ├── flights.module.ts
│           ├── flights.prompts.ts
│           ├── flights.resources.ts
│           ├── flights.service.ts
│           ├── flights.tools.ts
│           └── flights.types.ts
└── tsconfig.json
```

</details>

<details>
<summary><strong>How we built it from scratch</strong></summary>

### 1. Created A NitroStack MCP Project

The project was created as a TypeScript NitroStack MCP server. The important runtime dependencies are:

```json
{
  "@nitrostack/core": "^1",
  "@nitrostack/cli": "^1",
  "typescript": "^5.3.3",
  "zod": "^3.22.4",
  "dotenv": "^16.3.1"
}
```

NitroStack provides the MCP decorators and server runtime. Zod is used to describe and validate tool inputs. Dotenv loads local environment variables.

### 2. Registered The Root MCP App

The root app lives in `src/app.module.ts`.

It registers:

- The MCP server name: `flight-concierge-mcp`.
- The app module.
- NitroStack config loading.
- System health checks.
- The flight module.

The app starts from `src/index.ts`, which imports environment variables, creates the NitroStack MCP application, and starts the server.

### 3. Added A Dedicated Flights Module

The flight feature is isolated under `src/modules/flights`.

The module is intentionally split into small MCP-facing files:

- `flights.module.ts` wires the feature into NitroStack.
- `flights.tools.ts` exposes callable MCP tools.
- `flights.resources.ts` exposes provider status as an MCP resource.
- `flights.prompts.ts` exposes a reusable agent prompt.
- `flights.service.ts` contains provider logic, normalization, comparison, and search-link generation.
- `flights.types.ts` defines normalized search inputs, offers, itineraries, segments, and provider status.

### 4. Designed The MCP Tool Surface

The MCP server exposes four tools.

| Tool | Purpose |
| --- | --- |
| `list_flight_providers` | Shows which providers are configured, enabled, and live. |
| `search_flights` | Searches flights using `auto`, `amadeus`, `aviationstack`, or `mock`. |
| `compare_flight_offers` | Ranks normalized offers using price, duration, and stops. |
| `create_flight_search_links` | Creates Google Flights, Skyscanner, and Kayak search links for the same route and dates. |

The main search input supports:

- `origin`: 3-letter IATA code, such as `BLR`.
- `destination`: 3-letter IATA code, such as `SFO`.
- `departureDate`: `YYYY-MM-DD`.
- `returnDate`: optional `YYYY-MM-DD`.
- `adults`: default `1`.
- `children`: optional.
- `infants`: optional.
- `cabinClass`: `ECONOMY`, `PREMIUM_ECONOMY`, `BUSINESS`, or `FIRST`.
- `currencyCode`: default `USD`.
- `maxPrice`: optional.
- `maxStops`: optional.
- `nonStop`: optional boolean.
- `provider`: `auto`, `amadeus`, `aviationstack`, or `mock`.
- `limit`: result limit from `1` to `50`.

### 5. Added Provider Routing

The server uses provider routing so the client can ask for a specific provider or let the server decide.

Provider order in `auto` mode:

1. Use Amadeus if `AMADEUS_CLIENT_ID` and `AMADEUS_CLIENT_SECRET` are configured.
2. Use Aviationstack if `AVIATIONSTACK_API_KEY` is configured.
3. Use mock data if no live credentials are configured.

This lets the same MCP tool work in local development, demos, and production.

### 6. Added Amadeus Fare Search Support

Amadeus is used for real fare search when credentials exist.

The Amadeus integration:

- Requests an OAuth token with client credentials.
- Caches the token until it is close to expiry.
- Calls the Flight Offers Search endpoint.
- Maps Amadeus itineraries and segments into the local normalized `FlightOffer` shape.
- Preserves raw provider data for debugging.
- Sorts results by price.
- Applies stop filters when requested.

Environment variables:

```bash
AMADEUS_BASE_URL=https://test.api.amadeus.com
AMADEUS_CLIENT_ID=your_client_id
AMADEUS_CLIENT_SECRET=your_client_secret
```

### 7. Added Aviationstack Schedule/Status Support

Aviationstack is used for live flight schedules and status data.

Important limitation: Aviationstack does not provide ticket fares or checkout availability. It can return live schedule/status style data, including flight dates, airlines, flight numbers, airports, times, gates, and terminals depending on the plan and record.

The server handles that by returning normalized flight offers with:

- `provider: "aviationstack"`.
- Live itinerary and segment details.
- `price.available: false`.
- A warning that fares are not available from this provider.
- Search links so the user can continue into a consumer flight search surface.

Environment variables:

```bash
AVIATIONSTACK_BASE_URL=http://api.aviationstack.com/v1
AVIATIONSTACK_API_KEY=your_aviationstack_key
```

Some Aviationstack plans restrict specific filters or HTTPS access. The service therefore tries route/date filters first, then broader departure-date and departure-airport lookups, then filters client-side when possible.

### 8. Added Mock Fallback

Mock data is not meant to pretend to be real availability. It exists for MCP integration testing.

When no live provider credentials are present, the mock provider:

- Generates deterministic offers from the route and date.
- Returns consistent prices and durations for repeatable demos.
- Supports stop filters and max-price filters.
- Includes search links.

This lets the server stay usable even before API keys are added.

### 9. Added Normalized Ranking

All providers are normalized into the same `FlightOffer` shape.

The comparison tool ranks offers with configurable weights:

```json
{
  "priceWeight": 0.45,
  "durationWeight": 0.35,
  "stopsWeight": 0.2
}
```

The comparison result includes:

- Ranked offers.
- Best recommendation.
- A short rationale.
- Tradeoff notes such as cheapest, fastest, fewer stops, or unavailable fares.

### 10. Added Search Links

The server creates links for:

- Google Flights.
- Skyscanner.
- Kayak.

These links are search/deep links. They are not guaranteed checkout links, and they should be treated as a handoff into a booking provider.

### 11. Added Nitro Studio And Cloud Deployment

After the server was built, we opened it in Nitro Studio and verified that NitroStack recognized:

- Tools.
- Resources.
- Prompts.
- Health checks.
- The central MCP agent.

Then we deployed it through NitroStack Cloud. The deployment pipeline built the TypeScript production bundle and published the MCP service URL.

</details>

<details>
<summary><strong>MCP resource reference</strong></summary>

### `flight-concierge://providers`

Returns provider availability as JSON.

Example shape:

```json
{
  "providers": [
    {
      "name": "amadeus",
      "enabled": false,
      "live": false,
      "purpose": "Live flight search and pricing via Amadeus Flight Offers Search.",
      "requiredEnv": ["AMADEUS_CLIENT_ID", "AMADEUS_CLIENT_SECRET"]
    },
    {
      "name": "aviationstack",
      "enabled": true,
      "live": true,
      "purpose": "Live flight status and schedule lookup via Aviationstack. Does not provide ticket fares.",
      "requiredEnv": ["AVIATIONSTACK_API_KEY"]
    },
    {
      "name": "mock",
      "enabled": true,
      "live": false,
      "purpose": "Deterministic demo offers used when live credentials are unavailable."
    }
  ]
}
```

</details>

<details>
<summary><strong>MCP prompt reference</strong></summary>

### `flight_concierge_search`

This prompt turns a natural-language trip request into an agent workflow:

1. Parse the trip request.
2. Call `search_flights`.
3. Compare the returned offers.
4. Explain the best tradeoffs.

Example prompt argument:

```json
{
  "trip": "Find BLR to SFO flights departing 2026-08-14 and returning 2026-08-28, economy, one adult, max one stop."
}
```

</details>

<details>
<summary><strong>Local setup</strong></summary>

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Local Environment File

```bash
cp .env.example .env
```

Add only the provider credentials you actually have.

For Aviationstack schedule/status:

```bash
AVIATIONSTACK_BASE_URL=http://api.aviationstack.com/v1
AVIATIONSTACK_API_KEY=your_aviationstack_key
```

For Amadeus priced flight offers:

```bash
AMADEUS_BASE_URL=https://test.api.amadeus.com
AMADEUS_CLIENT_ID=your_client_id
AMADEUS_CLIENT_SECRET=your_client_secret
```

Do not commit `.env`.

### 3. Run In Development

```bash
npm run dev
```

### 4. Build Production Bundle

```bash
npm run build
```

### 5. Start Production Server

```bash
npm run start:prod
```

</details>

<details>
<summary><strong>Connect the deployed server to Codex</strong></summary>

The deployed NitroStack MCP endpoint used in this build is:

```text
https://flight-mate-mcp-6a46b757-rudrakshs-org-7b2c8991.app.nitrocloud.ai/mcp
```

Add it to Codex:

```bash
codex mcp add flight-mate-mcp --url https://flight-mate-mcp-6a46b757-rudrakshs-org-7b2c8991.app.nitrocloud.ai/mcp
```

List configured MCP servers:

```bash
codex mcp list
```

Remove and re-add if the deployment URL changes:

```bash
codex mcp remove flight-mate-mcp
codex mcp add flight-mate-mcp --url https://your-new-nitrostack-url.app.nitrocloud.ai/mcp
```

</details>

<details>
<summary><strong>Example Codex prompts</strong></summary>

List providers:

```text
Use flight-mate-mcp to list flight providers.
```

Search a route with Aviationstack schedule data:

```text
Use flight-mate-mcp to search BLR to GOI flights departing 2026-07-03 using aviationstack, limit 2.
```

Search a long-haul itinerary:

```text
Use flight-mate-mcp to search BLR to SFO flights departing 2026-08-14, returning 2026-08-28, economy, one adult, max one stop.
```

Compare offers:

```text
Use flight-mate-mcp to compare these flight offers by price, duration, and stops, then recommend the best balanced option.
```

Create links:

```text
Use flight-mate-mcp to create flight search links for BLR to SFO departing 2026-08-14 and returning 2026-08-28.
```

</details>

<details>
<summary><strong>Example tool payloads</strong></summary>

### `search_flights`

```json
{
  "origin": "BLR",
  "destination": "SFO",
  "departureDate": "2026-08-14",
  "returnDate": "2026-08-28",
  "adults": 1,
  "children": 0,
  "infants": 0,
  "cabinClass": "ECONOMY",
  "currencyCode": "USD",
  "maxStops": 1,
  "provider": "auto",
  "limit": 5
}
```

### `compare_flight_offers`

```json
{
  "offers": [],
  "priceWeight": 0.45,
  "durationWeight": 0.35,
  "stopsWeight": 0.2
}
```

### `create_flight_search_links`

```json
{
  "origin": "BLR",
  "destination": "SFO",
  "departureDate": "2026-08-14",
  "returnDate": "2026-08-28",
  "adults": 1,
  "cabinClass": "ECONOMY"
}
```

</details>

<details>
<summary><strong>Deploy to NitroStack Cloud</strong></summary>

There are two practical deployment paths.

### Option A: Deploy From GitHub

1. Push this repository to GitHub.
2. Open NitroStack Cloud.
3. Create or open the MCP app.
4. Link the app to the GitHub repository.
5. Add environment variables in the cloud app settings.
6. Deploy.
7. Copy the generated service URL.
8. Add `/mcp` when connecting from Codex or another MCP client.

### Option B: Upload A Zip Package

Create a clean upload package:

```bash
zip -r ../flight-concierge-mcp.zip . \
  -x '.git/*' \
  -x 'node_modules/*' \
  -x 'dist/*' \
  -x '*.zip' \
  -x '.env'
```

Upload the zip in NitroStack Cloud, set the same environment variables, and deploy.

</details>

<details>
<summary><strong>Environment variables</strong></summary>

| Variable | Required | Used By | Description |
| --- | --- | --- | --- |
| `AMADEUS_BASE_URL` | No | Amadeus | Defaults to `https://test.api.amadeus.com`. |
| `AMADEUS_CLIENT_ID` | For Amadeus | Amadeus | Amadeus API client id. |
| `AMADEUS_CLIENT_SECRET` | For Amadeus | Amadeus | Amadeus API client secret. |
| `AVIATIONSTACK_BASE_URL` | No | Aviationstack | Defaults to `http://api.aviationstack.com/v1`. |
| `AVIATIONSTACK_API_KEY` | For Aviationstack | Aviationstack | Aviationstack API key. |

</details>

<details>
<summary><strong>Security notes</strong></summary>

- API keys must stay in `.env` locally or NitroStack Cloud environment variables.
- `.env` is intentionally not committed.
- `.env.example` is committed so setup is reproducible without exposing secrets.
- Aviationstack and Amadeus responses may include operational flight data; avoid logging sensitive user data around trip planning in production.
- This server does not process payments or book tickets.

</details>

<details>
<summary><strong>Verification</strong></summary>

The codebase has been verified with:

```bash
npm run build
npm audit --omit=dev --json
```

The deployed MCP server was also tested from Codex:

- `list_flight_providers` returned Aviationstack as enabled/live after the cloud API key was added.
- `search_flights` returned live Aviationstack schedule data for a BLR to GOI test search.
- The result correctly warned that Aviationstack does not return fares.

</details>

<details>
<summary><strong>Limitations</strong></summary>

- Aviationstack does not return ticket prices.
- Amadeus credentials are needed for real fare shopping.
- Skyscanner is currently represented through generated search links, not a direct Skyscanner partner API integration.
- The server does not book, ticket, cancel, refund, collect payment, or store traveler PII.
- Provider availability depends on your API plan, rate limits, and allowed endpoint filters.

</details>

<details>
<summary><strong>Future improvements</strong></summary>

- Add Duffel or another booking-capable provider for real order creation.
- Add airport and city-code lookup tools.
- Add fare calendar search for flexible travel dates.
- Add saved travel preferences, such as preferred airlines, airports, max layover, and baggage expectations.
- Add cached provider responses for repeated searches.
- Add stricter result provenance and provider-specific confidence notes.
- Add integration tests around provider fallback behavior.

</details>

<details>
<summary><strong>Useful commands</strong></summary>

```bash
npm run dev
npm run build
npm start
npm run start:prod
npm run upgrade
```

</details>

<details>
<summary><strong>Repository hygiene</strong></summary>

Before pushing:

```bash
git status --short
npm run build
npm audit --omit=dev --json
git add README.md docs/assets .env.example package.json package-lock.json src tsconfig.json
git commit -m "Document Flight Concierge MCP build"
git push origin main
```

The repository should contain documentation, source, lockfile, and screenshots. It should not contain:

- `.env`
- `node_modules`
- `dist`
- local zip files
- provider secrets

</details>

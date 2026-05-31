# eToro API documentation index

The eToro Developer Portal describes the public API as supporting real-time market data, order management, social trading features, watchlists, feeds, and portfolio management. Access requires a verified eToro account for the API key to appear in account settings.

## Core entry points

- [Introduction](https://api-portal.etoro.com/index.md) — Welcome to the eToro Developer Portal.
- [API Reference landing page](https://api-portal.etoro.com/api-reference) — Main reference area for endpoint documentation.
- [Documentation index file](https://api-portal.etoro.com/llms.txt) — Machine-readable list of documentation pages.
- [OpenAPI specification](https://api-portal.etoro.com/api-reference/openapi.json) — Full OpenAPI spec published by eToro.
- [Agent skill file](https://api-portal.etoro.com/ai-agents/etoro-skill.md) — Agent integration guide.

## Getting started

- [Authentication](https://api-portal.etoro.com/getting-started/authentication.md)
- [Rate Limits](https://api-portal.etoro.com/getting-started/rate-limits.md)

## Guides

- [Calculate Available Cash](https://api-portal.etoro.com/guides/calculate-available-cash.md)
- [Calculate Equity](https://api-portal.etoro.com/guides/calculate-equity.md)
- [Calculate Profit/Loss](https://api-portal.etoro.com/guides/calculate-profit-loss.md)
- [Calculate Total Invested](https://api-portal.etoro.com/guides/calculate-total-invested.md)
- [Find Instrument ID](https://api-portal.etoro.com/guides/get-instrument-id.md)
- [Open and close market orders](https://api-portal.etoro.com/guides/market-orders.md)
- [Manage your Watchlists](https://api-portal.etoro.com/guides/watchlists.md)

## API reference

### Agent portfolios

- [Create Agent Portfolio](https://api-portal.etoro.com/api-reference/agent-portfolios/create-agent-portfolio.md) — Creates a new agent-portfolio with its own virtual balance and copy-trade funding model.
- [Create User Token](https://api-portal.etoro.com/api-reference/agent-portfolios/create-user-token.md) — Creates a new user token for an agent-portfolio.
- [Delete Agent Portfolio](https://api-portal.etoro.com/api-reference/agent-portfolios/delete-agent-portfolio.md) — Removes an agent-portfolio, revokes tokens, and stops copy mirror activity.
- [Delete User Token](https://api-portal.etoro.com/api-reference/agent-portfolios/delete-user-token.md) — Revokes a specific user token.
- [Get Agent Portfolios](https://api-portal.etoro.com/api-reference/agent-portfolios/get-agent-portfolios.md) — Lists agent-portfolios belonging to the authenticated user.
- [Update User Token](https://api-portal.etoro.com/api-reference/agent-portfolios/update-user-token.md) — Updates settings of an existing user token.

### Comments and feeds

- [Create a comment on a post](https://api-portal.etoro.com/api-reference/comments/create-a-comment-on-a-post.md) — Creates a comment with text, mentions, tags, and attachments.
- [Create a new discussion post](https://api-portal.etoro.com/api-reference/feeds/create-a-new-discussion-post.md) — Creates posts for instruments, users, or general discussions.
- [Get instrument feed posts](https://api-portal.etoro.com/api-reference/feeds/get-instrument-feed-posts.md) — Retrieves posts associated with a financial instrument.
- [Get user feed posts](https://api-portal.etoro.com/api-reference/feeds/get-user-feed-posts.md) — Retrieves posts associated with a specific user.

### Identity

- [Get authenticated user identity](https://api-portal.etoro.com/api-reference/identity/get-authenticated-user-identity.md) — Returns GCID plus real and demo customer IDs for the authenticated user.

### Market data

- [Fetch available instrument types (asset classes) such as stocks, ETFs, commodities, etc.](https://api-portal.etoro.com/api-reference/market-data/fetch-available-instrument-types-asset-classes-such-as-stocks-etfs-commodities-etc.md)
- [Get historical candles data for an instrument](https://api-portal.etoro.com/api-reference/market-data/get-historical-candles-data-for-an-instrument.md) — OHLCV candles from one minute to one week.
- [Get historical closing prices for all instruments](https://api-portal.etoro.com/api-reference/market-data/get-historical-closing-prices-for-all-instruments.md)
- [Gets data on available stocks industries](https://api-portal.etoro.com/api-reference/market-data/gets-data-on-available-stocks-industries.md)
- [Retrieve current market rates and pricing information for specified instruments](https://api-portal.etoro.com/api-reference/market-data/retrieve-current-market-rates-and-pricing-information-for-specified-instruments.md) — Real-time bid/ask, conversion, and execution pricing data.
- [Retrieves a list of exchanges supported by the platform along with basic descriptive data.](https://api-portal.etoro.com/api-reference/market-data/retrieves-a-list-of-exchanges-supported-by-the-platform-along-with-basic-descriptive-data.md)
- [Retrieves metadata for specified instruments, including display names, exchange IDs, and classification.](https://api-portal.etoro.com/api-reference/market-data/retrieves-metadata-for-specified-instruments-including-display-names-exchange-ids-and-classification.md)
- [Search for Instruments](https://api-portal.etoro.com/api-reference/market-data/search-for-instruments.md) — Searches instruments with filter and projection options.

### PI data

- [Get copiers public info](https://api-portal.etoro.com/api-reference/pi-data/get-copiers-public-info.md)

### Trading demo

- [Cancels a Market-if-touched order that has not yet been executed.](https://api-portal.etoro.com/api-reference/trading--demo/cancels-a-market-if-touched-order-that-has-not-yet-been-executed.md)
- [Cancels a market order for open before it is executed.](https://api-portal.etoro.com/api-reference/trading--demo/cancels-a-market-order-for-open-before-it-is-executed.md)
- [Cancels a pending market order for close for the specified order ID.](https://api-portal.etoro.com/api-reference/trading--demo/cancels-a-pending-market-order-for-close-for-the-specified-order-id.md)
- [Create a market order to open a position by specifying the amount of cash you would like to use in the trade.](https://api-portal.etoro.com/api-reference/trading--demo/create-a-market-order-to-open-a-position-by-specifying-the-amount-of-cash-you-would-like-to-use-in-the-trade.md)
- [Creates a market order to close a position or partially close it by specifying the number of units to deduct.](https://api-portal.etoro.com/api-reference/trading--demo/creates-a-market-order-to-close-a-position-or-partially-close-it-by-specifying-the-number-of-units-to-deduct.md)
- [Get Demo Account PnL and Portfolio Details](https://api-portal.etoro.com/api-reference/trading--demo/get-demo-account-pnl-and-portfolio-details.md)
- [Get Order Information and Position Details for Demo Account](https://api-portal.etoro.com/api-reference/trading--demo/get-order-information-and-position-details-for-demo-account.md)
- [Places a Market-if-touched order (similar to Limit order) to open a position when a threshold price is reached.](https://api-portal.etoro.com/api-reference/trading--demo/places-a-market-if-touched-order-similar-to-limit-order-to-open-a-position-when-a-threshold-price-is-reached.md)
- [Places a Market Order to open a position by specifying the number of units you would like to trade.](https://api-portal.etoro.com/api-reference/trading--demo/places-a-market-order-to-open-a-position-by-specifying-the-number-of-units-you-would-like-to-trade.md)
- [Retrieve comprehensive portfolio information including positions, orders, and account status](https://api-portal.etoro.com/api-reference/trading--demo/retrieve-comprehensive-portfolio-information-including-positions-orders-and-account-status.md)

### Trading real

- [Cancels a Market-if-touched order that has not yet been executed.](https://api-portal.etoro.com/api-reference/trading--real/cancels-a-market-if-touched-order-that-has-not-yet-been-executed.md)
- [Cancels a market order for open before it is executed.](https://api-portal.etoro.com/api-reference/trading--real/cancels-a-market-order-for-open-before-it-is-executed.md)
- [Cancels a pending market order for close for the specified order ID.](https://api-portal.etoro.com/api-reference/trading--real/cancels-a-pending-market-order-for-close-for-the-specified-order-id.md)
- [Create a market order to open a position by specifying the amount of cash you would like to use in the trade.](https://api-portal.etoro.com/api-reference/trading--real/create-a-market-order-to-open-a-position-by-specifying-the-amount-of-cash-you-would-like-to-use-in-the-trade.md)
- [Creates a market order to close a position or partially close it by specifying the number of units to deduct.](https://api-portal.etoro.com/api-reference/trading--real/creates-a-market-order-to-close-a-position-or-partially-close-it-by-specifying-the-number-of-units-to-deduct.md)
- [Get Order Information and Position Details for Real Account](https://api-portal.etoro.com/api-reference/trading--real/get-order-information-and-position-details-for-real-account.md)
- [Get Real Account PnL and Portfolio Details](https://api-portal.etoro.com/api-reference/trading--real/get-real-account-pnl-and-portfolio-details.md)
- [List trading history](https://api-portal.etoro.com/api-reference/trading--real/list-trading-history.md)
- [Places a Market-if-touched order (similar to Limit order) to open a position when a threshold price is reached.](https://api-portal.etoro.com/api-reference/trading--real/places-a-market-if-touched-order-similar-to-limit-order-to-open-a-position-when-a-threshold-price-is-reached.md)
- [Places a Market Order to open a position by specifying the number of units you would like to trade.](https://api-portal.etoro.com/api-reference/trading--real/places-a-market-order-to-open-a-position-by-specifying-the-number-of-units-you-would-like-to-trade.md)
- [Retrieve comprehensive portfolio information including positions, orders, and account status](https://api-portal.etoro.com/api-reference/trading--real/retrieve-comprehensive-portfolio-information-including-positions-orders-and-account-status.md)

### Users info

- [Comprehensive search and analytics engine for user discovery and analysis](https://api-portal.etoro.com/api-reference/users-info/comprehensive-search-and-analytics-engine-for-user-discovery-and-analysis.md)
- [Get the live portfolio of a user](https://api-portal.etoro.com/api-reference/users-info/get-the-live-portfolio-of-a-user.md)
- [Get trade info for a specific user](https://api-portal.etoro.com/api-reference/users-info/get-trade-info-for-a-specific-user.md)
- [Retrieve comprehensive user profile data and aggregated account information](https://api-portal.etoro.com/api-reference/users-info/retrieve-comprehensive-user-profile-data-and-aggregated-account-information.md)
- [Retrieve detailed historical performance metrics and analytics for a specified user](https://api-portal.etoro.com/api-reference/users-info/retrieve-detailed-historical-performance-metrics-and-analytics-for-a-specified-user.md)
- [Retrieve granular performance data for specific time periods](https://api-portal.etoro.com/api-reference/users-info/retrieve-granular-performance-data-for-specific-time-periods.md)

### Watchlists

- [Add items to watchlist](https://api-portal.etoro.com/api-reference/watchlists/add-items-to-watchlist.md)
- [Change watchlist rank](https://api-portal.etoro.com/api-reference/watchlists/change-watchlist-rank.md)
- [Create a new watchlist](https://api-portal.etoro.com/api-reference/watchlists/create-a-new-watchlist.md)
- [Create default watchlist with selected items](https://api-portal.etoro.com/api-reference/watchlists/create-default-watchlist-with-selected-items.md)
- [Create watchlist and set as default](https://api-portal.etoro.com/api-reference/watchlists/create-watchlist-and-set-as-default.md)
- [Delete watchlist](https://api-portal.etoro.com/api-reference/watchlists/delete-watchlist.md)
- [Get curated lists](https://api-portal.etoro.com/api-reference/watchlists/get-curated-lists.md)
- [Get default watchlist items](https://api-portal.etoro.com/api-reference/watchlists/get-default-watchlist-items.md)
- [Get market recommendations](https://api-portal.etoro.com/api-reference/watchlists/get-market-recommendations.md)
- [Get single public watchlist](https://api-portal.etoro.com/api-reference/watchlists/get-single-public-watchlist.md)
- [Get single watchlist](https://api-portal.etoro.com/api-reference/watchlists/get-single-watchlist.md)
- [Get user watchlists](https://api-portal.etoro.com/api-reference/watchlists/get-user-watchlists.md)
- [Get user's public watchlists](https://api-portal.etoro.com/api-reference/watchlists/get-users-public-watchlists.md)
- [Remove items from watchlist](https://api-portal.etoro.com/api-reference/watchlists/remove-items-from-watchlist.md)
- [Rename watchlist](https://api-portal.etoro.com/api-reference/watchlists/rename-watchlist.md)
- [Set a specific watchlist as user's default](https://api-portal.etoro.com/api-reference/watchlists/set-a-specific-watchlist-as-users-default.md)
- [Update items in watchlist](https://api-portal.etoro.com/api-reference/watchlists/update-items-in-watchlist.md)

### WebSocket

- [Authentication](https://api-portal.etoro.com/api-reference/websocket/authentication.md) — Authentication for the eToro WebSocket API.
- [Example code](https://api-portal.etoro.com/api-reference/websocket/example-code.md) — Sample code for WebSocket integration.
- [Overview](https://api-portal.etoro.com/api-reference/websocket/overview.md) — Overview of the WebSocket API.
- [Topics](https://api-portal.etoro.com/api-reference/websocket/topics.md) — Available WebSocket topics.

## Vibe code integrations

- [Antigravity](https://api-portal.etoro.com/vibe-code/antigravity.md)
- [Base44](https://api-portal.etoro.com/vibe-code/base44.md)
- [Claude Code](https://api-portal.etoro.com/vibe-code/claude-code.md)
- [Cursor](https://api-portal.etoro.com/vibe-code/cursor.md)
- [Windsurf](https://api-portal.etoro.com/vibe-code/windsurf.md)

## Notes on detailed API documentation

The portal explicitly points developers to the API Reference section for full endpoint details and to the published OpenAPI specification for the complete schema surface. The `llms.txt` index exposes the currently discoverable documentation pages, but the full request and response schemas, parameters, and examples are expected to live in the individual endpoint pages and in the OpenAPI JSON file.

This file summarizes the endpoint-level details exposed by the published eToro OpenAPI specification and documentation index. It excludes documentation URLs and focuses on methods, paths, purpose, authentication, parameters, request bodies, and response shapes.

Base URLs
https://public-api.etoro.com

Agent Portfolios
GET /api/v1/agent-portfolios
Summary: Get Agent Portfolios.

Operation ID: getAgentPortfolios.

Description: Retrieves all agent-portfolios belonging to the authenticated user..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

Responses:

200: Agent-portfolios retrieved successfully; application/json: Schema: GetAgentPortfoliosResponse. Object with fields: agentPortfolios (array): The collection of agent-portfolios owned by the user..

401: Unauthorized; application/json: Schema: ErrorResponse. No schema provided..

429: Too Many Requests; application/json: Schema: ErrorResponse. No schema provided..

500: Internal Server Error; application/json: Schema: ErrorResponse. No schema provided..

POST /api/v1/agent-portfolios
Summary: Create Agent Portfolio.

Operation ID: createAgentPortfolio.

Description: Creates a new agent-portfolio — a dedicated user account that receives its own fixed virtual balance (returned in agentPortfolioVirtualBalance). IMPORTANT: investmentAmountInUsd is the amount deducted from YOUR (the caller's) account balance to copy-trade this agent-portfolio — it is NOT the agent-portfolio's own balance. Positions are mirrored proportionally: e.g. if you invest $2,000 and agentPortfolioVirtualBalance is $10,000, each position is copied at 20% of its size into your account..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

Request body:

application/json: Schema: CreateAgentPortfolioRequest. Object with fields: investmentAmountInUsd (number, required): The amount in USD deducted from the CALLER's account balance to copy-trade this agent-portfolio. This is NOT the agent-portfolio's own balance — the agent-portfolio receives a separate fixed virtual balance (returned as agentPortfolioVirtualBalance). Positions are mirrored proportionally: e.g. $2,000 with a $10,000 virtual balance = 20% position sizing.; agentPortfolioName (string, required): A unique display name for the agent-portfolio (6-10 characters).; agentPortfolioDescription (string): An optional description of the agent-portfolio's purpose or strategy.; userTokenName (string, required): A human-readable name for the user token provisioned with the agent-portfolio.; scopeIds (array, required): The set of permission scope identifiers to grant to the provisioned user token. Available scopes: 200 = etoro-public:real:read, 201 = etoro-public:demo:read, 202 = etoro-public:real:write, 203 = etoro-public:demo:write.; ipsWhitelist (array): An optional set of IPv4 addresses allowed to use the provisioned user token.; expiresAt (string): An optional expiration date and time (UTC) for the provisioned user token..

Responses:

201: Agent-portfolio and user token created successfully; application/json: Schema: CreateAgentPortfolioResponse. Object with fields: agentPortfolioId (string): The unique identifier of the newly created agent-portfolio.; agentPortfolioName (string): The display name assigned to the agent-portfolio.; agentPortfolioGcid (integer): The GCID associated with the agent-portfolio.; agentPortfolioVirtualBalance (number): The fixed virtual balance (in USD) that the agent-portfolio was funded with. The investmentAmountInUsd used to copy is proportional to this balance.; mirrorId (integer): The Trading API mirror ID for this agent-portfolio's copy trade.; userTokens (array): The user tokens generated during agent-portfolio creation..

207: Agent-portfolio created but user token provisioning failed; application/json: Schema: CreateAgentPortfolioPartialResponse. Object with fields: agentPortfolioId (string): The unique identifier of the newly created agent-portfolio.; agentPortfolioName (string): The display name assigned to the agent-portfolio.; agentPortfolioGcid (integer): The GCID associated with the agent-portfolio.; agentPortfolioVirtualBalance (integer): The fixed virtual balance (in USD) that the agent-portfolio was funded with. The investmentAmountInUsd used to copy is proportional to this balance.; mirrorId (integer): The Trading API mirror ID for this agent-portfolio's copy trade.; userTokenCreated (boolean): Always false — indicates that the user token was not created..

400: Bad Request; application/json: Schema: ErrorResponse. No schema provided..

401: Unauthorized; application/json: Schema: ErrorResponse. No schema provided..

429: Too Many Requests; application/json: Schema: ErrorResponse. No schema provided..

500: Internal Server Error; application/json: Schema: ErrorResponse. No schema provided..

DELETE /api/v1/agent-portfolios/{agentPortfolioId}
Summary: Delete Agent Portfolio.

Operation ID: deleteAgentPortfolio.

Description: Permanently removes a agent-portfolio by revoking all user tokens, stopping the copy mirror, and deleting from storage..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

agentPortfolioId in path (required); Type: string; The unique identifier of the agent-portfolio to delete..

Responses:

204: Agent-portfolio was successfully removed.

400: Bad Request; application/json: Schema: ErrorResponse. No schema provided..

401: Unauthorized; application/json: Schema: ErrorResponse. No schema provided..

404: Agent-portfolio not found; application/json: Schema: ErrorResponse. No schema provided..

429: Too Many Requests; application/json: Schema: ErrorResponse. No schema provided..

500: Internal Server Error; application/json: Schema: ErrorResponse. No schema provided..

POST /api/v1/agent-portfolios/{agentPortfolioId}/user-tokens
Summary: Create User Token.

Operation ID: createAgentPortfolioUserToken.

Description: Creates a new user token for the specified agent-portfolio..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

agentPortfolioId in path (required); Type: string; The unique identifier of the agent-portfolio..

Request body:

application/json: Schema: CreateUserTokenRequest. Object with fields: userTokenName (string, required): A human-readable name to identify the user token.; scopeIds (array, required): The set of permission scope identifiers to grant to this token. Available scopes: 200 = etoro-public:real:read, 201 = etoro-public:demo:read, 202 = etoro-public:real:write, 203 = etoro-public:demo:write.; ipsWhitelist (array): An optional set of IPv4 addresses allowed to use this token.; expiresAt (string): An optional expiration date and time for the token in UTC..

Responses:

201: User token created successfully; application/json: Schema: CreateUserTokenResponse. Object with fields: userTokenId (string): The unique identifier of the newly created user token.; userToken (string): The generated user token secret. Only available at creation time..

400: Bad Request; application/json: Schema: ErrorResponse. No schema provided..

401: Unauthorized; application/json: Schema: ErrorResponse. No schema provided..

404: Agent-portfolio not found; application/json: Schema: ErrorResponse. No schema provided..

429: Too Many Requests; application/json: Schema: ErrorResponse. No schema provided..

500: Internal Server Error; application/json: Schema: ErrorResponse. No schema provided..

DELETE /api/v1/agent-portfolios/{agentPortfolioId}/user-tokens/{userTokenId}
Summary: Delete User Token.

Operation ID: deleteAgentPortfolioUserToken.

Description: Permanently revokes the specified user token from a agent-portfolio..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

agentPortfolioId in path (required); Type: string; The unique identifier of the agent-portfolio..

userTokenId in path (required); Type: string; The unique identifier of the user token to delete..

Responses:

204: User token revoked successfully.

400: Bad Request; application/json: Schema: ErrorResponse. No schema provided..

401: Unauthorized; application/json: Schema: ErrorResponse. No schema provided..

404: Agent-portfolio or user token not found; application/json: Schema: ErrorResponse. No schema provided..

500: Internal Server Error; application/json: Schema: ErrorResponse. No schema provided..

PATCH /api/v1/agent-portfolios/{agentPortfolioId}/user-tokens/{userTokenId}
Summary: Update User Token.

Operation ID: updateAgentPortfolioUserToken.

Description: Updates the settings of an existing user token for a agent-portfolio. At least one field must be provided..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

agentPortfolioId in path (required); Type: string; The unique identifier of the agent-portfolio..

userTokenId in path (required); Type: string; The unique identifier of the user token to update..

Request body:

application/json: Schema: UpdateUserTokenRequest. Object with fields: scopeIds (array): An updated set of permission scope identifiers for the token. Available scopes: 200 = etoro-public:real:read, 201 = etoro-public:demo:read, 202 = etoro-public:real:write, 203 = etoro-public:demo:write.; ipsWhitelist (array): An updated set of IPv4 addresses allowed to use this token.; expiresAt (string): An updated expiration date and time (UTC) for the token..

Responses:

204: User token updated successfully.

400: Bad Request; application/json: Schema: ErrorResponse. No schema provided..

401: Unauthorized; application/json: Schema: ErrorResponse. No schema provided..

404: Agent-portfolio or user token not found; application/json: Schema: ErrorResponse. No schema provided..

429: Too Many Requests; application/json: Schema: ErrorResponse. No schema provided..

500: Internal Server Error; application/json: Schema: ErrorResponse. No schema provided..

Comments
POST /api/v1/reactions/{postId}/comment
Summary: Create a comment on a post.

Description: Creates a new comment on a specific discussion post. Comments can include text, mentions, tags, and attachments..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

postId in path (required); Type: string; ID of the post to comment on.

Request body:

application/json: Schema: CommentCreateRequest. Object with fields: owner (integer, required): ID of the user creating the comment; message (string, required): The text content of the comment; tags (Tags); mentions (Mentions); attachments (Attachments).

Responses:

201: Comment created successfully; application/json: Schema: Comment. Object with fields: entity (object); repliesCount (integer); replies (array); emotionsData (object); requesterContext (object).

Feeds
GET /api/v1/feeds/instrument/{marketId}
Summary: Get instrument feed posts.

Description: Retrieves feed posts associated with a specific financial instrument. The feed includes discussions, analyses, and other content related to the instrument..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

marketId in path (required); Type: string; Unique identifier of the financial instrument/market to retrieve feed posts for.

requesterUserId in query (optional); Type: string; ID of the user making the request. Used for personalization and permission checks..

take in query (optional); Type: integer; Number of feed posts to retrieve. Used for pagination..

badgesExperimentIsEnabled in query (optional); Type: boolean; Flag indicating whether to include user badges in the response. Part of badges feature experiment..

offset in query (optional); Type: integer; Number of feed posts to skip. Used for pagination in combination with take parameter..

reactionsPageSize in query (optional); Type: integer; Number of reactions to include per post. Controls the pagination of post reactions..

Responses:

200: Successfully retrieved instrument feed posts; application/json: Schema: DiscussionsResponse. Object with fields: discussions (array); paging (object); metadata (object).

POST /api/v1/feeds/post
Summary: Create a new discussion post.

Description: Creates a new discussion post in the feed system. This endpoint allows users to create posts that can be associated with instruments, users, or general discussions..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

Request body:

application/json: Schema: DiscussionCreateRequest. Object with fields: owner (integer): ID of the owner creating the discussion; message (string): The main text content of the discussion post; tags (Tags); mentions (Mentions); attachments (Attachments).

Responses:

201: Post accepted successfully; application/json: Schema: Post. Object with fields: id (string): Unique identifier of the post; owner (User); obsoleteId (string): Obsolete identifier for backward compatibility; created (string): Timestamp when the post was created; message (object); updated (string): Timestamp when the post was last updated; isDeleted (boolean): Indicates if the post is deleted; type (string): Type of the post; metadata (object); attachments (array); tags (array); mentions (array); ....

GET /api/v1/feeds/user/{userId}
Summary: Get user feed posts.

Description: Retrieves feed posts associated with a specific user. The feed includes the user's discussions, analyses, and other content they have posted..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

userId in path (required); Type: string; ID of the user whose feed posts should be retrieved.

requesterUserId in query (optional); Type: string; ID of the user making the request. Used for personalization and permission checks..

take in query (optional); Type: integer; Number of feed posts to retrieve. Used for pagination..

badgesExperimentIsEnabled in query (optional); Type: boolean; Flag indicating whether to include user badges in the response. Part of badges feature experiment..

offset in query (optional); Type: integer; Number of feed posts to skip. Used for pagination in combination with take parameter..

reactionsPageSize in query (optional); Type: integer; Number of reactions to include per post. Controls the pagination of post reactions..

Responses:

200: Successfully retrieved user feed posts; application/json: Schema: DiscussionsResponse. Object with fields: discussions (array); paging (object); metadata (object).

Identity
GET /api/v1/me
Summary: Get authenticated user identity.

Description: Returns the identity of the currently authenticated user including their Global Customer ID (GCID), Real account Customer ID, and Demo account Customer ID..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

Responses:

200: OK; application/json: Schema: meResponse. Object with fields: gcid (integer): Global Customer ID - the unique identifier for the user across all eToro systems.; realCid (integer): Real account Customer ID - the identifier for the user's real trading account.; demoCid (integer): Demo account Customer ID - the identifier for the user's virtual/demo trading account..

401: Unauthorized - Missing or invalid authentication credentials.

403: Forbidden - Insufficient permissions.

Market Data
GET /api/v1/market-data/exchanges
Summary: Retrieves a list of exchanges supported by the platform along with basic descriptive data..

Operation ID: GetExchanges.

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

exchangeIds in query (optional); Array of Type: integer; A comma seperated list of exchange ids to retrieve.

Responses:

200: Success; application/json: Schema: ExchangesResponse. Object with fields: exchangeInfo (array).

GET /api/v1/market-data/instrument-types
Summary: Fetch available instrument types (asset classes) such as stocks, ETFs, commodities, etc..

Operation ID: GetInstrumentTypes.

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

instrumentTypeIds in query (optional); Array of Type: integer; A comma seperated list of instrument type ids to retrieve.

Responses:

200: Success; application/json: Schema: InstrumentTypesResponse. Object with fields: instrumentTypes (array).

GET /api/v1/market-data/instruments
Summary: Retrieves metadata for specified instruments, including display names, exchange IDs, and classification..

Operation ID: GetInstrumentsByFilters.

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

instrumentIds in query (optional); Array of Type: integer; A comma seperated list of instrument ids to filter on.

exchangeIds in query (optional); Array of Type: integer; A comma seperated list of exchange ids to filter on.

stocksIndustryIds in query (optional); Array of Type: integer; A comma seperated list of stock industry ids to filter on.

instrumentTypeIds in query (optional); Array of Type: integer; A comma seperated list of instrument type ids to filter on.

Responses:

200: Success; application/json: Schema: InstrumentsResponse. Object with fields: instrumentDisplayDatas (array).

GET /api/v1/market-data/instruments/history/closing-price
Summary: Get historical closing prices for all instruments.

Operation ID: getClosingPrices.

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

Responses:

200: Successful retrieval of closing prices; application/json: Schema: closingPricesResponse. Array of Object with fields: instrumentId (integer): Unique identifier of the instrument; officialClosingPrice (number): Most recent official closing price for the instrument; isMarketOpen (boolean): Obsolete - Do not use; closingPrices (object): Historical closing prices at different time intervals.

GET /api/v1/market-data/instruments/rates
Summary: Retrieve current market rates and pricing information for specified instruments.

Description: Provides real-time market data including bid/ask prices, conversion rates, and execution prices for specified financial instruments. Essential for price discovery and trade execution decisions..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

instrumentIds in query (required); Array of Type: integer; Comma-separated list of instrument IDs to retrieve market rates for. Each ID represents a unique tradable asset in the system..

Responses:

200: Successfully retrieved current market rates; application/json: Schema: LiveRatesResponse. Object with fields: rates (array): Array of current market rates for requested instruments.

400: Invalid request - Typically due to invalid instrument IDs or exceeding maximum limit.

GET /api/v1/market-data/instruments/{instrumentId}/history/candles/{direction}/{interval}/{candlesCount}
Summary: Get historical candles data for an instrument.

Operation ID: getCandles.

Description: Retrieves historical price data in OHLCV (Open, High, Low, Close, Volume) format for a specified instrument. The data is organized into time-based candles of various intervals, from one minute to one week..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

direction in path (required); Type: string; allowed values: asc, desc; Sorting direction of the candles data. Use 'asc' for oldest to newest, or 'desc' for newest to oldest..

interval in path (required); Type: string; allowed values: OneMinute, FiveMinutes, TenMinutes, FifteenMinutes, ThirtyMinutes, OneHour, FourHours, OneDay, OneWeek; Time interval for each candle. Determines the granularity of the price data. Shorter intervals provide more detailed price action but require more data points..

candlesCount in path (required); Type: integer; Number of candles to retrieve. Maximum value is 1000. For longer historical periods, consider using a larger time interval or making multiple requests..

instrumentId in path (required); Type: integer; Unique identifier of the financial instrument to retrieve candles for. This ID is consistent across all eToro systems..

Responses:

200: Successful retrieval of candles data; application/json: Schema: candlesResponse. Object with fields: interval (string): Time interval of the returned candles. Matches the interval parameter from the request.; candles (array): List of candle data grouped by instrument.

GET /api/v1/market-data/search
Summary: Search for Instruments.

Description: Retrieve a list of instruments based on various search criteria. Each field in the response can be utilized as a filter or projection..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

searchText in query (optional); Type: string; Text to search for within instrument names..

pageSize in query (optional); Type: integer; The number of results to return per page..

pageNumber in query (optional); Type: integer; The page number to retrieve for pagination..

fields in query (required); Type: string; A comma-separated list of fields to include in the response. Example: pop=popularityUniques7Day,displayname.

sort in query (optional); Type: string; The field to sort by, with direction (asc/desc). Example: popularityUniques7Day desc.

Responses:

200: Successful response containing the list of instruments.; application/json: Schema: InstrumentSearchResponse. Object with fields: page (integer): The current page number.; pageSize (integer): The number of items per page.; totalItems (integer): The total number of instruments matching the search criteria.; items (array).

GET /api/v1/market-data/stocks-industries
Summary: Gets data on available stocks industries.

Operation ID: GetStocksIndustries.

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

stocksIndustryIds in query (optional); Array of Type: integer; A comma seperated list of stock industry ids to retrieves.

Responses:

200: Success; application/json: Schema: StocksIndustriesResponse. Object with fields: stocksIndustries (array).

PI Data
GET /api/v1/pi-data/copiers
Summary: Get copiers public info.

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

Responses:

200: A list of copiers; application/json: Schema: GeCopiersResponse. Object with fields: copiers (array): List of users copying your portfolio, with demographic and financial info..

Trading - Demo
POST /api/v1/trading/execution/demo/limit-orders
Summary: Places a Market-if-touched order (similar to Limit order) to open a position when a threshold price is reached..

Operation ID: openLimitOrderDemo.

Description: A Market-if-touched order is an order to open a new long or short position when a specific price or better appears in the Market. The price threshold is used to trigger a Market Order. This endpoint allows traders to set up Market-if-touched orders with parameters like leverage, stop-loss, and take-profit settings..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

Request body:

application/json: Object with fields: InstrumentID (integer): The unique identifier of the financial instrument.; IsBuy (boolean): Indicates whether the order will open a long (true) or short (false) position.; Leverage (integer): The leverage ratio for the order.; Amount (number): The amount of the trade in the account currency [USD]. Required if AmountInUnits is not provided.; AmountInUnits (number): The number of units of the asset. Required if Amount is not provided. For most assets this can be a fractional number. Note that for Future Contracts this number should indicate the number of underlying units, and not the number of contracts, according to the formula: AmountInUnits = contract multiplier * number of contracts.; StopLossRate (number): The stop-loss trigger price at which the position will generate a Market Order to close (after it was opened). StopLoss trigger price must be worse than current price.; TakeProfitRate (number): The take-profit trigger price at which the position will generate a Market Order to close (after it has opened). TakeProfit trigger price must be better than the current price.; Rate (number): The trigger price at which a Market order to open the position will be sent for execution. The trigger price must be better than the current price. This means that the trigger price must be lower than current price for Long positions, and higher than current price for Short positions.; IsTslEnabled (boolean): Indicates if a trailing stop loss (TSL) is enabled. This means that the stoploss rate indicated will get updated automatically whenever the asset price increases (for long positions) or decreases (for short position) effectively keeping the stoploss in a constant gap from the best price achieved so far.; IsDiscounted (boolean): SHOULD NOT BE EXTERNALZIED; IsNoStopLoss (boolean): Indicates if stop-loss is disabled.; IsNoTakeProfit (boolean): Indicates if take-profit is disabled.; ....

Responses:

200: Market-if-touched order successfully placed. The response includes a confirmation token.; application/json: Object with fields: token (string, required): A confirmation token indicating the order creation..

DELETE /api/v1/trading/execution/demo/limit-orders/{orderId}
Summary: Cancels a Market-if-touched order that has not yet been executed..

Operation ID: cancelLimitOrderDemo.

Description: This endpoint allows traders to cancel a Market-if-touched order before it is executed. Once canceled, the order will no longer be processed..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

orderId in path (required); Type: integer; The unique identifier of the Market-if-touched order to be canceled..

Responses:

200: Successfully canceled the Market-if-touched order. The response includes a confirmation token.; application/json: Object with fields: token (string, required): A confirmation token indicating the order cancellation..

POST /api/v1/trading/execution/demo/market-close-orders/positions/{positionId}
Summary: Creates a market order to close a position or partially close it by specifying the number of units to deduct..

Operation ID: closePositionByMarketRateDemo.

Description: This endpoint allows traders to close an entire position or a portion of it at the current market rate. If UnitsToDeduct is provided, only the specified portion will be closed. If UnitsToDeduct is omitted or set to null, the full position will be closed..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

positionId in path (required); Type: integer; The unique identifier of the position to close..

Request body:

application/json: Object with fields: InstrumentID (integer, required): The ID of the financial instrument associated with the position.; UnitsToDeduct (number): The number of units to close. If omitted or null, the entire position will be closed..

Responses:

200: Successfully closed a position or a part of it.; application/json: Object with fields: orderForClose (object); token (string): A unique confirmation token for the closing order..

DELETE /api/v1/trading/execution/demo/market-close-orders/{orderId}
Summary: Cancels a pending market order for close for the specified order ID..

Operation ID: cancelCloseOrderDemo.

Description: This endpoint allows traders to cancel a previously placed market order for close before execution. If the order has already been processed, cancellation will not be possible..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

orderId in path (required); Type: integer; The unique identifier of the market order for close to be canceled..

Responses:

200: Successfully canceled the market order for close. The response includes a confirmation token.; application/json: Object with fields: token (string, required): A confirmation token indicating the order cancellation..

POST /api/v1/trading/execution/demo/market-open-orders/by-amount
Summary: Create a market order to open a position by specifying the amount of cash you would like to use in the trade..

Operation ID: openMarketPositionByAmountDemo.

Description: This endpoint allows traders to place a market order to open a position by specifying the investment amount instead of specifying the number of units. The trade will be executed at the market price, and leverage, stop-loss, and take-profit settings can be applied..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

Request body:

application/json: Object with fields: InstrumentID (integer, required): The unique identifier of the financial instrument to trade.; IsBuy (boolean, required): True for a long position, false for a short position.; Leverage (integer, required): The leverage multiplier for the trade.; Amount (number, required): The amount of money to invest in the trade.; StopLossRate (number): The stop-loss trigger price at which the position will generate a Market Order to close (after it was opened). StopLoss trigger price must be worse than current price.; TakeProfitRate (number): The take-profit trigger price at which the position will generate a Market Order to close (after it has opened). TakeProfit trigger price must be better than the current price.; IsTslEnabled (boolean): Indicates if a trailing stop loss (TSL) is enabled. This means that the stoploss rate indicated will get updated automatically whenever the asset price increases (for long positions) or decreases (for short position) effectively keeping the stoploss in a constant gap from the best price achieved so far.; IsNoStopLoss (boolean): True if no stop-loss is set for this order.; IsNoTakeProfit (boolean): True if no take-profit is set for this order..

Responses:

200: Successfully opened a market order.; application/json: Object with fields: orderForOpen (object); token (string): A unique confirmation token for the order..

POST /api/v1/trading/execution/demo/market-open-orders/by-units
Summary: Places a Market Order to open a position by specifying the number of units you would like to trade..

Operation ID: openMarketPositionByUnitsDemo.

Description: This endpoint allows traders to place a market order to open a position by specifying the number of units (rather than an amount in cash). The trade is executed at the current market price, and optional settings like leverage, stop-loss, and take-profit can be applied..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

Request body:

application/json: Object with fields: InstrumentID (integer, required): The unique identifier of the financial instrument to trade.; IsBuy (boolean, required): True for a long position, false for a short position.; Leverage (integer, required): The leverage multiplier for the trade.; AmountInUnits (number, required): The number of units of the asset. Required if Amount is not provided. For most assets this can be a fractional number. Note that for Future Contracts this number should indicate the number of underlying units, and not the number of contracts, according to the formula: AmountInUnits = contract multiplier * number of contracts.; StopLossRate (number): The stop-loss trigger price at which the position will generate a Market Order to close (after it was opened). StopLoss trigger price must be worse than current price.; TakeProfitRate (number): The take-profit trigger price at which the position will generate a Market Order to close (after it has opened). TakeProfit trigger price must be better than the current price.; IsTslEnabled (boolean): Indicates if a trailing stop loss (TSL) is enabled. This means that the stoploss rate indicated will get updated automatically whenever the asset price increases (for long positions) or decreases (for short position) effectively keeping the stoploss in a constant gap from the best price achieved so far.; IsNoStopLoss (boolean): True if no stop-loss is set for this order.; IsNoTakeProfit (boolean): True if no take-profit is set for this order..

Responses:

200: Successfully opened a market order.; application/json: Object with fields: orderForOpen (object); token (string): A unique confirmation token for the order..

DELETE /api/v1/trading/execution/demo/market-open-orders/{orderId}
Summary: Cancels a market order for open before it is executed..

Operation ID: cancelOpenMarketOrderDemo.

Description: This endpoint allows traders to cancel a market order for open before execution. If the order has already been processed, cancellation will not be possible..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

orderId in path (required); Type: integer; The unique identifier of the market order for open to be canceled..

Responses:

200: Successfully canceled the pending market order. The response includes a confirmation token.; application/json: Object with fields: token (string, required): A confirmation token indicating the order cancellation..

GET /api/v1/trading/info/demo/orders/{orderId}
Summary: Get Order Information and Position Details for Demo Account.

Operation ID: getDemoOrderForOpenInfo.

Description: Retrieves comprehensive information about a specific order for opening a position, including the order status, execution details, and all positions that were opened from this order. This endpoint is essential for tracking order execution and identifying which positions were created as a result of a specific order request. The response includes detailed position information with PositionID values that can be used to query position-specific details..

Security: bearerAuth.

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

orderId in path (required); Type: integer; The unique identifier of the order for opening a position. This is the OrderID that was returned when the order was initially created..

Responses:

200: Successfully retrieved order information and associated position details.; application/json: Schema: OrderForOpenInfoResponse. Object with fields: token (string): Tracking token for the request, used for correlation and debugging purposes. This token is generated by the system and can be used to track the request through various system components.; orderID (integer, required): The unique identifier of the order. This is the same OrderID that was provided in the request path parameter.; CID (integer, required): Customer ID (CID) associated with the order. This identifies the user account that created the order.; referenceID (string): Reference tracking ID for the order request.; statusID (integer, required): Current status of the order. Common values: 0 = Pending, 1 = Executed, 2 = Cancelled, 3 = Rejected, 4 = Partially Executed. The exact meaning of status codes may vary based on order type and system configuration.; orderType (integer, required): Type of the order. Common values: 1 = Market Order, 2 = Limit Order, 3 = Stop Order. The exact order types depend on the trading system configuration.; openActionType (integer): The action type that triggered the order creation. This indicates the reason or context for opening the position, such as manual trade, copy trading, automated strategy, etc.; errorCode (integer): Error code if the order execution failed or encountered an error. This field is null if the order was successful. Error codes are system-specific and should be referenced against the system's error code documentation.; errorMessage (string): Human-readable error message describing any error that occurred during order processing. This field is null if the order was successful. Provides additional context beyond the errorCode.; instrumentID (integer, required): The unique identifier of the financial instrument that the order was placed for. This corresponds to the instrument being traded (e.g., stock, currency pair, commodity).; amount (number): The USD amount that was requested to be invested in the position. This represents the monetary value allocated to the order.; units (number): The number of units that were requested to be traded. If the order was placed by units rather than amount, this value represents the requested quantity.; ....

400: Bad Request - Invalid orderId format, or validation error occurred..

404: Not Found - The specified order was not found for the provided OrderID..

500: Internal Server Error - An unexpected error occurred while processing the request..

GET /api/v1/trading/info/demo/pnl
Summary: Get Demo Account PnL and Portfolio Details.

Operation ID: getDemoAccountPnl.

Description: Retrieves the demo account's current portfolio, including credit, open positions, orders, mirrors, and PnL details..

Security: bearerAuth.

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

Responses:

200: Successfully retrieved demo account PnL and portfolio information.; application/json: Schema: PortfolioResponseWithPnl. Object with fields: clientPortfolio (ClientPortfolio): Container for all portfolio-related information.

GET /api/v1/trading/info/demo/portfolio
Summary: Retrieve comprehensive portfolio information including positions, orders, and account status.

Operation ID: getPortfolioDemo.

Description: Returns detailed portfolio information including active positions, pending orders, mirror trading details, and account balances. This endpoint provides a complete overview of the user's trading activity and current market exposure..

Security: bearerAuth.

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

Responses:

200: Successfully retrieved portfolio information; application/json: Schema: PortfolioResponse. Object with fields: clientPortfolio (object): Container for all portfolio-related information.

Trading - Real
POST /api/v1/trading/execution/limit-orders
Summary: Places a Market-if-touched order (similar to Limit order) to open a position when a threshold price is reached..

Operation ID: openLimitOrder.

Description: A Market-if-touched order is an order to open a new long or short position when a specific price or better appears in the Market. The price threshold is used to trigger a Market Order. This endpoint allows traders to set up Market-if-touched orders with parameters like leverage, stop-loss, and take-profit settings..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

Request body:

application/json: Object with fields: InstrumentID (integer): The unique identifier of the financial instrument.; IsBuy (boolean): Indicates whether the order will open a long (true) or short (false) position.; Leverage (integer): The leverage ratio for the order.; Amount (number): The amount of the trade in the account currency [USD]. Required if AmountInUnits is not provided.; AmountInUnits (number): The number of units of the asset. Required if Amount is not provided. For most assets this can be a fractional number. Note that for Future Contracts this number should indicate the number of underlying units, and not the number of contracts, according to the formula: AmountInUnits = contract multiplier * number of contracts.; StopLossRate (number): The stop-loss trigger price at which the position will generate a Market Order to close (after it was opened). StopLoss trigger price must be worse than current price.; TakeProfitRate (number): The take-profit trigger price at which the position will generate a Market Order to close (after it has opened). TakeProfit trigger price must be better than the current price.; Rate (number): The trigger price at which a Market order to open the position will be sent for execution. The trigger price must be better than the current price. This means that the trigger price must be lower than current price for Long positions, and higher than current price for Short positions.; IsTslEnabled (boolean): Indicates if a trailing stop loss (TSL) is enabled. This means that the stoploss rate indicated will get updated automatically whenever the asset price increases (for long positions) or decreases (for short position) effectively keeping the stoploss in a constant gap from the best price achieved so far.; IsDiscounted (boolean): SHOULD NOT BE EXTERNALZIED; IsNoStopLoss (boolean): Indicates if stop-loss is disabled.; IsNoTakeProfit (boolean): Indicates if take-profit is disabled.; ....

Responses:

200: Market-if-touched order successfully placed. The response includes a confirmation token.; application/json: Object with fields: token (string, required): A confirmation token indicating the order creation..

DELETE /api/v1/trading/execution/limit-orders/{orderId}
Summary: Cancels a Market-if-touched order that has not yet been executed..

Operation ID: cancelLimitOrder.

Description: This endpoint allows traders to cancel a Market-if-touched order before it is executed. Once canceled, the order will no longer be processed..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

orderId in path (required); Type: integer; The unique identifier of the Market-if-touched order to be canceled..

Responses:

200: Successfully canceled the Market-if-touched order. The response includes a confirmation token.; application/json: Object with fields: token (string, required): A confirmation token indicating the order cancellation..

POST /api/v1/trading/execution/market-close-orders/positions/{positionId}
Summary: Creates a market order to close a position or partially close it by specifying the number of units to deduct..

Operation ID: closePositionByMarketRate.

Description: This endpoint allows traders to close an entire position or a portion of it at the current market rate. If UnitsToDeduct is provided, only the specified portion will be closed. If UnitsToDeduct is omitted or set to null, the full position will be closed..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

positionId in path (required); Type: integer; The unique identifier of the position to close..

Request body:

application/json: Object with fields: InstrumentId (integer, required): The ID of the financial instrument associated with the position.; UnitsToDeduct (number): The number of units to close. If omitted or null, the entire position will be closed..

Responses:

200: Successfully closed a position or a part of it.; application/json: Object with fields: orderForClose (object); token (string): A unique confirmation token for the closing order..

DELETE /api/v1/trading/execution/market-close-orders/{orderId}
Summary: Cancels a pending market order for close for the specified order ID..

Operation ID: cancelCloseOrder.

Description: This endpoint allows traders to cancel a previously placed market order for close before execution. If the order has already been processed, cancellation will not be possible..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

orderId in path (required); Type: integer; The unique identifier of the market order for close to be canceled..

Responses:

200: Successfully canceled the market order for close. The response includes a confirmation token.; application/json: Object with fields: token (string, required): A confirmation token indicating the order cancellation..

POST /api/v1/trading/execution/market-open-orders/by-amount
Summary: Create a market order to open a position by specifying the amount of cash you would like to use in the trade..

Operation ID: openMarketPositionByAmount.

Description: This endpoint allows traders to place a market order to open a position by specifying the investment amount instead of specifying the number of units. The trade will be executed at the market price, and leverage, stop-loss, and take-profit settings can be applied..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

Request body:

application/json: Object with fields: InstrumentID (integer, required): The unique identifier of the financial instrument to trade.; IsBuy (boolean, required): True for a long position, false for a short position.; Leverage (integer, required): The leverage multiplier for the trade.; Amount (number, required): The amount of money to invest in the trade.; StopLossRate (number): The stop-loss trigger price at which the position will generate a Market Order to close (after it was opened). StopLoss trigger price must be worse than current price.; TakeProfitRate (number): The take-profit trigger price at which the position will generate a Market Order to close (after it has opened). TakeProfit trigger price must be better than the current price.; IsTslEnabled (boolean): Indicates if a trailing stop loss (TSL) is enabled. This means that the stoploss rate indicated will get updated automatically whenever the asset price increases (for long positions) or decreases (for short position) effectively keeping the stoploss in a constant gap from the best price achieved so far.; IsNoStopLoss (boolean): True if no stop-loss is set for this order.; IsNoTakeProfit (boolean): True if no take-profit is set for this order..

Responses:

200: Successfully opened a market order.; application/json: Object with fields: orderForOpen (object); token (string): A unique confirmation token for the order..

POST /api/v1/trading/execution/market-open-orders/by-units
Summary: Places a Market Order to open a position by specifying the number of units you would like to trade..

Operation ID: openMarketPositionByUnits.

Description: This endpoint allows traders to place a market order to open a position by specifying the number of units (rather than an amount in cash). The trade is executed at the current market price, and optional settings like leverage, stop-loss, and take-profit can be applied..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

Request body:

application/json: Object with fields: InstrumentID (integer, required): The unique identifier of the financial instrument to trade.; IsBuy (boolean, required): True for a long position, false for a short position.; Leverage (integer, required): The leverage multiplier for the trade.; AmountInUnits (number, required): The number of units of the asset. Required if Amount is not provided. For most assets this can be a fractional number. Note that for Future Contracts this number should indicate the number of underlying units, and not the number of contracts, according to the formula: AmountInUnits = contract multiplier * number of contracts.; StopLossRate (number): The stop-loss trigger price at which the position will generate a Market Order to close (after it was opened). StopLoss trigger price must be worse than current price.; TakeProfitRate (number): The take-profit trigger price at which the position will generate a Market Order to close (after it has opened). TakeProfit trigger price must be better than the current price.; IsTslEnabled (boolean): Indicates if a trailing stop loss (TSL) is enabled. This means that the stoploss rate indicated will get updated automatically whenever the asset price increases (for long positions) or decreases (for short position) effectively keeping the stoploss in a constant gap from the best price achieved so far.; IsNoStopLoss (boolean): True if no stop-loss is set for this order.; IsNoTakeProfit (boolean): True if no take-profit is set for this order..

Responses:

200: Successfully opened a market order.; application/json: Object with fields: orderForOpen (object); token (string): A unique confirmation token for the order..

DELETE /api/v1/trading/execution/market-open-orders/{orderId}
Summary: Cancels a market order for open before it is executed..

Operation ID: cancelOpenMarketOrder.

Description: This endpoint allows traders to cancel a market order for open before execution. If the order has already been processed, cancellation will not be possible..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

orderId in path (required); Type: integer; The unique identifier of the market order for open to be canceled..

Responses:

200: Successfully canceled the pending market order. The response includes a confirmation token.; application/json: Object with fields: token (string, required): A confirmation token indicating the order cancellation..

GET /api/v1/trading/info/portfolio
Summary: Retrieve comprehensive portfolio information including positions, orders, and account status.

Operation ID: getPortfolio.

Description: Returns detailed portfolio information including active positions, pending orders, mirror trading details, and account balances. This endpoint provides a complete overview of the user's trading activity and current market exposure..

Security: bearerAuth.

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

Responses:

200: Successfully retrieved portfolio information; application/json: Schema: PortfolioResponse. Object with fields: clientPortfolio (object): Container for all portfolio-related information.

GET /api/v1/trading/info/real/orders/{orderId}
Summary: Get Order Information and Position Details for Real Account.

Operation ID: getRealOrderForOpenInfo.

Description: Retrieves comprehensive information about a specific order for opening a position, including the order status, execution details, and all positions that were opened from this order. This endpoint is essential for tracking order execution and identifying which positions were created as a result of a specific order request. The response includes detailed position information with PositionID values that can be used to query position-specific details..

Security: bearerAuth.

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

orderId in path (required); Type: integer; The unique identifier of the order for opening a position. This is the OrderID that was returned when the order was initially created..

Responses:

200: Successfully retrieved order information and associated position details.; application/json: Schema: OrderForOpenInfoResponse. Object with fields: token (string): Tracking token for the request, used for correlation and debugging purposes. This token is generated by the system and can be used to track the request through various system components.; orderID (integer, required): The unique identifier of the order. This is the same OrderID that was provided in the request path parameter.; CID (integer, required): Customer ID (CID) associated with the order. This identifies the user account that created the order.; referenceID (string): Reference tracking ID for the order request.; statusID (integer, required): Current status of the order. Common values: 0 = Pending, 1 = Executed, 2 = Cancelled, 3 = Rejected, 4 = Partially Executed. The exact meaning of status codes may vary based on order type and system configuration.; orderType (integer, required): Type of the order. Common values: 1 = Market Order, 2 = Limit Order, 3 = Stop Order. The exact order types depend on the trading system configuration.; openActionType (integer): The action type that triggered the order creation. This indicates the reason or context for opening the position, such as manual trade, copy trading, automated strategy, etc.; errorCode (integer): Error code if the order execution failed or encountered an error. This field is null if the order was successful. Error codes are system-specific and should be referenced against the system's error code documentation.; errorMessage (string): Human-readable error message describing any error that occurred during order processing. This field is null if the order was successful. Provides additional context beyond the errorCode.; instrumentID (integer, required): The unique identifier of the financial instrument that the order was placed for. This corresponds to the instrument being traded (e.g., stock, currency pair, commodity).; amount (number): The USD amount that was requested to be invested in the position. This represents the monetary value allocated to the order.; units (number): The number of units that were requested to be traded. If the order was placed by units rather than amount, this value represents the requested quantity.; ....

400: Bad Request - Invalid orderId format, or validation error occurred..

404: Not Found - The specified order was not found for the provided OrderID..

500: Internal Server Error - An unexpected error occurred while processing the request..

GET /api/v1/trading/info/real/pnl
Summary: Get Real Account PnL and Portfolio Details.

Operation ID: getRealAccountPnl.

Description: Retrieves the real account's current portfolio, including credit, open positions, orders, mirrors, and PnL details..

Security: bearerAuth.

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

Responses:

200: Successfully retrieved real account PnL and portfolio information.; application/json: Schema: PortfolioResponseWithPnl. Object with fields: clientPortfolio (ClientPortfolio): Container for all portfolio-related information.

GET /api/v1/trading/info/trade/history
Summary: List trading history.

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

minDate in query (required); Type: string; The start date of the period you would like to view..

page in query (optional); Type: integer; The page number..

pageSize in query (optional); Type: integer; The amount of trades in each page..

Responses:

200: OK; application/json: Array of Object with fields: netProfit (number): The net profit of the trade; closeRate (number): The closing rate of the trade; closeTimestamp (string): The closing timestamp of the trade; positionId (integer): The position ID of the trade; instrumentId (integer): The instrument ID of the instrument that was traded; isBuy (boolean): Indicates if the trade was a buy or sell; leverage (integer): The leverage used in the trade; openRate (number): The opening rate of the trade; openTimestamp (string): The opening timestamp of the trade; stopLossRate (number): The stop loss rate of the trade; takeProfitRate (number): The take profit rate of the trade; trailingStopLoss (boolean): Indicates if the trade had a trailing stop loss; ....

Users Info
GET /api/v1/user-info/people
Summary: Retrieve comprehensive user profile data and aggregated account information.

Description: Returns detailed user profile information including account status, verification levels, biographical data, and associated metadata. This endpoint aggregates essential user information from multiple sources to provide a complete user profile overview..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

usernames in query (optional); Array of Type: string.

cidList in query (optional); Array of Type: integer.

Responses:

200: Successfully retrieved user information; application/json: Schema: PublicAggregatedInfoResponse. Object with fields: users (array): Array of user profiles with their associated information.

400: Invalid request - Typically due to exceeding maximum usernames limit or invalid username format.

404: One or more requested usernames not found.

GET /api/v1/user-info/people/search
Summary: Comprehensive search and analytics engine for user discovery and analysis.

Description: Powerful search platform that enables advanced user discovery with comprehensive filtering capabilities. Supports complex queries across multiple dimensions including performance metrics, risk profiles, investment patterns, and account characteristics. Ideal for identifying users based on specific trading behaviors and performance criteria..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

period in query (required); Type: string; allowed values: CurrMonth, CurrQuarter, CurrYear, LastYear, LastTwoYears, OneMonthAgo, TwoMonthsAgo, ThreeMonthsAgo, SixMonthsAgo, OneYearAgo; Defines the time period for analyzing user metrics and performance data. Supports various predefined intervals for consistent analysis..

isTestAccount in query (optional); Type: boolean; When set to true, filters results to include only test/demo accounts. When false, shows only live accounts. Optional filter..

optIn in query (optional); Type: boolean; Filter for users who have explicitly opted in to specific features or programs. Used for compliance and feature-specific filtering..

blocked in query (optional); Type: boolean; When true, includes only blocked accounts in the results. Used for compliance and risk management purposes..

page in query (optional); Type: integer; Page number for pagination..

pageSize in query (optional); Type: integer; Number of results per page..

sort in query (optional); Type: string; Sort results by specific field (e.g., -copiers)..

popularInvestor in query (optional); Type: boolean; Filter for popular investors..

gainMax in query (optional); Type: integer; Max gain value filter..

maxDailyRiskScoreMin in query (optional); Type: integer; Minimum daily risk score..

maxDailyRiskScoreMax in query (optional); Type: integer; Maximum daily risk score..

maxMonthlyRiskScoreMin in query (optional); Type: integer; Minimum monthly risk score..

maxMonthlyRiskScoreMax in query (optional); Type: integer; Maximum monthly risk score..

weeksSinceRegistrationMin in query (optional); Type: integer; Minimum weeks since registration..

countryId in query (optional); Type: integer; The registered country ID of the user.

instrumentId in query (optional); Type: integer; The instrument ID (you can also use this to exclude an instrument e.g., -5)..

instrumentPctMin in query (optional); Type: integer; Minimum percentage of investment in the requested instrument ID..

instrumentPctMax in query (optional); Type: integer; Maximum percentage of investment in the requested instrument ID..

Responses:

200: OK; application/json: Object with fields: totalItems (integer, required); items (array, required).

GET /api/v1/user-info/people/{username}/daily-gain
Summary: Retrieve granular performance data for specific time periods.

Description: Provides detailed performance analytics including daily gains, cumulative returns, and period-specific metrics within a specified date range. Supports various time-based analyses and performance reporting requirements..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

username in path (required); Type: string; Unique identifier of the user whose performance data is being requested.

minDate in query (required); Type: string; Start date for the analysis period (inclusive) in YYYY-MM-DD format.

maxDate in query (required); Type: string; End date for the analysis period (inclusive) in YYYY-MM-DD format.

type in query (required); Type: string; allowed values: Daily, Period; Specifies the granularity of the performance data: 'Daily' for day-by-day metrics or 'Period' for aggregated period statistics.

Responses:

200: OK; application/json: Schema: getUserDailyGainResponse. Schema available in OpenAPI spec..

GET /api/v1/user-info/people/{username}/gain
Summary: Retrieve detailed historical performance metrics and analytics for a specified user.

Description: Returns comprehensive historical monthly and yearly performance data including gain percentages, risk-adjusted returns, and detailed trading statistics. This endpoint provides both aggregated and time-series performance metrics..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

username in path (required); Type: string; Unique identifier of the user whose performance metrics are being requested.

Responses:

200: OK; application/json: Schema: getUserGainResponse. Object with fields: monthly (array); yearly (array).

GET /api/v1/user-info/people/{username}/portfolio/live
Summary: Get the live portfolio of a user.

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

username in path (required); Type: string; The username of the user to retrieve the live portfolio for..

Responses:

200: OK; application/json: Object with fields: realizedCreditPct (number): Credit as a percentage of the realized credit; unrealizedCreditPct (number): Credit as a percentage of the unrealized credit; positions (array); socialTrades (array).

GET /api/v1/user-info/people/{username}/tradeinfo
Summary: Get trade info for a specific user.

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

username in path (required); Type: string; The username of the user to retrieve the discovery info for..

period in query (required); Type: string; allowed values: CurrMonth, CurrQuarter, CurrYear, LastYear, LastTwoYears, OneMonthAgo, TwoMonthsAgo, ThreeMonthsAgo, SixMonthsAgo, OneYearAgo; The period filter (e.g., LastTwoYears)..

Responses:

200: OK; application/json: Object with fields: userName (string): The username of the customer; fullName (string): Full name of the customer; weeksSinceRegistration (integer): Number of weeks since registration; countryId (integer): The registered country ID of the user; affiliateId (integer): The affiliate ID of the user; isPopularInvestor (boolean): Is the customer a popular investor; isFund (boolean): Does this customer represent a fund; hasAvatar (boolean): Does the customer have a picture; gain (number): The periodic gain of the user; dailyGain (number): The user's last day gain; thisWeekGain (number): The user's gain from the beginning of the trading week; riskScore (integer): The current risk score of the user; ....

Watchlists
GET /api/v1/curated-lists
Summary: Get curated lists.

Description: Retrieves curated investment lists available to the authenticated user..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

Responses:

200: Successfully retrieved curated lists; application/json: Schema: CuratedListsResponse. Object with fields: curatedLists (array): List of curated investment lists.

204: No curated lists available.

GET /api/v1/market-recommendations/{itemsCount}
Summary: Get market recommendations.

Description: Retrieves personalized market recommendations for the authenticated user..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

itemsCount in path (required); Type: integer; Number of recommendations to return.

Responses:

200: Successfully retrieved market recommendations; application/json: Schema: MarketRecommendationsResponse. Object with fields: ResponseType (string): Type of recommendation response; Recommendations (array): List of recommended instrument IDs.

204: No recommendations available.

GET /api/v1/watchlists
Summary: Get user watchlists.

Description: Retrieves all watchlists for the authenticated user with optional pagination and built-in watchlist management..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

itemsPerPageForSingle in query (optional); Type: integer; Number of items to include per watchlist for pagination.

ensureBuiltinWatchlists in query (optional); Type: boolean; Whether to ensure built-in watchlists are included.

addRelatedAssets in query (optional); Type: boolean; Whether to include related assets in the response.

Responses:

200: Successfully retrieved user watchlists; application/json: Schema: WatchlistsResponse. Object with fields: status (integer): HTTP status code of the response; watchlists (array): List of user watchlists; exception (object): Exception details when the request partially failed; meta (object): Response metadata including pagination info; isSucceeded (boolean): Whether the request succeeded.

POST /api/v1/watchlists
Summary: Create a new watchlist.

Description: Creates a new watchlist for the authenticated user with the specified name and type..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

name in query (required); Type: string; Name of the new watchlist.

type in query (optional); Type: string; allowed values: Static, Dynamic; Type of watchlist to create.

dynamicQuery in query (optional); Type: string; Dynamic query URL for dynamic watchlists.

Responses:

201: Watchlist created successfully; application/json: Schema: WatchlistsResponse. Object with fields: status (integer): HTTP status code of the response; watchlists (array): List of user watchlists; exception (object): Exception details when the request partially failed; meta (object): Response metadata including pagination info; isSucceeded (boolean): Whether the request succeeded.

POST /api/v1/watchlists/default-watchlist/selected-items
Summary: Create default watchlist with selected items.

Description: Creates a default watchlist populated with the specified items..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

Request body:

application/json: Array of Schema: WatchlistItemDto.

Responses:

201: Default watchlist created successfully; application/json: Schema: WatchlistsResponse. Object with fields: status (integer): HTTP status code of the response; watchlists (array): List of user watchlists; exception (object): Exception details when the request partially failed; meta (object): Response metadata including pagination info; isSucceeded (boolean): Whether the request succeeded.

GET /api/v1/watchlists/default-watchlists/items
Summary: Get default watchlist items.

Description: Retrieves items from user's default watchlists with optional pagination..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

itemsLimit in query (optional); Type: integer; Maximum number of items to return.

itemsPerPage in query (optional); Type: integer; Number of items per page for pagination.

Responses:

200: Successfully retrieved default watchlist items; application/json: Array of Schema: WatchlistItemDto.

POST /api/v1/watchlists/newasdefault-watchlist
Summary: Create watchlist and set as default.

Description: Creates a new watchlist and immediately sets it as the user's default watchlist..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

name in query (required); Type: string; Name of the new watchlist.

type in query (optional); Type: string; allowed values: Static, Dynamic; Type of watchlist to create.

dynamicQuery in query (optional); Type: string; Query string for dynamic watchlists.

Responses:

201: Watchlist created and set as default successfully; application/json: Schema: WatchlistsResponse. Object with fields: status (integer): HTTP status code of the response; watchlists (array): List of user watchlists; exception (object): Exception details when the request partially failed; meta (object): Response metadata including pagination info; isSucceeded (boolean): Whether the request succeeded.

GET /api/v1/watchlists/public/{userId}
Summary: Get user's public watchlists.

Description: Retrieves all public watchlists for a specific user..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

userId in path (required); Type: integer; User ID whose public watchlists to retrieve.

itemsPerPageForSingle in query (optional); Type: integer; Number of items per watchlist.

Responses:

200: Successfully retrieved public watchlists; application/json: Schema: WatchlistsResponse. Object with fields: status (integer): HTTP status code of the response; watchlists (array): List of user watchlists; exception (object): Exception details when the request partially failed; meta (object): Response metadata including pagination info; isSucceeded (boolean): Whether the request succeeded.

GET /api/v1/watchlists/public/{userId}/{watchlistId}
Summary: Get single public watchlist.

Description: Retrieves a specific public watchlist from a user..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

userId in path (required); Type: integer; User ID who owns the watchlist.

watchlistId in path (required); Type: string; Unique identifier of the watchlist.

pageNumber in query (optional); Type: integer; Page number for pagination.

itemsPerPage in query (optional); Type: integer; Number of items per page.

Responses:

200: Successfully retrieved public watchlist; application/json: Schema: WatchlistResponse. Object with fields: watchlistId (string): Unique identifier of the watchlist; name (string): Display name of the watchlist; Gcid (integer): Global Customer ID of the watchlist owner; watchlistType (string): Type of the watchlist; totalItems (integer): Total number of items in the watchlist; isDefault (boolean): Whether this is a default system watchlist; isUserSelectedDefault (boolean): Whether this is the user's selected default watchlist; watchlistRank (integer): Display order rank of the watchlist; dynamicUrl (string): URL for dynamic watchlist queries; items (array): Items contained in the watchlist; relatedAssets (array): Related asset IDs.

PUT /api/v1/watchlists/rank/{watchlistId}
Summary: Change watchlist rank.

Description: Updates the display rank of a watchlist..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

watchlistId in path (required); Type: string; Unique identifier of the watchlist.

newRank in query (required); Type: integer; New rank position for the watchlist.

Responses:

204: Watchlist rank updated successfully.

PUT /api/v1/watchlists/setUserSelectedUserDefault/{watchlistId}
Summary: Set a specific watchlist as user's default.

Description: Sets the specified watchlist as the user's default watchlist..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

watchlistId in path (required); Type: string; Unique identifier of the watchlist to set as default.

Responses:

200: Default watchlist set successfully.

DELETE /api/v1/watchlists/{watchlistId}
Summary: Delete watchlist.

Description: Removes a watchlist and all its items..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

watchlistId in path (required); Type: string; Unique identifier of the watchlist to delete.

Responses:

204: Watchlist deleted successfully.

GET /api/v1/watchlists/{watchlistId}
Summary: Get single watchlist.

Description: Retrieves a specific watchlist with its items using pagination..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

watchlistId in path (required); Type: string; Unique identifier of the watchlist.

pageNumber in query (optional); Type: integer; Page number for pagination.

itemsPerPage in query (optional); Type: integer; Number of items per page.

Responses:

200: Successfully retrieved watchlist; application/json: Schema: WatchlistsResponse. Object with fields: status (integer): HTTP status code of the response; watchlists (array): List of user watchlists; exception (object): Exception details when the request partially failed; meta (object): Response metadata including pagination info; isSucceeded (boolean): Whether the request succeeded.

PUT /api/v1/watchlists/{watchlistId}
Summary: Rename watchlist.

Description: Updates the name of an existing watchlist..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

watchlistId in path (required); Type: string; Unique identifier of the watchlist.

newName in query (required); Type: string; New name for the watchlist.

Responses:

204: Watchlist renamed successfully.

DELETE /api/v1/watchlists/{watchlistId}/items
Summary: Remove items from watchlist.

Description: Removes specified items from a watchlist..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

watchlistId in path (required); Type: string; Unique identifier of the watchlist.

Request body:

application/json: Array of Schema: WatchlistItemDto.

Responses:

204: Items removed successfully.

POST /api/v1/watchlists/{watchlistId}/items
Summary: Add items to watchlist.

Description: Adds new items to an existing watchlist..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

watchlistId in path (required); Type: string; Unique identifier of the watchlist.

Request body:

application/json: Array of Schema: WatchlistItemDto.

Responses:

201: Items added successfully.

PUT /api/v1/watchlists/{watchlistId}/items
Summary: Update items in watchlist.

Description: Updates existing items in a watchlist (rank, etc.)..

Parameters:

x-request-id in header (required); Type: string; A unique request identifier..

x-api-key in header (required); Type: string; API key for authentication..

x-user-key in header (required); Type: string; User-specific authentication key..

watchlistId in path (required); Type: string; Unique identifier of the watchlist.

Request body:

application/json: Array of Schema: WatchlistItemDto.

Responses:

204: Items updated successfully.
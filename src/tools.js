'use strict';

var READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
var WRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

function object(properties, required) {
    var schema = { type: 'object', properties: properties || {}, additionalProperties: false };
    if (required && required.length) schema.required = required;
    return schema;
}

var TOOLS = [
    { name: 'pws_get_state', description: 'Get the loaded save, current date, player promotion, company size, cash, and home market.', inputSchema: object(), annotations: READ_ONLY },
    { name: 'pws_search', description: 'Search across PWS workers, promotions, shows, titles, storylines, tag teams, stables, venues, and news. Start here when resolving a name to an ID.', inputSchema: object({
        query: { type: 'string', minLength: 1, maxLength: 120 },
        categories: { type: 'array', items: { type: 'string', enum: ['all', 'workers', 'promotions', 'shows', 'titles', 'storylines', 'teams', 'stables', 'venues', 'news'] } },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 15 }
    }, ['query']), annotations: READ_ONLY },
    { name: 'pws_database_catalog', description: 'List every PWS database table/view or describe the columns of one table. Use this before a custom pws_query.', inputSchema: object({
        table: { type: 'string', description: 'Optional exact table or view name.' },
        includeSql: { type: 'boolean', default: false }
    }), annotations: READ_ONLY },
    { name: 'pws_query', description: 'Run a parameterized read-only SQL query against the loaded save. SELECT, WITH, and safe schema PRAGMAs only; results are capped.', inputSchema: object({
        sql: { type: 'string', minLength: 1 },
        parameters: { type: 'array', items: {} },
        maxRows: { type: 'integer', minimum: 1, maximum: 2000, default: 500 }
    }, ['sql']), annotations: READ_ONLY },
    { name: 'pws_company_overview', description: 'Get a management dashboard for the player company: size, money, finance history, roster balance/payroll, availability, shows, titles, storylines, and alerts.', inputSchema: object(), annotations: READ_ONLY },
    { name: 'pws_get_roster', description: 'List the active player-company roster with contracts, alignment, push, wages, availability, skills, popularity, momentum, morale, and recent usage.', inputSchema: object({
        search: { type: 'string' }, gender: { type: 'string' }, push: { type: 'string' }, alignment: { type: 'string', enum: ['Face', 'Heel'] },
        brand: { type: 'integer' }, availableOnly: { type: 'boolean', default: false }, includeStaff: { type: 'boolean', default: false },
        usageDays: { type: 'integer', minimum: 7, maximum: 730, default: 90 }, limit: { type: 'integer', minimum: 1, maximum: 500, default: 150 }
    }), annotations: READ_ONLY },
    { name: 'pws_get_worker', description: 'Get a comprehensive worker profile including all attributes, active contracts, relationships, chemistry, storylines, and recent history.', inputSchema: object({ workerId: { type: 'integer' } }, ['workerId']), annotations: READ_ONLY },
    { name: 'pws_get_worker_contracts', description: 'List all active contracts for a worker.', inputSchema: object({ workerId: { type: 'integer' } }, ['workerId']), annotations: READ_ONLY },
    { name: 'pws_analyze_hiring', description: 'Rank realistic hiring targets using company size, cash, home market, roster gaps, requested needs, skills, popularity, availability, risk, and wage fit.', inputSchema: object({
        needs: { type: 'string', maxLength: 500, description: 'Natural-language roster needs, such as young technical babyfaces, women, tag teams, promo talent, or main-event stars.' },
        gender: { type: 'string' }, style: { type: 'string' }, minAge: { type: 'integer', minimum: 18, maximum: 80 }, maxAge: { type: 'integer', minimum: 18, maximum: 100 },
        maxMonthlyWage: { type: 'number', minimum: 0 }, maxAppearanceWage: { type: 'number', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 }
    }), annotations: READ_ONLY },
    { name: 'pws_contract_advice', description: 'Review player-company contracts and suggest priority renewal, retention, renegotiation, or release based on expiry, pay, performance, momentum, morale, availability, and usage.', inputSchema: object({
        workerId: { type: 'integer' }, horizonDays: { type: 'integer', minimum: 1, maximum: 1825, default: 180 },
        usageDays: { type: 'integer', minimum: 7, maximum: 730, default: 90 }, includeStaff: { type: 'boolean', default: false }, limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 }
    }), annotations: READ_ONLY },
    { name: 'pws_get_upcoming_shows', description: 'List upcoming unfinished shows for the player promotion with duration and booking progress.', inputSchema: object({ limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 } }), annotations: READ_ONLY },
    { name: 'pws_get_show', description: 'Get any show and its complete card, participants, results, ratings, location, and runtime.', inputSchema: object({ showId: { type: 'integer' } }, ['showId']), annotations: READ_ONLY },
    { name: 'pws_get_titles', description: 'List active championships and current champions for a promotion; defaults to the player promotion.', inputSchema: object({ promotionId: { type: 'integer' } }), annotations: READ_ONLY },
    { name: 'pws_get_storylines', description: 'List active storylines and participants for a promotion; defaults to the player promotion.', inputSchema: object({ promotionId: { type: 'integer' } }), annotations: READ_ONLY },
    { name: 'pws_get_booking_context', description: 'Get everything needed to book a show intelligently: existing card, eligible roster, titles, storylines, recent matches, runtime, and company preferences.', inputSchema: object({ showId: { type: 'integer', description: 'Defaults to the next unfinished show.' } }), annotations: READ_ONLY },
    { name: 'pws_plan_show', description: 'Generate a complete dry-run card using roster ranking, alignment, active storylines, availability, fatigue-by-usage, brand, and runtime. This never changes the save.', inputSchema: object({
        showId: { type: 'integer', description: 'Defaults to the next unfinished show.' }, minutes: { type: 'integer', minimum: 10, maximum: 600 },
        matchCount: { type: 'integer', minimum: 1, maximum: 12 }, includeAngles: { type: 'boolean', default: true }, angleCount: { type: 'integer', minimum: 0, maximum: 8 }, angleLength: { type: 'integer', minimum: 3, maximum: 15 },
        featureContractIds: { type: 'array', items: { type: 'integer' } }, avoidContractIds: { type: 'array', items: { type: 'integer' } }, notes: { type: 'string', maxLength: 1000 }
    }), annotations: READ_ONLY },
    { name: 'pws_validate_show_plan', description: 'Validate a proposed show card against the live show, roster availability, duplicates, and runtime without changing the save.', inputSchema: object({
        showId: { type: 'integer' }, segments: { type: 'array', minItems: 1, maxItems: 40, items: { type: 'object' } },
        allowMultipleMatches: { type: 'boolean', default: false }, allowOverrun: { type: 'boolean', default: false }
    }, ['showId', 'segments']), annotations: READ_ONLY },
    { name: 'pws_apply_show_plan', description: 'BOOK A REVIEWED CARD INTO THE SAVE. Adds validated match/angle segments and rolls back newly created segments if a later addition fails. Requires confirmed=true.', inputSchema: object({
        showId: { type: 'integer' }, segments: { type: 'array', minItems: 1, maxItems: 40, items: { type: 'object' } },
        confirmed: { type: 'boolean', const: true }, allowMultipleMatches: { type: 'boolean', default: false }, allowOverrun: { type: 'boolean', default: false }
    }, ['showId', 'segments', 'confirmed']), annotations: WRITE },
    { name: 'pws_execute_action', description: 'CHANGE THE CURRENT SAVE through a validated PWS action. Use purpose-built tools when available. Requires confirmed=true. Supported actions: book_match, book_angle, remove_segment, create_storyline, end_storyline, add_worker_to_storyline, remove_worker_from_storyline, sign_worker, release_worker, award_title, vacate_title, update_worker_attribute (sandbox only), create_news_item, create_email.', inputSchema: object({
        action: { type: 'string', enum: ['book_match', 'book_angle', 'remove_segment', 'create_storyline', 'end_storyline', 'add_worker_to_storyline', 'remove_worker_from_storyline', 'sign_worker', 'release_worker', 'award_title', 'vacate_title', 'update_worker_attribute', 'create_news_item', 'create_email'] },
        arguments: { type: 'object' }, confirmed: { type: 'boolean', const: true }
    }, ['action', 'arguments', 'confirmed']), annotations: WRITE },
    { name: 'pws_get_audit_log', description: 'Get the PWS action audit log for this plugin.', inputSchema: object(), annotations: READ_ONLY }
];

var ROUTES = {
    pws_get_state: 'game.state', pws_search: 'search', pws_database_catalog: 'database.catalog', pws_query: 'database.query',
    pws_company_overview: 'company.overview', pws_get_roster: 'roster.list', pws_get_worker: 'game.worker',
    pws_get_worker_contracts: 'game.contracts', pws_analyze_hiring: 'hiring.analyze', pws_contract_advice: 'contracts.advise',
    pws_get_upcoming_shows: 'shows.upcoming', pws_get_show: 'shows.get', pws_get_titles: 'game.titles',
    pws_get_storylines: 'game.storylines', pws_get_booking_context: 'booking.context', pws_plan_show: 'booking.plan',
    pws_validate_show_plan: 'booking.validate', pws_apply_show_plan: 'booking.apply', pws_execute_action: 'actions.execute',
    pws_get_audit_log: 'actions.audit'
};

var PROMPTS = [
    { name: 'pws_hiring_review', description: 'Analyze company needs and produce a prioritized, affordable hiring shortlist.', arguments: [{ name: 'needs', description: 'Optional roster priorities or booking direction.', required: false }] },
    { name: 'pws_book_next_show', description: 'Review context, draft the next show, explain key choices, and wait for approval before applying.', arguments: [{ name: 'direction', description: 'Optional creative direction and must-feature talent.', required: false }] },
    { name: 'pws_contract_review', description: 'Review contract value, expirations, morale, and usage, then recommend actions.', arguments: [{ name: 'horizon_days', description: 'Expiry horizon, usually 90-365 days.', required: false }] }
];

function prompt(name, args) {
    args = args || {};
    if (name === 'pws_hiring_review') return 'Use pws_company_overview, then pws_analyze_hiring with these needs: ' + (args.needs || 'detect roster gaps automatically') + '. Present a short ranked list with role, fit, risk, affordability, and a proposed contract structure. Do not sign anyone without explicit approval.';
    if (name === 'pws_book_next_show') return 'Use pws_get_upcoming_shows and pws_get_booking_context, then create a coherent dry-run card with pws_plan_show. Creative direction: ' + (args.direction || 'advance active stories, avoid stale rematches, and balance stars with development') + '. Explain the card and wait for explicit approval before pws_apply_show_plan.';
    if (name === 'pws_contract_review') return 'Use pws_company_overview and pws_contract_advice with a horizon of ' + (args.horizon_days || '180') + ' days. Group recommendations into priority renewals, monitor/renegotiate, and release candidates. Treat suggested ranges as estimates and do not change the save without approval.';
    throw new Error('Unknown prompt: ' + name);
}

module.exports = { PROMPTS: PROMPTS, ROUTES: ROUTES, TOOLS: TOOLS, prompt: prompt };

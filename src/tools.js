'use strict';

var READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
var WRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

function object(properties, required) {
    var schema = { type: 'object', properties: properties || {}, additionalProperties: false };
    if (required && required.length) schema.required = required;
    return schema;
}

var idArray = { type: 'array', items: { type: 'integer', minimum: 1 }, uniqueItems: true };
var participantGroups = {
    type: 'array', minItems: 1,
    items: { type: 'array', minItems: 1, items: { type: 'integer', minimum: 1 }, uniqueItems: true }
};
var nullableContractId = { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] };
var winner = { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'string', enum: ['auto', 'draw'] }] };
var cardPosition = { type: 'string', enum: ['preshow', 'mainshow', 'postshow'], default: 'mainshow' };
var beatMember = object({ contractID: { type: 'integer', minimum: 1 }, workerID: { type: 'integer', minimum: 1 } }, ['contractID']);
var beat = object({
    type: { type: 'string', minLength: 1, maxLength: 50 },
    length: { type: 'integer', minimum: 1, maximum: 120 },
    group1: { type: 'array', items: beatMember }, group2: { type: 'array', items: beatMember }, group3: { type: 'array', items: beatMember },
    option1: { type: 'string', maxLength: 200 }, option2: { type: 'string', maxLength: 200 }
}, ['type', 'length']);
var matchPlanSegment = object({
    type: { type: 'string', const: 'match' }, participants: Object.assign({}, participantGroups, { minItems: 2 }),
    gimmick: { type: 'string', maxLength: 200 }, segmentLength: { type: 'integer', minimum: 1, maximum: 120 }, winner: winner,
    winType: { type: 'string', maxLength: 100 }, purpose: { type: 'string', maxLength: 100 }, purposeWorker: nullableContractId,
    losers: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'string', const: 'Unspecified' }, { type: 'null' }] },
    segmentName: { type: 'string', maxLength: 500 }, description: { type: 'string', maxLength: 10000 },
    finishSpecific: { type: 'string', maxLength: 500 }, matchStoryId: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'string', const: 'None' }] },
    segmentPosition: { type: 'integer', minimum: 1 }, cardPosition: cardPosition, referee: nullableContractId,
    announcers: Object.assign({}, idArray, { maxItems: 4 }), agent: nullableContractId,
    titleIds: Object.assign({}, idArray, { maxItems: 20, description: 'Canonical championship field. Every listed title is validated and persisted in matchtitles.' }),
    ringsideWorkers: idArray, planningReason: { type: 'string', description: 'Planner metadata; returned by pws_plan_show and removed before persistence.' }
}, ['type', 'participants']);
var anglePlanSegment = object({
    type: { type: 'string', const: 'angle' }, angleType: { type: 'string', maxLength: 100 },
    participants: participantGroups, beats: { type: 'array', minItems: 1, items: beat },
    segmentLength: { type: 'integer', minimum: 1, maximum: 120 }, segmentName: { type: 'string', maxLength: 500 },
    description: { type: 'string', maxLength: 10000 }, segmentPosition: { type: 'integer', minimum: 1 },
    cardPosition: cardPosition, planningReason: { type: 'string', description: 'Planner metadata; removed before persistence.' }
}, ['type', 'participants']);
var showPlanSegments = { type: 'array', minItems: 1, maxItems: 40, items: { oneOf: [matchPlanSegment, anglePlanSegment] } };
var updateChanges = object({
    participants: participantGroups, segmentLength: { type: 'integer', minimum: 1, maximum: 120 },
    segmentPosition: { type: 'integer', minimum: 1 }, cardPosition: cardPosition,
    segmentName: { type: 'string', maxLength: 500 }, description: { type: 'string', maxLength: 10000 },
    titleIds: Object.assign({}, idArray, { maxItems: 20, description: 'Replace all championship associations for a match.' }),
    winner: winner, winType: { type: 'string', maxLength: 100 }, finishSpecific: { type: 'string', maxLength: 500 },
    purpose: { type: 'string', maxLength: 100 }, purposeWorker: nullableContractId,
    losers: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'string', const: 'Unspecified' }, { type: 'null' }] },
    gimmick: { type: 'string', maxLength: 200 }, matchStoryId: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'string', const: 'None' }] },
    referee: nullableContractId, agent: nullableContractId, announcers: Object.assign({}, idArray, { maxItems: 4 }), ringsideWorkers: idArray,
    angleType: { type: 'string', maxLength: 100 }, beats: { type: 'array', minItems: 1, items: beat },
    subjectContractIds: Object.assign({}, idArray, { description: 'Angle participants stored by PWS as subjects (the only persisted per-participant role flag in the current schema).' })
}, []);
updateChanges.minProperties = 1;

var TOOLS = [
    { name: 'pws_get_state', description: 'Get the loaded save, current date, player promotion, PWS popularity-derived size, continental popularity, cash, and home market.', inputSchema: object(), annotations: READ_ONLY },
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
        usageDays: { type: 'integer', minimum: 7, maximum: 730, default: 90 }, lean: { type: 'boolean', default: false },
        offset: { type: 'integer', minimum: 0, default: 0 }, limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 }
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
    { name: 'pws_get_venues', description: 'Browse venues by name, geography, type, and capacity before assigning one to a show.', inputSchema: object({
        search: { type: 'string', maxLength: 100 }, continent: { type: 'string' }, country: { type: 'integer' }, region: { type: 'integer' }, type: { type: 'string' },
        minCapacity: { type: 'integer', minimum: 0 }, maxCapacity: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 }
    }), annotations: READ_ONLY },
    { name: 'pws_get_titles', description: 'List active championships and current champions for a promotion; defaults to the player promotion.', inputSchema: object({ promotionId: { type: 'integer' } }), annotations: READ_ONLY },
    { name: 'pws_get_storylines', description: 'List active storylines and participants for a promotion; filter one storyline or use lean=true for heat/status only.', inputSchema: object({ promotionId: { type: 'integer' }, storylineId: { type: 'integer', minimum: 1 }, lean: { type: 'boolean', default: false } }), annotations: READ_ONLY },
    { name: 'pws_diagnose_storyline_attribution', description: 'Audit recent completed player-company segments that contained at least two members of an active or ended storyline and flag likely missing storyline-history attribution.', inputSchema: object({ limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 } }), annotations: READ_ONLY },
    { name: 'pws_get_stables', description: 'List player-company stables and their members, or filter by stable ID.', inputSchema: object({ stableId: { type: 'integer', minimum: 1 } }), annotations: READ_ONLY },
    { name: 'pws_get_gimmicks', description: 'Browse PWS gimmicks, requirements, and preferred disposition before assigning one to a contract.', inputSchema: object({
        search: { type: 'string', maxLength: 100 }, disposition: { type: 'string', enum: ['Face', 'Heel', 'None'] }, limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 }
    }), annotations: READ_ONLY },
    { name: 'pws_get_booking_context', description: 'Get everything needed to book a show intelligently: existing card, eligible roster, titles, storylines, recent matches, runtime, and company preferences.', inputSchema: object({ showId: { type: 'integer', description: 'Defaults to the next unfinished show.' } }), annotations: READ_ONLY },
    { name: 'pws_plan_show', description: 'Generate a complete dry-run card using roster ranking, alignment, active storylines, availability, fatigue-by-usage, brand, and runtime. This never changes the save.', inputSchema: object({
        showId: { type: 'integer', description: 'Defaults to the next unfinished show.' }, minutes: { type: 'integer', minimum: 10, maximum: 600 },
        matchCount: { type: 'integer', minimum: 1, maximum: 12 }, includeAngles: { type: 'boolean', default: true }, angleCount: { type: 'integer', minimum: 0, maximum: 8 }, angleLength: { type: 'integer', minimum: 3, maximum: 15 },
        featureContractIds: { type: 'array', items: { type: 'integer' } }, avoidContractIds: { type: 'array', items: { type: 'integer' } }, notes: { type: 'string', maxLength: 1000 }
    }), annotations: READ_ONLY },
    { name: 'pws_validate_show_plan', description: 'Validate a proposed show card against the live show, roster availability, duplicates, and runtime without changing the save.', inputSchema: object({
        showId: { type: 'integer' }, segments: showPlanSegments,
        allowMultipleMatches: { type: 'boolean', default: false }, allowOverrun: { type: 'boolean', default: false }
    }, ['showId', 'segments']), annotations: READ_ONLY },
    { name: 'pws_apply_show_plan', description: 'BOOK A REVIEWED CARD INTO THE SAVE. Adds validated match/angle segments and rolls back newly created segments if a later addition fails. Requires confirmed=true.', inputSchema: object({
        showId: { type: 'integer' }, segments: showPlanSegments,
        confirmed: { type: 'boolean', const: true }, allowMultipleMatches: { type: 'boolean', default: false }, allowOverrun: { type: 'boolean', default: false }
    }, ['showId', 'segments', 'confirmed']), annotations: WRITE },
    { name: 'pws_update_segment', description: 'PREVIEW OR UPDATE ONE EXISTING MATCH/ANGLE. Preserves unrelated fields, validates the live show, writes transactionally, verifies the saved segment, and requires preview=false plus confirmed=true to mutate.', inputSchema: object({
        segmentId: { type: 'integer', minimum: 1 }, changes: updateChanges,
        preview: { type: 'boolean', default: true, description: 'Defaults to true. Set false only after reviewing the preview.' },
        confirmed: { type: 'boolean', description: 'Must be true when preview=false.' }
    }, ['segmentId', 'changes']), annotations: WRITE },
    { name: 'pws_remove_segment', description: 'PREVIEW OR REMOVE ONE EXISTING MATCH/ANGLE from an unfinished player-company show. Verifies that the segment no longer exists. Defaults to preview.', inputSchema: object({
        segmentId: { type: 'integer', minimum: 1 }, preview: { type: 'boolean', default: true }, confirmed: { type: 'boolean' }
    }, ['segmentId']), annotations: WRITE },
    { name: 'pws_set_show_venue', description: 'PREVIEW OR SET the venue for an unfinished player-company show, optionally making it the recurring event series default. Validates the venue and verifies persistence. Defaults to preview.', inputSchema: object({
        showId: { type: 'integer', minimum: 1 }, venueId: { type: 'integer', minimum: 1 }, setEventDefault: { type: 'boolean', default: false }, preview: { type: 'boolean', default: true }, confirmed: { type: 'boolean' }
    }, ['showId', 'venueId']), annotations: WRITE },
    { name: 'pws_create_event', description: 'BETA: PREVIEW OR CREATE a player-company event series through PWS. This does not schedule an instance; use pws_schedule_show afterward. Defaults to preview.', inputSchema: object({
        name: { type: 'string', minLength: 1, maxLength: 100 }, recurrenceType: { type: 'string', enum: ['Weekly', 'Monthly', 'Annual', 'OneOff'], default: 'OneOff' },
        recurrenceMonth: { type: 'integer', minimum: 1, maximum: 12 }, recurrenceWeek: { type: 'integer', minimum: 1, maximum: 5 }, prestige: { type: 'integer', minimum: 1, maximum: 100, default: 1 },
        importance: { type: 'string', enum: ['Huge', 'High', 'Normal', 'Unimportant', 'House Show'], default: 'Normal' }, eventLength: { type: 'integer', minimum: 1, maximum: 600, default: 120 },
        brand: { type: 'integer', minimum: 1 }, preview: { type: 'boolean', default: true }, confirmed: { type: 'boolean' }
    }, ['name']), annotations: WRITE },
    { name: 'pws_schedule_show', description: 'BETA: PREVIEW OR SCHEDULE a show instance for a player-company event series, optionally at a validated venue. Verifies persistence. Defaults to preview.', inputSchema: object({
        eventId: { type: 'integer', minimum: 1 }, airDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, location: { type: 'string', maxLength: 200 }, venueId: { type: 'integer', minimum: 1 },
        preview: { type: 'boolean', default: true }, confirmed: { type: 'boolean' }
    }, ['eventId', 'airDate']), annotations: WRITE },
    { name: 'pws_cancel_show', description: 'BETA: PREVIEW OR CANCEL an unfinished player-company show. Verifies the cancellation flag. Defaults to preview.', inputSchema: object({
        showId: { type: 'integer', minimum: 1 }, preview: { type: 'boolean', default: true }, confirmed: { type: 'boolean' }
    }, ['showId']), annotations: WRITE },
    { name: 'pws_end_storyline', description: 'PREVIEW OR END an active player-company storyline. Verifies that it became inactive. Defaults to preview.', inputSchema: object({
        storylineId: { type: 'integer', minimum: 1 }, preview: { type: 'boolean', default: true }, confirmed: { type: 'boolean' }
    }, ['storylineId']), annotations: WRITE },
    { name: 'pws_add_storyline_worker', description: 'PREVIEW OR ADD an active player-company contract to an active storyline. Verifies persisted membership. Defaults to preview.', inputSchema: object({
        storylineId: { type: 'integer', minimum: 1 }, contractId: { type: 'integer', minimum: 1 }, preview: { type: 'boolean', default: true }, confirmed: { type: 'boolean' }
    }, ['storylineId', 'contractId']), annotations: WRITE },
    { name: 'pws_remove_storyline_worker', description: 'PREVIEW OR REMOVE a worker from an active storyline. Verifies removal. Defaults to preview.', inputSchema: object({
        storylineId: { type: 'integer', minimum: 1 }, contractId: { type: 'integer', minimum: 1 }, preview: { type: 'boolean', default: true }, confirmed: { type: 'boolean' }
    }, ['storylineId', 'contractId']), annotations: WRITE },
    { name: 'pws_release_worker', description: 'PREVIEW OR RELEASE an active player-company contract. Verifies that the contract became inactive. Defaults to preview.', inputSchema: object({
        contractId: { type: 'integer', minimum: 1 }, preview: { type: 'boolean', default: true }, confirmed: { type: 'boolean' }
    }, ['contractId']), annotations: WRITE },
    { name: 'pws_vacate_title', description: 'PREVIEW OR VACATE a player-company championship. Verifies that all current champion slots were cleared. Defaults to preview.', inputSchema: object({
        titleId: { type: 'integer', minimum: 1 }, reason: { type: 'string', maxLength: 500 }, preview: { type: 'boolean', default: true }, confirmed: { type: 'boolean' }
    }, ['titleId']), annotations: WRITE },
    { name: 'pws_create_stable', description: 'BETA: PREVIEW OR CREATE a player-company stable with at least two active contracts and an optional leader. Verifies the stable and complete membership. Defaults to preview.', inputSchema: object({
        name: { type: 'string', minLength: 1, maxLength: 100 }, contractIds: Object.assign({}, idArray, { minItems: 2 }), leaderContractId: nullableContractId,
        heat: { type: 'integer', minimum: 1, maximum: 100, default: 50 }, preview: { type: 'boolean', default: true }, confirmed: { type: 'boolean' }
    }, ['name', 'contractIds']), annotations: WRITE },
    { name: 'pws_dissolve_stable', description: 'BETA: PREVIEW OR PERMANENTLY DISSOLVE a player-company stable. Verifies deletion. Defaults to preview.', inputSchema: object({
        stableId: { type: 'integer', minimum: 1 }, preview: { type: 'boolean', default: true }, confirmed: { type: 'boolean' }
    }, ['stableId']), annotations: WRITE },
    { name: 'pws_add_stable_worker', description: 'BETA: PREVIEW OR ADD an active player-company contract to a stable, optionally as a leader. Verifies membership. Defaults to preview.', inputSchema: object({
        stableId: { type: 'integer', minimum: 1 }, contractId: { type: 'integer', minimum: 1 }, isLeader: { type: 'boolean', default: false }, preview: { type: 'boolean', default: true }, confirmed: { type: 'boolean' }
    }, ['stableId', 'contractId']), annotations: WRITE },
    { name: 'pws_remove_stable_worker', description: 'BETA: PREVIEW OR REMOVE a worker while preserving PWS minimum stable membership. Verifies removal. Defaults to preview.', inputSchema: object({
        stableId: { type: 'integer', minimum: 1 }, contractId: { type: 'integer', minimum: 1 }, preview: { type: 'boolean', default: true }, confirmed: { type: 'boolean' }
    }, ['stableId', 'contractId']), annotations: WRITE },
    { name: 'pws_set_contract_gimmick', description: 'BETA: PREVIEW OR SET the gimmick on an active player-company contract through PWS contract modification. Verifies persistence. Defaults to preview.', inputSchema: object({
        contractId: { type: 'integer', minimum: 1 }, gimmick: { type: 'string', minLength: 1, maxLength: 100 }, preview: { type: 'boolean', default: true }, confirmed: { type: 'boolean' }
    }, ['contractId', 'gimmick']), annotations: WRITE },
    { name: 'pws_execute_action', description: 'ADVANCED SAVE ACTION for PWS operations that do not yet have a purpose-built verified tool. Requires confirmed=true. Supported actions: create_storyline, sign_worker, award_title, update_worker_attribute (sandbox only), create_news_item, create_email.', inputSchema: object({
        action: { type: 'string', enum: ['create_storyline', 'sign_worker', 'award_title', 'update_worker_attribute', 'create_news_item', 'create_email'] },
        arguments: { type: 'object', description: 'Action-specific arguments. sign_worker requires workerId, promotionId, contractType, and role; it also accepts exclusive, wages, contractLength, push, gimmick, contractName, and brand.' }, confirmed: { type: 'boolean', const: true }
    }, ['action', 'arguments', 'confirmed']), annotations: WRITE },
    { name: 'pws_get_audit_log', description: 'Get the PWS action audit log for this plugin.', inputSchema: object(), annotations: READ_ONLY }
];

var ROUTES = {
    pws_get_state: 'game.state', pws_search: 'search', pws_database_catalog: 'database.catalog', pws_query: 'database.query',
    pws_company_overview: 'company.overview', pws_get_roster: 'roster.list', pws_get_worker: 'game.worker',
    pws_get_worker_contracts: 'game.contracts', pws_analyze_hiring: 'hiring.analyze', pws_contract_advice: 'contracts.advise',
    pws_get_upcoming_shows: 'shows.upcoming', pws_get_show: 'shows.get', pws_get_venues: 'venues.list', pws_get_titles: 'game.titles',
    pws_get_storylines: 'game.storylines', pws_diagnose_storyline_attribution: 'storylines.diagnoseAttribution', pws_get_stables: 'stables.list', pws_get_gimmicks: 'gimmicks.list', pws_get_booking_context: 'booking.context', pws_plan_show: 'booking.plan',
    pws_validate_show_plan: 'booking.validate', pws_apply_show_plan: 'booking.apply', pws_update_segment: 'booking.updateSegment',
    pws_remove_segment: 'booking.removeSegment', pws_set_show_venue: 'shows.setVenue', pws_create_event: 'events.create', pws_schedule_show: 'shows.schedule', pws_cancel_show: 'shows.cancel', pws_end_storyline: 'storylines.end', pws_add_storyline_worker: 'storylines.addWorker',
    pws_remove_storyline_worker: 'storylines.removeWorker', pws_release_worker: 'contracts.release', pws_set_contract_gimmick: 'contracts.setGimmick', pws_vacate_title: 'titles.vacate',
    pws_create_stable: 'stables.create', pws_dissolve_stable: 'stables.dissolve', pws_add_stable_worker: 'stables.addWorker', pws_remove_stable_worker: 'stables.removeWorker', pws_execute_action: 'actions.execute',
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

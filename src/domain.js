'use strict';

var REGION_POP_COLUMNS = {
    'North America': 'northAmericaPop',
    'South America': 'southAmericaPop',
    'Asia': 'asiaPop',
    'Oceania': 'oceaniaPop',
    'Africa': 'africaPop',
    'Europe': 'europePop'
};

var EVENT_IMPORTANCE_NAMES = {
    '0': 'House Show',
    '1': 'Unimportant',
    '2': 'Normal',
    '3': 'High',
    '4': 'Huge'
};

function integer(value) {
    var parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
}

function numeric(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : null;
}

function boolean(value) {
    if (value === true || value === false) return value;
    if (value == null || value === '') return false;
    var normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].indexOf(normalized) !== -1) return true;
    if (['0', 'false', 'no', 'off'].indexOf(normalized) !== -1) return false;
    return Boolean(value);
}

function canParticipateInMatch(type) {
    var normalized = type == null ? '' : String(type).trim().toLowerCase();
    return !normalized || normalized === 'wrestler' || normalized === 'occasional wrestler';
}

function matchEligibleWorkerSql(alias) {
    return (alias || 'w') + ".type IN ('Wrestler','Occasional Wrestler')";
}

function clamp(value, fallback, min, max) {
    var parsed = integer(value);
    if (parsed === null) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

function text(value, length) {
    return value == null ? '' : String(value).trim().slice(0, length || 200);
}

function importanceName(value) {
    if (value == null) return null;
    var key = String(value).trim();
    return Object.prototype.hasOwnProperty.call(EVENT_IMPORTANCE_NAMES, key) ? EVENT_IMPORTANCE_NAMES[key] : key;
}

function query(api, sql, params) {
    return api.database.query(sql, params || []);
}

function get(api, sql, params) {
    return api.database.get(sql, params || []) || null;
}

function addDays(value, days) {
    var date = new Date(String(value || '') + 'T00:00:00Z');
    if (Number.isNaN(date.getTime())) return null;
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function dateOnOrBefore(value, targetDate) {
    var left = new Date(String(value || '') + 'T00:00:00Z');
    var right = new Date(String(targetDate || '') + 'T00:00:00Z');
    return !Number.isNaN(left.getTime()) && !Number.isNaN(right.getTime()) && left.getTime() <= right.getTime();
}

function unavailabilityAt(row, targetDate) {
    row = row || {};
    var reasons = [];
    function active(flag, reason, returnDate, detail) {
        if (!boolean(flag)) return;
        if (returnDate && dateOnOrBefore(returnDate, targetDate)) return;
        reasons.push({ reason: reason, detail: detail || null, returnDate: returnDate || null });
    }
    active(Boolean(row.injuryType), 'injury', row.injuryHealDate, row.injuryType);
    active(row.isInRehab, 'rehab', row.rehabReturnDate);
    active(row.isSuspended, 'workerSuspension', row.suspensionReturnDate);
    active(row.contractSuspended != null ? row.contractSuspended : row.suspended, 'contractSuspension', row.contractSuspensionEndDate || row.suspensionEndDate);
    active(row.onTimeOff, 'timeOff', row.timeOffEndDate);
    return reasons;
}

function isAvailableOn(row, targetDate) {
    return unavailabilityAt(row, targetDate).length === 0;
}

function ageAt(birthDate, currentDate) {
    var birth = new Date(String(birthDate || '') + 'T00:00:00Z');
    var current = new Date(String(currentDate || '') + 'T00:00:00Z');
    if (Number.isNaN(birth.getTime()) || Number.isNaN(current.getTime())) return null;
    var age = current.getUTCFullYear() - birth.getUTCFullYear();
    if (current.getUTCMonth() < birth.getUTCMonth() ||
        (current.getUTCMonth() === birth.getUTCMonth() && current.getUTCDate() < birth.getUTCDate())) age -= 1;
    return age >= 0 && age <= 120 ? age : null;
}

function popularityTier(value) {
    value = Number(value || 0);
    if (value >= 80) return 'Continental';
    if (value >= 60) return 'National';
    if (value >= 40) return 'Cult';
    if (value >= 20) return 'Regional';
    return 'Local';
}

function promotionSize(promotion) {
    var values = ['northAmericaPop', 'southAmericaPop', 'europePop', 'asiaPop', 'oceaniaPop', 'africaPop']
        .map(function (key) { return Number(promotion[key] || 0); })
        .sort(function (a, b) { return a - b; });
    var nationalOrHigher = values.filter(function (value) { return value >= 60; }).length;
    if (nationalOrHigher >= 3) return 'Global';
    if (nationalOrHigher >= 2) return 'Intercontinental';
    return popularityTier(values[values.length - 1] || 0);
}

function advancedPromotionSize(rows) {
    if (!rows || !rows.length) return 'Local';
    var countryTotals = {};
    var countryCounts = {};
    var continentTotals = {};
    var continentCounts = {};
    var maxRegion = 0;
    var regionsAt40 = 0;
    rows.forEach(function (row) {
        var value = Number(row.popularity || 0);
        var country = row.countryName || '';
        var continent = row.continent || '';
        maxRegion = Math.max(maxRegion, value);
        if (value >= 40) regionsAt40 += 1;
        if (country) { countryTotals[country] = (countryTotals[country] || 0) + value; countryCounts[country] = (countryCounts[country] || 0) + 1; }
        if (continent) { continentTotals[continent] = (continentTotals[continent] || 0) + value; continentCounts[continent] = (continentCounts[continent] || 0) + 1; }
    });
    var continentsAt60 = Object.keys(continentTotals).filter(function (key) { return continentTotals[key] / continentCounts[key] >= 60; }).length;
    if (continentsAt60 >= 3) return 'Global';
    if (continentsAt60 >= 2) return 'Intercontinental';
    if (continentsAt60 >= 1) return 'Continental';
    if (Object.keys(countryTotals).some(function (key) { return countryTotals[key] / countryCounts[key] >= 60; })) return 'National';
    if (regionsAt40 >= 2) return 'Cult';
    return maxRegion >= 20 ? 'Regional' : 'Local';
}

function context(api) {
    var state = api.game.getState() || {};
    var save = get(api, 'SELECT saveName, saveCurrentDate, saveUserPromotion FROM saveinfo LIMIT 1') || {};
    var world = state.advancedPopularityMode == null ? (get(api, 'SELECT advancedPopularityMode FROM gameworld LIMIT 1') || {}) : {};
    var promotionId = integer(state.promotionId || state.promotionID || state.saveUserPromotion || save.saveUserPromotion);
    if (promotionId === null) throw new Error('No PWS save or player promotion is loaded');
    var promotion = get(api,
        'SELECT promotionID, fullName, shortName, basedIn, basedInCountry, basedInRegion, style, prestige, money, northAmericaPop, southAmericaPop, europePop, asiaPop, oceaniaPop, africaPop, womensDivision, entToWresRatio, angleToWresRatio, storylinesExpected, preferredWeeklyEvents, preferredMonthlyEvents FROM promotions WHERE promotionID = ?',
        [promotionId]);
    if (!promotion) throw new Error('The player promotion could not be found');
    var advancedModeValue = state.advancedPopularityMode != null ? state.advancedPopularityMode : world.advancedPopularityMode;
    var advancedMode = Number(advancedModeValue || 0) === 1;
    var size = promotionSize(promotion);
    if (advancedMode) {
        var regionalRows = query(api, 'SELECT prp.popularity,c.countryName,c.continent FROM promotionRegionalPopularity prp JOIN regions r ON r.regionID=prp.regionID JOIN countries c ON c.countryID=r.regionParent WHERE prp.promotionID=?', [promotionId]);
        size = advancedPromotionSize(regionalRows);
    }
    return {
        saveName: state.saveName || save.saveName || null,
        currentDate: state.currentDate || save.saveCurrentDate || null,
        promotionId: promotionId,
        promotion: promotion,
        size: size,
        sizeMethod: advancedMode ? 'regional popularity' : 'continental popularity',
        popularityColumn: REGION_POP_COLUMNS[promotion.basedIn] || 'northAmericaPop'
    };
}

function state(api) {
    var ctx = context(api);
    return {
        loaded: true,
        saveName: ctx.saveName,
        currentDate: ctx.currentDate,
        promotionId: ctx.promotionId,
        promotionName: ctx.promotion.fullName,
        promotionShortName: ctx.promotion.shortName,
        size: ctx.size,
        sizeMethod: ctx.sizeMethod,
        prestige: numeric(ctx.promotion.prestige),
        popularity: {
            northAmerica: numeric(ctx.promotion.northAmericaPop),
            southAmerica: numeric(ctx.promotion.southAmericaPop),
            europe: numeric(ctx.promotion.europePop),
            asia: numeric(ctx.promotion.asiaPop),
            oceania: numeric(ctx.promotion.oceaniaPop),
            africa: numeric(ctx.promotion.africaPop)
        },
        money: integer(ctx.promotion.money),
        region: ctx.promotion.basedIn,
        country: ctx.promotion.basedInCountry,
        area: ctx.promotion.basedInRegion,
        style: ctx.promotion.style
    };
}

function catalog(api, options) {
    options = options || {};
    var tableName = text(options.table, 100);
    if (tableName) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(tableName)) throw new Error('Invalid table or view name');
        var exists = get(api, "SELECT type, name, sql FROM sqlite_master WHERE name = ? AND type IN ('table','view')", [tableName]);
        if (!exists) throw new Error('Unknown table or view: ' + tableName);
        return {
            object: { name: exists.name, type: exists.type },
            columns: query(api, "SELECT cid, name, type, \"notnull\" AS required, dflt_value AS defaultValue, pk AS primaryKey FROM pragma_table_info(?)", [tableName]),
            createSql: options.includeSql ? exists.sql : undefined
        };
    }
    return {
        objects: query(api, "SELECT type, name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name"),
        hint: 'Call again with table to list its columns, then use pws_query for custom read-only analysis.'
    };
}

function search(api, options) {
    options = options || {};
    var term = text(options.query, 120);
    if (!term) throw new Error('query is required');
    var like = '%' + term.replace(/[\\%_]/g, '\\$&') + '%';
    var limit = clamp(options.limit, 15, 1, 50);
    var requested = Array.isArray(options.categories) ? options.categories : [];
    var all = !requested.length || requested.indexOf('all') !== -1;
    function wanted(name) { return all || requested.indexOf(name) !== -1; }
    var results = {};

    if (wanted('workers')) results.workers = query(api,
        "SELECT workerID AS id, name, type, status, gender, style, basedIn, wrestlingSkill, entertainment, starPower, northAmericaPop, southAmericaPop, europePop, asiaPop, oceaniaPop, africaPop FROM workers WHERE name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' ORDER BY CASE WHEN name LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, name LIMIT ?",
        [like, like, term + '%', limit]);
    if (wanted('promotions')) results.promotions = query(api,
        "SELECT promotionID AS id, fullName AS name, shortName, status, style, prestige, money, basedIn FROM promotions WHERE fullName LIKE ? ESCAPE '\\' OR shortName LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' ORDER BY prestige DESC LIMIT ?",
        [like, like, like, limit]);
    if (wanted('shows')) results.shows = query(api,
        "SELECT ei.instanceID AS id, COALESCE(NULLIF(ei.customName,''),e.eventName) AS name, ei.airDate AS date, p.shortName AS promotion, ei.complete, ei.score FROM eventinstance ei JOIN events e ON e.eventID=ei.eventID JOIN promotions p ON p.promotionID=e.promotionID WHERE e.eventName LIKE ? ESCAPE '\\' OR ei.customName LIKE ? ESCAPE '\\' ORDER BY ei.airDate DESC LIMIT ?",
        [like, like, limit]);
    if (wanted('titles')) results.titles = query(api,
        "SELECT t.titleID AS id, t.name, p.shortName AS promotion, t.type, t.prestige, t.inactive, w.name AS champion FROM titles t JOIN promotions p ON p.promotionID=t.promotionID LEFT JOIN workers w ON w.workerID=t.currentChampion WHERE t.name LIKE ? ESCAPE '\\' ORDER BY t.inactive, t.prestige DESC LIMIT ?",
        [like, limit]);
    if (wanted('storylines')) results.storylines = query(api,
        "SELECT s.storylineID AS id, s.storylineName AS name, p.shortName AS promotion, s.active, s.startDate, s.endDate, s.overview FROM storylines s JOIN promotions p ON p.promotionID=s.promotionID WHERE s.storylineName LIKE ? ESCAPE '\\' OR s.overview LIKE ? ESCAPE '\\' ORDER BY s.active DESC, s.startDate DESC LIMIT ?",
        [like, like, limit]);
    if (wanted('teams')) results.teams = query(api,
        "SELECT tt.tagID AS id, COALESCE(NULLIF(pt.tagName,''),tt.defaultName) AS name, w1.name AS worker1, w2.name AS worker2, p.shortName AS promotion, tt.tagExperience FROM tagteams tt JOIN workers w1 ON w1.workerID=tt.worker1 JOIN workers w2 ON w2.workerID=tt.worker2 LEFT JOIN promotiontagteams pt ON pt.tagID=tt.tagID LEFT JOIN promotions p ON p.promotionID=pt.promotionID WHERE tt.defaultName LIKE ? ESCAPE '\\' OR pt.tagName LIKE ? ESCAPE '\\' OR w1.name LIKE ? ESCAPE '\\' OR w2.name LIKE ? ESCAPE '\\' LIMIT ?",
        [like, like, like, like, limit]);
    if (wanted('stables')) results.stables = query(api,
        "SELECT s.stableID AS id, s.stableName AS name, p.shortName AS promotion, s.stableHeat FROM stables s JOIN promotions p ON p.promotionID=s.promotionID WHERE s.stableName LIKE ? ESCAPE '\\' ORDER BY s.stableHeat DESC LIMIT ?",
        [like, limit]);
    if (wanted('venues')) results.venues = query(api,
        "SELECT venueID AS id, venueName AS name, capacity, type, continent, country, region, wrestlingPopularity, preferredStyle FROM venues WHERE venueName LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' ORDER BY capacity DESC LIMIT ?",
        [like, like, limit]);
    if (wanted('news')) results.news = query(api,
        "SELECT newsID AS id, date, newsTitle AS title, newsType AS type FROM vw_news WHERE newsTitle LIKE ? ESCAPE '\\' OR newsDescription LIKE ? ESCAPE '\\' ORDER BY date DESC LIMIT ?",
        [like, like, limit]);

    return { query: term, categories: Object.keys(results), results: results };
}

function rosterRows(api, ctx, options) {
    options = options || {};
    var cutoff = addDays(ctx.currentDate, -clamp(options.usageDays, 90, 7, 730));
    var params = [cutoff, ctx.promotionId];
    var filters = [];
    if (options.workerId != null) { filters.push('w.workerID = ?'); params.push(Number(options.workerId)); }
    if (options.search) { filters.push("(w.name LIKE ? OR c.contractName LIKE ?)"); params.push('%' + text(options.search, 100) + '%', '%' + text(options.search, 100) + '%'); }
    if (options.gender) { filters.push('w.gender = ?'); params.push(text(options.gender, 30)); }
    if (options.push) { filters.push('c.push = ?'); params.push(text(options.push, 40)); }
    if (options.alignment) { filters.push('c.role = ?'); params.push(text(options.alignment, 20)); }
    if (options.brand != null) { filters.push('c.brand = ?'); params.push(Number(options.brand)); }
    if (options.availableOnly) filters.push("COALESCE(w.injuryType,'') = '' AND COALESCE(w.isInRehab,0)=0 AND COALESCE(w.isSuspended,0)=0 AND COALESCE(c.suspended,0)=0 AND COALESCE(c.onTimeOff,0)=0");
    var limit = clamp(options.limit, 100, 1, 500);
    var offset = Math.max(0, integer(options.offset) || 0);
    params.push(limit, offset);
    return query(api, [
        'WITH usage AS (SELECT o.contractID, COUNT(DISTINCT s.segmentID) appearances,',
        "SUM(CASE WHEN s.segmentType='Match' THEN 1 ELSE 0 END) matches, SUM(CASE WHEN s.segmentType='Angle' THEN 1 ELSE 0 END) angles, MAX(ei.airDate) lastBooked",
        'FROM opponents o JOIN segments s ON s.segmentID=o.segmentID JOIN eventinstance ei ON ei.instanceID=s.showID',
        'WHERE ei.complete=1 AND ei.airDate>=? GROUP BY o.contractID)',
        "SELECT c.contractID, c.workerID, COALESCE(NULLIF(c.contractName,''),w.name) name, w.type, w.gender, w.birthDate, w.style, w.basedIn,",
        'c.role AS alignment, c.push, c.brand, c.contractType, c.exclusive, c.expiryDate, c.wagePerMonth, c.wagePerAppearance, c.contractLength, c.momentum, c.morale, c.lastAppearance,',
        'c.suspended AS contractSuspended, c.suspensionEndDate AS contractSuspensionEndDate, c.onTimeOff, c.timeOffEndDate, w.status, w.injuryType, w.injuryHealDate, w.isSuspended,w.suspensionReturnDate,w.canDoAngles,',
        'w.wrestlingSkill, w.entertainment, w.starPower, w.stamina, w.psychology, w.safety, w.potential, w.tagExpert, w.marketingDream, w.injuryProne,w.isInRehab,w.rehabReturnDate,',
        'w.' + ctx.popularityColumn + ' AS marketPopularity, COALESCE(u.appearances,0) appearances, COALESCE(u.matches,0) matches, COALESCE(u.angles,0) angles, u.lastBooked',
        'FROM contracts c JOIN workers w ON w.workerID=c.workerID LEFT JOIN usage u ON u.contractID=c.contractID',
        "WHERE c.promotionID=? AND c.finalised=1 AND c.expired=0 AND c.contractStarted=1",
        options.includeStaff ? '' : 'AND ' + matchEligibleWorkerSql('w'),
        filters.length ? 'AND ' + filters.join(' AND ') : '',
        'ORDER BY COALESCE(c.momentum,0) DESC, w.' + ctx.popularityColumn + ' DESC LIMIT ? OFFSET ?'
    ].join(' '), params);
}

function normalizeRoster(row, currentDate) {
    var result = Object.assign({}, row);
    result.contractID = undefined;
    result.workerID = undefined;
    result.contractId = integer(row.contractID);
    result.workerId = integer(row.workerID);
    result.age = ageAt(row.birthDate, currentDate);
    result.unavailabilityReasons = unavailabilityAt(row, currentDate).map(function (item) {
        return {
            reason: item.reason === 'workerSuspension' || item.reason === 'contractSuspension' ? 'suspension' : item.reason,
            detail: item.detail,
            returnDate: item.returnDate
        };
    });
    result.available = result.unavailabilityReasons.length === 0;
    result.matchEligible = canParticipateInMatch(row.type);
    result.appearances = integer(row.appearances) || 0;
    result.matches = integer(row.matches) || 0;
    result.angles = integer(row.angles) || 0;
    return result;
}

function roster(api, options) {
    options = options || {};
    var ctx = context(api);
    var rows = rosterRows(api, ctx, options).map(function (row) { return normalizeRoster(row, ctx.currentDate); });
    if (options.lean) rows = rows.map(function (row) { return {
        contractId: row.contractId, workerId: row.workerId, name: row.name, type: row.type, gender: row.gender,
        alignment: row.alignment, push: row.push, brand: row.brand, available: row.available,
        unavailableUntil: row.rehabReturnDate || row.injuryHealDate || null, unavailabilityReasons: row.unavailabilityReasons, momentum: row.momentum,
        popularity: row.marketPopularity, appearances: row.appearances, lastBooked: row.lastBooked
    }; });
    var offset = Math.max(0, integer(options.offset) || 0);
    var limit = clamp(options.limit, 100, 1, 500);
    var total = rosterCount(api, ctx, options);
    return { game: state(api), count: rows.length, total: total, offset: offset, limit: limit, hasMore: offset + rows.length < total, nextOffset: offset + rows.length < total ? offset + rows.length : null, usageWindowDays: clamp(options.usageDays, 90, 7, 730), roster: rows };
}

function rosterCount(api, ctx, options) {
    var params = [ctx.promotionId];
    var filters = [];
    if (options.workerId != null) { filters.push('w.workerID=?'); params.push(Number(options.workerId)); }
    if (options.search) { filters.push('(w.name LIKE ? OR c.contractName LIKE ?)'); params.push('%' + text(options.search, 100) + '%', '%' + text(options.search, 100) + '%'); }
    if (options.gender) { filters.push('w.gender=?'); params.push(text(options.gender, 30)); }
    if (options.push) { filters.push('c.push=?'); params.push(text(options.push, 40)); }
    if (options.alignment) { filters.push('c.role=?'); params.push(text(options.alignment, 20)); }
    if (options.brand != null) { filters.push('c.brand=?'); params.push(Number(options.brand)); }
    if (options.availableOnly) filters.push("COALESCE(w.injuryType,'')='' AND COALESCE(w.isInRehab,0)=0 AND COALESCE(w.isSuspended,0)=0 AND COALESCE(c.suspended,0)=0 AND COALESCE(c.onTimeOff,0)=0");
    var row = get(api, [
        'SELECT COUNT(*) AS total FROM contracts c JOIN workers w ON w.workerID=c.workerID',
        'WHERE c.promotionID=? AND c.finalised=1 AND c.expired=0 AND c.contractStarted=1',
        options.includeStaff ? '' : 'AND ' + matchEligibleWorkerSql('w'), filters.length ? 'AND ' + filters.join(' AND ') : ''
    ].join(' '), params) || {};
    return Number(row.total || 0);
}

function titles(api, promotionId) {
    return query(api,
        "SELECT t.titleID AS titleId,t.name,t.type,t.prestige,t.brand,t.defences,t.won,t.currentChampion,t.currentChampion2,t.currentChampion3,w1.name champion1,w2.name champion2,w3.name champion3 FROM titles t LEFT JOIN workers w1 ON w1.workerID=t.currentChampion LEFT JOIN workers w2 ON w2.workerID=t.currentChampion2 LEFT JOIN workers w3 ON w3.workerID=t.currentChampion3 WHERE t.promotionID=? AND t.inactive=0 ORDER BY t.prestige DESC,t.name",
        [promotionId]);
}

function storylines(api, promotionId, options) {
    options = options || {};
    var rows;
    if (api.game && typeof api.game.getActiveStorylines === 'function') rows = api.game.getActiveStorylines(promotionId) || [];
    else rows = query(api,
        "SELECT s.storylineID,s.storylineName,s.overview,s.startDate,GROUP_CONCAT(sw.contractID) contractIds,GROUP_CONCAT(COALESCE(NULLIF(c.contractName,''),w.name),' | ') workers FROM storylines s LEFT JOIN storylineworkers sw ON sw.storylineID=s.storylineID LEFT JOIN contracts c ON c.contractID=sw.contractID LEFT JOIN workers w ON w.workerID=c.workerID WHERE s.promotionID=? AND s.active=1 GROUP BY s.storylineID ORDER BY s.startDate",
        [promotionId]);
    if (options.storylineId != null) rows = rows.filter(function (row) { return Number(row.storylineID || row.storylineId || row.id) === Number(options.storylineId); });
    if (options.lean) rows = rows.map(function (row) { return {
        storylineId: Number(row.storylineID || row.storylineId || row.id), name: row.storylineName || row.name,
        heat: numeric(row.heat), segmentCount: integer(row.segmentCount), startDate: row.startDate || null
    }; });
    return rows;
}

function upcomingShows(api, options) {
    var ctx = context(api);
    options = options || {};
    var limit = clamp(options.limit, 20, 1, 100);
    var rows = query(api,
        "SELECT ei.instanceID AS showId,ei.airDate AS date,COALESCE(NULLIF(ei.customName,''),e.eventName) name,e.eventID,e.eventLength AS length,e.importance,e.brand,ei.location,ei.venueID,COALESCE(SUM(s.segmentLength),0) bookedMinutes,COUNT(s.segmentID) segmentCount FROM eventinstance ei JOIN events e ON e.eventID=ei.eventID LEFT JOIN segments s ON s.showID=ei.instanceID WHERE e.promotionID=? AND COALESCE(ei.complete,0)=0 AND COALESCE(ei.isCancelled,0)=0 GROUP BY ei.instanceID ORDER BY ei.airDate,ei.instanceID LIMIT ?",
        [ctx.promotionId, limit]);
    // PWS can retain live event instances whose event row is not visible through the
    // normal join.  Query the native view every time, rather than only when the join
    // is completely empty: otherwise one joinable show hides every orphaned show.
    var knownShowIds = {};
    rows.forEach(function (row) { knownShowIds[Number(row.showId)] = true; });
    var remaining = Math.max(0, limit - rows.length);
    if (remaining) {
        var viewRows = query(api, 'SELECT * FROM vw_eventinstance WHERE promotionID=? AND COALESCE(complete,0)=0 AND COALESCE(isCancelled,0)=0 ORDER BY airDate,instanceID LIMIT ?', [ctx.promotionId, limit]);
        viewRows.forEach(function (row) {
            var showId = Number(row.instanceID || row.showId);
            if (!showId || knownShowIds[showId] || rows.length >= limit) return;
            var totals = get(api, 'SELECT COALESCE(SUM(segmentLength),0) AS bookedMinutes,COUNT(segmentID) AS segmentCount FROM segments WHERE showID=?', [showId]) || {};
            rows.push({
                showId: showId, date: row.airDate || row.date,
                name: row.customName || row.eventName || row.name,
                eventID: row.eventID, length: row.eventLength || row.length,
                importance: importanceName(row.importance), brand: row.brand, location: row.location,
                venueID: row.venueID, bookedMinutes: Number(totals.bookedMinutes || 0), segmentCount: Number(totals.segmentCount || 0)
            });
            knownShowIds[showId] = true;
        });
    }
    rows.sort(function (left, right) {
        return String(left.date || '').localeCompare(String(right.date || '')) || Number(left.showId) - Number(right.showId);
    });
    rows.forEach(function (row) { row.importance = importanceName(row.importance); });
    return { game: state(api), shows: rows };
}

function venues(api, options) {
    options = options || {};
    var params = [];
    var filters = [];
    if (options.search) { filters.push('(venueName LIKE ? OR description LIKE ?)'); params.push('%' + text(options.search, 100) + '%', '%' + text(options.search, 100) + '%'); }
    if (options.continent) { filters.push('continent=?'); params.push(text(options.continent, 50)); }
    if (options.country != null) { filters.push('country=?'); params.push(Number(options.country)); }
    if (options.region != null) { filters.push('region=?'); params.push(Number(options.region)); }
    if (options.type) { filters.push('type=?'); params.push(text(options.type, 50)); }
    if (options.minCapacity != null) { filters.push('capacity>=?'); params.push(Math.max(0, Number(options.minCapacity))); }
    if (options.maxCapacity != null) { filters.push('capacity<=?'); params.push(Math.max(0, Number(options.maxCapacity))); }
    params.push(clamp(options.limit, 50, 1, 200));
    return { venues: query(api, 'SELECT venueID AS venueId,venueName AS name,capacity,type,continent,country,region,wrestlingPopularity,preferredStyle,promotionExclusivity,openDate,closeDate FROM venues ' + (filters.length ? 'WHERE ' + filters.join(' AND ') : '') + ' ORDER BY capacity DESC,venueName LIMIT ?', params) };
}

function gimmicks(api, options) {
    options = options || {};
    var filters = [];
    var params = [];
    if (options.search) { filters.push('(name LIKE ? OR description LIKE ? OR modifiers LIKE ?)'); params.push('%' + text(options.search, 100) + '%', '%' + text(options.search, 100) + '%', '%' + text(options.search, 100) + '%'); }
    if (options.disposition) { filters.push('dispositionPreference=?'); params.push(text(options.disposition, 20)); }
    params.push(clamp(options.limit, 100, 1, 500));
    return { gimmicks: query(api, 'SELECT gimmickID AS gimmickId,name,description,modifiers,dispositionPreference AS disposition FROM gimmicks ' + (filters.length ? 'WHERE ' + filters.join(' AND ') : '') + ' ORDER BY name LIMIT ?', params) };
}

function personas(api, options) {
    options = options || {};
    var ctx = context(api);
    var workerId = options.workerId == null ? null : integer(options.workerId);
    var contractId = options.contractId == null ? null : integer(options.contractId);
    if (options.workerId != null && workerId === null) throw new Error('workerId must be an integer');
    if (options.contractId != null && contractId === null) throw new Error('contractId must be an integer');
    var contract = null;
    if (contractId !== null) {
        contract = get(api, "SELECT c.contractID AS contractId,c.workerID AS workerId,w.name AS workerName,COALESCE(NULLIF(c.contractName,''),w.name) AS activeName,c.contractName,c.gimmick,c.contractPicture,c.hasMask,c.promotionID FROM contracts c JOIN workers w ON w.workerID=c.workerID WHERE c.contractID=?", [contractId]);
        if (!contract) throw new Error('Contract not found: ' + contractId);
        if (Number(contract.promotionID) !== ctx.promotionId) throw new Error('The contract does not belong to the player promotion');
        if (workerId !== null && Number(workerId) !== Number(contract.workerId)) throw new Error('workerId does not match contractId');
        workerId = Number(contract.workerId);
    }
    var params = [];
    var filters = [];
    if (workerId !== null) { filters.push('ae.workerID=?'); params.push(workerId); }
    if (options.search) { filters.push('(ae.alterEgoName LIKE ? OR w.name LIKE ? OR ae.preferredGimmick LIKE ?)'); var like = '%' + text(options.search, 100) + '%'; params.push(like, like, like); }
    params.push(clamp(options.limit, 100, 1, 500));
    var rows = query(api, [
        'SELECT ae.egoID AS personaId,ae.workerID AS workerId,w.name AS workerName,ae.alterEgoName AS name,',
        'ae.promotionExclusive,ep.fullName AS exclusivePromotion,CASE WHEN ae.promotionExclusive IS NULL OR ae.promotionExclusive=0 OR ae.promotionExclusive=? THEN 1 ELSE 0 END AS promotionEligible,ae.preferredGimmick,ae.percentUsed,ae.hasMask,ae.picture,ae.minDate,ae.maxDate,',
        "CASE WHEN (ae.minDate IS NULL OR ae.minDate='' OR date(ae.minDate)<=date(?)) AND (ae.maxDate IS NULL OR ae.maxDate='' OR date(ae.maxDate)>=date(?)) THEN 1 ELSE 0 END AS dateEligible",
        'FROM alteregos ae JOIN workers w ON w.workerID=ae.workerID LEFT JOIN promotions ep ON ep.promotionID=ae.promotionExclusive' + (filters.length ? ' WHERE ' + filters.join(' AND ') : ''),
        'ORDER BY ae.workerID,COALESCE(ae.percentUsed,0) DESC,ae.alterEgoName LIMIT ?'
    ].join(' '), [ctx.promotionId, ctx.currentDate, ctx.currentDate].concat(params));
    if (contract && contract.hasMask != null) contract.hasMask = boolean(contract.hasMask);
    rows.forEach(function (row) {
        row.promotionEligible = boolean(row.promotionEligible);
        row.dateEligible = boolean(row.dateEligible);
        row.hasMask = boolean(row.hasMask);
    });
    return {
        game: state(api), contract: contract, personas: rows,
        note: 'Personas are applied to the promotion contract name; the underlying global worker name is preserved. Promotion-ineligible personas must first be made available with pws_set_persona_availability. Date-ineligible personas require allowDateOverride=true when selected for creative-sandbox booking.'
    };
}

function promises(api, options) {
    options = options || {};
    var ctx = context(api);
    var filters = ['p.promotionID=?'];
    var params = [ctx.promotionId];
    if (options.workerId != null) { filters.push('(c1.workerID=? OR c2.workerID=?)'); params.push(Number(options.workerId), Number(options.workerId)); }
    if (options.contractId != null) { filters.push('(p.worker1=? OR p.worker2=?)'); params.push(Number(options.contractId), Number(options.contractId)); }
    if (options.status === 'pending') filters.push('COALESCE(p.agreed,0)=0 AND COALESCE(p.expired,0)=0 AND COALESCE(p.passed,0)=0');
    else if (options.status === 'active') filters.push('p.agreed=1 AND COALESCE(p.expired,0)=0 AND COALESCE(p.passed,0)=0');
    else if (options.status === 'declined') filters.push('p.agreed=-1');
    else if (options.status === 'fulfilled') filters.push('p.passed=1');
    else if (options.status === 'expired') filters.push('p.expired=1');
    else if (!options.includeResolved) filters.push('COALESCE(p.agreed,0) IN (0,1) AND COALESCE(p.expired,0)=0 AND COALESCE(p.passed,0)=0');
    params.push(clamp(options.limit, 100, 1, 500));
    var rows = query(api, [
        'SELECT p.promiseID AS promiseId,p.type,p.startDate,p.expiryDate,CAST(julianday(p.expiryDate)-julianday(?) AS INTEGER) AS daysRemaining,p.agreed,p.expired,p.passed,p.promotionID,',
        'p.worker1 AS contractId,c1.workerID AS workerId,COALESCE(NULLIF(c1.contractName,\'\'),w1.name) AS workerName,',
        'NULLIF(p.worker2,\'\') AS relatedContractId,c2.workerID AS relatedWorkerId,COALESCE(NULLIF(c2.contractName,\'\'),w2.name) AS relatedWorkerName,',
        'NULLIF(p.title,\'\') AS titleId,t.name AS titleName,',
        '(SELECT e.emailID FROM emails e WHERE e.promiseID=p.promiseID ORDER BY e.emailID DESC LIMIT 1) AS decisionEmailId,',
        '(SELECT e.decisionIsHandled FROM emails e WHERE e.promiseID=p.promiseID ORDER BY e.emailID DESC LIMIT 1) AS decisionIsHandled',
        'FROM promises p LEFT JOIN contracts c1 ON c1.contractID=p.worker1 LEFT JOIN workers w1 ON w1.workerID=c1.workerID',
        'LEFT JOIN contracts c2 ON c2.contractID=p.worker2 LEFT JOIN workers w2 ON w2.workerID=c2.workerID',
        'LEFT JOIN titles t ON t.titleID=p.title WHERE ' + filters.join(' AND '),
        'ORDER BY CASE WHEN COALESCE(p.agreed,0)=0 THEN 0 ELSE 1 END,p.expiryDate,p.promiseID LIMIT ?'
    ].join(' '), [ctx.currentDate].concat(params)).map(function (row) {
        row.status = Number(row.passed) ? 'fulfilled' : Number(row.expired) ? 'expired' : Number(row.agreed) === -1 ? 'declined' : Number(row.agreed) === 1 ? 'active' : 'pending';
        row.overdue = (row.status === 'pending' || row.status === 'active') && row.daysRemaining != null && Number(row.daysRemaining) < 0;
        row.actionable = row.status === 'pending' && row.decisionEmailId != null && Number(row.decisionIsHandled || 0) === 0;
        row.expired = boolean(row.expired);
        row.passed = boolean(row.passed);
        if (row.decisionIsHandled != null) row.decisionIsHandled = boolean(row.decisionIsHandled);
        return row;
    });
    return { game: state(api), promises: rows, counts: rows.reduce(function (counts, row) { counts[row.status] = (counts[row.status] || 0) + 1; return counts; }, {}), note: 'Pending promises are requests not yet agreed; active promises were accepted and still need to be fulfilled.' };
}

function storylineAttributionDiagnostics(api, options) {
    options = options || {};
    var ctx = context(api);
    var limit = clamp(options.limit, 100, 1, 500);
    var rows = query(api, [
        'SELECT s.segmentID,s.segmentName,s.segmentType,s.rating,ei.airDate,ei.instanceID AS showId,st.storylineID,st.storylineName,',
        'COUNT(DISTINCT sw.contractID) AS storylineMembersPresent,',
        "(SELECT COUNT(*) FROM storylinehistories sh WHERE sh.storylineID=st.storylineID AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(sh.segmentName,'&amp;','&'),'&#39;',CHAR(39)),'&#x27;',CHAR(39)),'&apos;',CHAR(39)),'&quot;',CHAR(34)),'&lt;','<'),'&gt;','>')=REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(s.segmentName,'&amp;','&'),'&#39;',CHAR(39)),'&#x27;',CHAR(39)),'&apos;',CHAR(39)),'&quot;',CHAR(34)),'&lt;','<'),'&gt;','>') AND sh.segmentRating=s.rating) AS matchingHistoryRows",
        'FROM segments s JOIN eventinstance ei ON ei.instanceID=s.showID JOIN events e ON e.eventID=ei.eventID',
        'JOIN opponents o ON o.segmentID=s.segmentID AND COALESCE(o.isRingside,0)=0',
        'JOIN storylineworkers sw ON sw.contractID=o.contractID',
        'JOIN storylines st ON st.storylineID=sw.storylineID AND st.promotionID=e.promotionID',
        "WHERE e.promotionID=? AND ei.complete=1 AND COALESCE(ei.isCancelled,0)=0 AND (st.startDate IS NULL OR st.startDate='' OR date(ei.airDate)>=date(st.startDate)) AND (st.endDate IS NULL OR st.endDate='' OR date(ei.airDate)<=date(st.endDate))",
        'GROUP BY s.segmentID,st.storylineID HAVING COUNT(DISTINCT sw.contractID)>=2',
        'ORDER BY ei.airDate DESC,s.segmentID DESC LIMIT ?'
    ].join(' '), [ctx.promotionId, limit]);
    var missing = rows.filter(function (row) { return Number(row.matchingHistoryRows || 0) === 0; });
    return { game: state(api), inspectedCandidates: rows.length, missingCount: missing.length, healthyCount: rows.length - missing.length, status: missing.length ? 'suspected-attribution-gaps' : 'no-gaps-detected', candidates: rows, suspectedMissing: missing, caveat: 'History rows do not store segment IDs or dates; matching uses storyline, HTML-entity-normalized segment name, and rating within the storyline lifetime.' };
}

function show(api, options) {
    options = options || {};
    var showId = integer(options.showId);
    if (showId === null) throw new Error('showId is required');
    var header = get(api,
        "SELECT ei.instanceID AS showId,ei.airDate AS date,COALESCE(NULLIF(ei.customName,''),e.eventName) name,e.eventLength AS length,e.importance,e.brand,ei.complete,ei.isCancelled,ei.location,ei.attendance,ei.score,ei.venueID AS venueId,v.venueName AS venueName,v.capacity AS venueCapacity,v.type AS venueType,e.preferredVenue AS eventDefaultVenueId,p.promotionID,p.fullName AS promotion FROM eventinstance ei JOIN events e ON e.eventID=ei.eventID JOIN promotions p ON p.promotionID=e.promotionID LEFT JOIN venues v ON v.venueID=ei.venueID WHERE ei.instanceID=?",
        [showId]);
    if (!header) throw new Error('Show not found: ' + showId);
    header.importance = importanceName(header.importance);
    header.complete = boolean(header.complete);
    header.isCancelled = boolean(header.isCancelled);
    var segments = query(api,
        "SELECT s.segmentID AS segmentId,s.segmentType AS type,s.segmentLength AS length,s.segmentorder AS position,s.segmentName AS name,s.description,s.purpose,s.winType,s.winner,s.winnerName,s.angleType,s.rating,s.isPreshow,s.isMainshow,s.isPostshow,GROUP_CONCAT(CAST(o.opponentSet AS TEXT)||':'||o.contractID||':'||COALESCE(NULLIF(c.contractName,''),w.name),' | ') participantSummary FROM segments s LEFT JOIN opponents o ON o.segmentID=s.segmentID LEFT JOIN contracts c ON c.contractID=o.contractID LEFT JOIN workers w ON w.workerID=COALESCE(o.workerID,c.workerID) WHERE s.showID=? GROUP BY s.segmentID ORDER BY s.isPreshow DESC,s.isMainshow DESC,s.isPostshow DESC,s.segmentorder,s.segmentID",
        [showId]);
    var opponentRows = query(api, [
        'SELECT o.segmentID,o.opponentID,o.opponentSet,o.contractID,o.workerID,o.isRingside,o.isSubject,',
        "COALESCE(NULLIF(c.contractName,''),w.name) AS name",
        'FROM opponents o JOIN segments s ON s.segmentID=o.segmentID',
        'LEFT JOIN contracts c ON c.contractID=o.contractID',
        'LEFT JOIN workers w ON w.workerID=COALESCE(o.workerID,c.workerID)',
        'WHERE s.showID=? ORDER BY o.segmentID,o.opponentSet,o.opponentID'
    ].join(' '), [showId]);
    var opponentsBySegment = {};
    opponentRows.forEach(function (row) {
        var key = Number(row.segmentID);
        if (!opponentsBySegment[key]) opponentsBySegment[key] = [];
        opponentsBySegment[key].push(row);
    });
    var titleRows = query(api,
        'SELECT mt.segmentID,mt.titleID,mt.champion,mt.winner,t.name,t.type,t.currentChampion,t.currentChampion2,t.currentChampion3,t.defences FROM matchtitles mt JOIN segments s ON s.segmentID=mt.segmentID LEFT JOIN titles t ON t.titleID=mt.titleID WHERE s.showID=? ORDER BY mt.matchTitleID',
        [showId]);
    var titlesBySegment = {};
    titleRows.forEach(function (title) {
        var key = Number(title.segmentID);
        if (!titlesBySegment[key]) titlesBySegment[key] = [];
        titlesBySegment[key].push({
            titleId: Number(title.titleID), name: title.name || null, type: title.type || null,
            champion: title.champion == null ? null : Number(title.champion),
            winner: title.winner == null ? null : Number(title.winner),
            currentChampionIds: [title.currentChampion, title.currentChampion2, title.currentChampion3].filter(function (id) { return Number(id) > 0; }).map(Number),
            defences: Number(title.defences || 0)
        });
    });
    segments.forEach(function (segment) {
        segment.type = String(segment.type || '').toLowerCase();
        segment.isPreshow = boolean(segment.isPreshow);
        segment.isMainshow = boolean(segment.isMainshow);
        segment.isPostshow = boolean(segment.isPostshow);
        var details = (opponentsBySegment[Number(segment.segmentId)] || []).map(function (row) {
            return {
                contractId: row.contractID == null ? null : Number(row.contractID),
                workerId: row.workerID == null ? null : Number(row.workerID),
                name: row.name || null,
                group: Number(row.opponentSet),
                ringside: boolean(row.isRingside) || Number(row.opponentSet) < 0,
                subject: boolean(row.isSubject)
            };
        });
        var groups = {};
        details.forEach(function (opponent) {
            if (opponent.contractId === null || opponent.ringside) return;
            if (!groups[opponent.group]) groups[opponent.group] = [];
            groups[opponent.group].push(opponent.contractId);
        });
        segment.participants = Object.keys(groups).map(Number).sort(function (a, b) { return a - b; }).map(function (group) { return groups[group]; });
        segment.opponentDetails = details;
        segment.ringsideWorkers = details.filter(function (opponent) { return opponent.ringside && opponent.contractId !== null; }).map(function (opponent) { return opponent.contractId; });
        segment.subjectContractIds = details.filter(function (opponent) { return opponent.subject && opponent.contractId !== null; }).map(function (opponent) { return opponent.contractId; });
        segment.titles = titlesBySegment[Number(segment.segmentId)] || [];
        segment.titleIds = segment.titles.map(function (title) { return title.titleId; });
    });
    return { show: header, bookedMinutes: segments.reduce(function (sum, segment) { return sum + Number(segment.length || 0); }, 0), segments: segments };
}

function finances(api, ctx) {
    var history = query(api,
        'SELECT date,tickets,merchandise,ppv,sponsorships,subscriptions,developmental,staff,marketing,production,taxes,networks FROM financehistory WHERE promotionID=? ORDER BY date DESC LIMIT 12',
        [ctx.promotionId]);
    var summary = history.reduce(function (acc, row) {
        var revenue = Number(row.tickets || 0) + Number(row.merchandise || 0) + Number(row.ppv || 0) + Number(row.sponsorships || 0) + Number(row.subscriptions || 0);
        var costs = Number(row.developmental || 0) + Number(row.staff || 0) + Number(row.marketing || 0) + Number(row.production || 0) + Number(row.taxes || 0) + Number(row.networks || 0);
        acc.revenue += revenue;
        acc.costs += costs;
        acc.net += revenue - costs;
        return acc;
    }, { revenue: 0, costs: 0, net: 0 });
    return { cash: integer(ctx.promotion.money), monthsAvailable: history.length, totals: summary, monthlyAverageNet: history.length ? Math.round(summary.net / history.length) : null, history: history };
}

function overview(api) {
    var ctx = context(api);
    var rosterData = rosterRows(api, ctx, { includeStaff: true, limit: 500 });
    var wrestlers = rosterData.filter(function (row) { return canParticipateInMatch(row.type); });
    var payroll = rosterData.reduce(function (sum, row) { return sum + Number(row.wagePerMonth || 0); }, 0);
    var perAppearance = rosterData.reduce(function (sum, row) { return sum + Number(row.wagePerAppearance || 0); }, 0);
    var byGender = {};
    var byPush = {};
    wrestlers.forEach(function (row) {
        byGender[row.gender || 'Unknown'] = (byGender[row.gender || 'Unknown'] || 0) + 1;
        byPush[row.push || 'Unassigned'] = (byPush[row.push || 'Unassigned'] || 0) + 1;
    });
    var shows = upcomingShows(api, { limit: 10 }).shows;
    var stories = storylines(api, ctx.promotionId);
    var titleRows = titles(api, ctx.promotionId);
    return {
        game: state(api),
        promotion: ctx.promotion,
        finance: finances(api, ctx),
        roster: { totalStaff: rosterData.length, wrestlers: wrestlers.length, byGender: byGender, byPush: byPush, monthlyBasePayroll: payroll, totalPerAppearanceCommitment: perAppearance },
        availability: {
            injured: wrestlers.filter(function (row) { return Boolean(row.injuryType); }).length,
            suspended: wrestlers.filter(function (row) { return Boolean(row.isSuspended || row.contractSuspended); }).length,
            timeOff: wrestlers.filter(function (row) { return Boolean(row.onTimeOff); }).length
        },
        upcomingShows: shows,
        titles: titleRows,
        activeStorylines: stories,
        alerts: {
            expiringWithin90Days: query(api, "SELECT c.contractID AS contractId,c.workerID AS workerId,COALESCE(NULLIF(c.contractName,''),w.name) name,c.expiryDate,c.push,c.morale FROM contracts c JOIN workers w ON w.workerID=c.workerID WHERE c.promotionID=? AND c.finalised=1 AND c.expired=0 AND c.expiryDate BETWEEN ? AND ? ORDER BY c.expiryDate LIMIT 25", [ctx.promotionId, ctx.currentDate, addDays(ctx.currentDate, 90)]),
            unbookedIn90Days: wrestlers.filter(function (row) { return Number(row.appearances || 0) === 0; }).slice(0, 25).map(function (row) { return { contractId: row.contractID, workerId: row.workerID, name: row.name, push: row.push, momentum: row.momentum }; })
        }
    };
}

function workerProfile(api, options) {
    options = options || {};
    var workerId = integer(options.workerId);
    if (workerId === null) throw new Error('workerId is required');
    var ctx = context(api);
    var worker = get(api, 'SELECT * FROM workers WHERE workerID=?', [workerId]);
    if (!worker) throw new Error('Worker not found: ' + workerId);
    worker.age = ageAt(worker.birthDate, ctx.currentDate);
    return {
        game: state(api),
        worker: worker,
        contracts: query(api, "SELECT c.*,p.fullName AS promotionName,p.shortName AS promotionShortName FROM contracts c JOIN promotions p ON p.promotionID=c.promotionID WHERE c.workerID=? AND c.finalised=1 AND c.expired=0 ORDER BY c.exclusive DESC,p.prestige DESC", [workerId]),
        relationships: query(api, 'SELECT r.*,CASE WHEN r.worker1=? THEN w2.workerID ELSE w1.workerID END relatedWorkerId,CASE WHEN r.worker1=? THEN w2.name ELSE w1.name END relatedWorker FROM relationships r JOIN workers w1 ON w1.workerID=r.worker1 JOIN workers w2 ON w2.workerID=r.worker2 WHERE r.worker1=? OR r.worker2=? ORDER BY ABS(r.relationship) DESC', [workerId, workerId, workerId, workerId]),
        chemistry: query(api, 'SELECT c.*,CASE WHEN c.worker1=? THEN w2.workerID ELSE w1.workerID END otherWorkerId,CASE WHEN c.worker1=? THEN w2.name ELSE w1.name END otherWorker FROM chemistry c JOIN workers w1 ON w1.workerID=c.worker1 JOIN workers w2 ON w2.workerID=c.worker2 WHERE c.worker1=? OR c.worker2=?', [workerId, workerId, workerId, workerId]),
        storylines: api.game.getWorkerStorylines ? api.game.getWorkerStorylines(workerId) : [],
        history: query(api, 'SELECT * FROM workerhistoryv2 WHERE workerID=? ORDER BY date DESC LIMIT 50', [workerId])
    };
}

function rosterNeeds(rows) {
    var wrestlers = rows.filter(function (row) { return canParticipateInMatch(row.type); });
    var faces = wrestlers.filter(function (row) { return row.alignment === 'Face'; }).length;
    var heels = wrestlers.filter(function (row) { return row.alignment === 'Heel'; }).length;
    var women = wrestlers.filter(function (row) { return row.gender === 'Female'; }).length;
    var main = wrestlers.filter(function (row) { return row.push === 'Main Event'; }).length;
    var under30 = wrestlers.filter(function (row) { return row.age != null && row.age < 30; }).length;
    var needs = [];
    if (faces < heels * 0.7) needs.push('babyfaces');
    if (heels < faces * 0.7) needs.push('heels');
    if (women > 0 && women < 8) needs.push('women division depth');
    if (main < 4) needs.push('main event depth');
    if (under30 < Math.max(3, wrestlers.length * 0.2)) needs.push('young prospects');
    if (!needs.length) needs.push('specialists and future depth');
    return { faces: faces, heels: heels, women: women, mainEventers: main, under30: under30, detectedNeeds: needs };
}

function hiring(api, options) {
    options = options || {};
    var ctx = context(api);
    var ownRows = rosterRows(api, ctx, { includeStaff: false, limit: 500 }).map(function (row) { row.age = ageAt(row.birthDate, ctx.currentDate); return row; });
    var needs = rosterNeeds(ownRows);
    var requestedNeeds = text(options.needs, 500).toLowerCase();
    var filters = [];
    var params = [ctx.promotionId, ctx.currentDate, ctx.currentDate];
    if (options.gender) { filters.push('w.gender=?'); params.push(text(options.gender, 30)); }
    if (options.style) { filters.push('w.style=?'); params.push(text(options.style, 60)); }
    if (options.minAge != null) { filters.push("CAST((julianday(?) - julianday(w.birthDate))/365.25 AS INTEGER) >= ?"); params.push(ctx.currentDate, Number(options.minAge)); }
    if (options.maxAge != null) { filters.push("CAST((julianday(?) - julianday(w.birthDate))/365.25 AS INTEGER) <= ?"); params.push(ctx.currentDate, Number(options.maxAge)); }
    params.push(500);
    var candidates = query(api, [
        'SELECT w.workerID,w.name,w.type,w.gender,w.birthDate,w.style,w.basedIn,w.basedInCountry,w.status,w.wrestlingSkill,w.entertainment,w.starPower,w.stamina,w.psychology,w.safety,w.potential,w.tagExpert,w.marketingDream,w.injuryProne,w.injuryType,w.isSuspended,w.canDoAngles,w.betterAsHeel,w.betterAsFace,w.' + ctx.popularityColumn + ' marketPopularity,',
        "GROUP_CONCAT(DISTINCT p.shortName) employers,MAX(COALESCE(c.exclusive,0)) exclusiveElsewhere,MAX(COALESCE(c.wagePerMonth,0)) currentMonthlyWage,MAX(COALESCE(c.wagePerAppearance,0)) currentAppearanceWage",
        'FROM workers w LEFT JOIN contracts c ON c.workerID=w.workerID AND c.finalised=1 AND c.expired=0 AND c.contractStarted=1 LEFT JOIN promotions p ON p.promotionID=c.promotionID',
        'WHERE ' + matchEligibleWorkerSql('w') + " AND w.status IN ('Active','Semi-Active') AND COALESCE(w.physicallyUnable,0)=0",
        'AND NOT EXISTS (SELECT 1 FROM contracts own WHERE own.workerID=w.workerID AND own.promotionID=? AND own.finalised=1 AND own.expired=0)',
        "AND (w.birthDate IS NULL OR w.birthDate='' OR date(w.birthDate)<=date(?,'-18 years')) AND (w.debutDate IS NULL OR w.debutDate='' OR date(w.debutDate)<=date(?))",
        filters.length ? 'AND ' + filters.join(' AND ') : '',
        'GROUP BY w.workerID ORDER BY (COALESCE(w.wrestlingSkill,0)+COALESCE(w.entertainment,0)+COALESCE(w.starPower,0)+COALESCE(w.' + ctx.popularityColumn + ',0)) DESC LIMIT ?'
    ].join(' '), params);
    var ownWages = ownRows.map(function (row) { return Number(row.wagePerAppearance || row.wagePerMonth || 0); }).filter(function (value) { return value > 0; }).sort(function (a, b) { return a - b; });
    var medianWage = ownWages.length ? ownWages[Math.floor(ownWages.length / 2)] : 1000;
    var monthlyPayroll = ownRows.reduce(function (sum, row) { return sum + Number(row.wagePerMonth || 0); }, 0);
    var appearanceCommitment = ownRows.reduce(function (sum, row) { return sum + Number(row.wagePerAppearance || 0); }, 0);
    var cash = Number(ctx.promotion.money || 0);
    var sizeMultiplier = { Local: 0.7, Small: 0.9, Regional: 1.2, National: 1.7, Major: 2.5 }[ctx.size] || 1;
    var cashPressure = cash < 0 ? 0.35 : cash < Math.max(50000, monthlyPayroll * 3) ? 0.65 : 1;
    var topMonthlyWage = ownRows.reduce(function (top, row) { return Math.max(top, Number(row.wagePerMonth || 0)); }, 0);
    var topAppearanceWage = ownRows.reduce(function (top, row) { return Math.max(top, Number(row.wagePerAppearance || 0)); }, 0);
    var cashBackedMonthly = cash > 0 ? cash / 120 : 0;
    var cashBackedAppearance = cash > 0 ? cash / 2400 : 0;
    var automaticAppearanceBudget = Math.round(Math.max(500, medianWage * sizeMultiplier * cashPressure, topAppearanceWage * 0.75 * cashPressure, cashBackedAppearance * cashPressure));
    var automaticMonthlyBudget = Math.round(Math.max(1000, (monthlyPayroll / Math.max(1, ownRows.length) || medianWage * 2) * sizeMultiplier * cashPressure, topMonthlyWage * 0.75 * cashPressure, cashBackedMonthly * cashPressure));
    var maxMonthly = options.maxMonthlyWage == null ? null : Number(options.maxMonthlyWage);
    var maxAppearance = options.maxAppearanceWage == null ? null : Number(options.maxAppearanceWage);
    var scored = candidates.map(function (row) {
        var age = ageAt(row.birthDate, ctx.currentDate);
        var base = Number(row.wrestlingSkill || 0) * 0.27 + Number(row.entertainment || 0) * 0.23 + Number(row.starPower || 0) * 0.2 + Number(row.marketPopularity || 0) * 0.2 + Number(row.stamina || 0) * 0.1;
        var reasons = [];
        var bonus = 0;
        if ((requestedNeeds.indexOf('women') >= 0 || needs.detectedNeeds.indexOf('women division depth') >= 0) && row.gender === 'Female') { bonus += 12; reasons.push('adds women division depth'); }
        if (requestedNeeds.indexOf('tag') >= 0 && row.tagExpert) { bonus += 12; reasons.push('tag-team specialist'); }
        if (/(promo|entertain|character)/.test(requestedNeeds) && Number(row.entertainment || 0) >= 65) { bonus += 10; reasons.push('strong entertainment value'); }
        if (/(technical|ring|wrestl|workrate)/.test(requestedNeeds) && Number(row.wrestlingSkill || 0) >= 65) { bonus += 10; reasons.push('strong in-ring value'); }
        if (/(young|prospect|future)/.test(requestedNeeds) && age != null && age <= 27) { bonus += 10; reasons.push('young prospect'); }
        if (/(star|draw|main event)/.test(requestedNeeds) && (Number(row.starPower || 0) >= 70 || Number(row.marketPopularity || 0) >= 70)) { bonus += 10; reasons.push('main-event upside'); }
        if (needs.detectedNeeds.indexOf('babyfaces') >= 0 && row.betterAsFace) { bonus += 6; reasons.push('projects well as a babyface'); }
        if (needs.detectedNeeds.indexOf('heels') >= 0 && row.betterAsHeel) { bonus += 6; reasons.push('projects well as a heel'); }
        if (row.exclusiveElsewhere) { bonus -= 15; reasons.push('exclusive contract obstacle'); }
        if (row.injuryType || row.isSuspended) { bonus -= 15; reasons.push('currently unavailable'); }
        if (row.injuryProne) { bonus -= 4; reasons.push('injury risk'); }
        var estimatedAppearance = Math.max(Number(row.currentAppearanceWage || 0), Math.round(medianWage * Math.max(0.6, base / 55)));
        var appearanceCeiling = maxAppearance == null ? automaticAppearanceBudget : maxAppearance;
        var monthlyCeiling = maxMonthly == null ? automaticMonthlyBudget : maxMonthly;
        var affordable = estimatedAppearance <= appearanceCeiling && Number(row.currentMonthlyWage || 0) <= monthlyCeiling;
        if (!affordable) { bonus -= maxAppearance != null || maxMonthly != null ? 25 : 8; reasons.push(maxAppearance != null || maxMonthly != null ? 'above user wage limit' : 'above recommended wage band'); }
        var popularityReach = Number(ctx.promotion.prestige || 0) + (ctx.size === 'Major' ? 25 : 15);
        if (Number(row.marketPopularity || 0) > popularityReach) { bonus -= 12; reasons.push('ambitious target for company size'); }
        if (!reasons.length) reasons.push('balanced overall fit');
        return Object.assign({}, row, {
            age: age,
            fitScore: Math.round(Math.max(0, Math.min(100, base + bonus)) * 10) / 10,
            affordable: affordable,
            affordability: affordable ? 'within recommended band' : (maxAppearance != null || maxMonthly != null ? 'above user limit' : 'stretch target'),
            estimatedOffer: { monthly: Math.max(0, Number(row.currentMonthlyWage || 0)), perAppearance: estimatedAppearance },
            reasons: reasons,
            availability: row.exclusiveElsewhere ? 'Under an exclusive deal' : (row.employers ? 'Potentially available' : 'Free agent')
        });
    }).sort(function (a, b) { return b.fitScore - a.fitScore; });
    var limit = clamp(options.limit, 25, 1, 100);
    return {
        game: state(api),
        company: { size: ctx.size, prestige: numeric(ctx.promotion.prestige), cash: integer(ctx.promotion.money), style: ctx.promotion.style, market: ctx.promotion.basedIn, medianRosterWage: medianWage, monthlyBasePayroll: Math.round(monthlyPayroll), totalAppearanceCommitment: Math.round(appearanceCommitment) },
        budgetModel: { maxMonthlyWage: maxMonthly == null ? automaticMonthlyBudget : maxMonthly, maxAppearanceWage: maxAppearance == null ? automaticAppearanceBudget : maxAppearance, advisory: maxMonthly == null && maxAppearance == null, source: maxMonthly == null && maxAppearance == null ? 'recommended band estimated from company size, cash runway, payroll, roster median, and existing top-end contracts' : 'user limits with automatic fallback for unspecified values' },
        rosterBalance: needs,
        requestedNeeds: options.needs || null,
        filters: { gender: options.gender || null, style: options.style || null, maxMonthlyWage: maxMonthly, maxAppearanceWage: maxAppearance },
        candidates: scored.slice(0, limit),
        methodology: 'Fit combines in-ring skill, entertainment, star power, home-market popularity, stamina, roster gaps, requested needs, availability, risk, and wage fit. Suggested wages are estimates, not guaranteed acceptance values.'
    };
}

function contractAdvice(api, options) {
    options = options || {};
    var ctx = context(api);
    var rows = rosterRows(api, ctx, { includeStaff: Boolean(options.includeStaff), workerId: options.workerId, usageDays: options.usageDays || 90, limit: 500 });
    var horizon = clamp(options.horizonDays, 180, 1, 1825);
    var cutoff = addDays(ctx.currentDate, horizon);
    var advice = rows.map(function (row) {
        var quality = Number(row.wrestlingSkill || 0) * 0.28 + Number(row.entertainment || 0) * 0.22 + Number(row.starPower || 0) * 0.2 + Number(row.marketPopularity || 0) * 0.18 + Number(row.momentum || 0) * 0.12;
        var monthlyUsage = Number(row.appearances || 0) / 3;
        var effectiveMonthlyCost = Number(row.wagePerMonth || 0) + Number(row.wagePerAppearance || 0) * monthlyUsage;
        var expiring = row.expiryDate && row.expiryDate !== 'No Expiry' && row.expiryDate >= ctx.currentDate && row.expiryDate <= cutoff;
        var unavailable = Boolean(row.injuryType || row.isSuspended || row.contractSuspended || row.onTimeOff);
        var recommendation = 'retain';
        var reasons = [];
        if (expiring) reasons.push('contract expires within ' + horizon + ' days');
        if (quality >= 72 || row.push === 'Main Event') { recommendation = expiring ? 'priority renewal' : 'retain'; reasons.push('high-value talent'); }
        if (Number(row.morale || 0) < -20) reasons.push('morale needs attention');
        if (Number(row.appearances || 0) === 0) { reasons.push('not used in analysis window'); if (quality < 55) recommendation = 'release or restructure'; }
        if (effectiveMonthlyCost > 0 && quality < 45) { recommendation = 'renegotiate or release'; reasons.push('weak value relative to cost'); }
        if (unavailable) reasons.push('currently unavailable');
        if (!reasons.length) reasons.push('contract and usage are broadly aligned');
        var multiplier = quality >= 75 ? 1.2 : quality >= 60 ? 1.05 : quality < 45 ? 0.8 : 0.95;
        return {
            contractId: integer(row.contractID), workerId: integer(row.workerID), name: row.name, type: row.type,
            push: row.push, alignment: row.alignment, expiryDate: row.expiryDate, expiringWithinHorizon: Boolean(expiring),
            wagePerMonth: integer(row.wagePerMonth) || 0, wagePerAppearance: integer(row.wagePerAppearance) || 0,
            appearances: integer(row.appearances) || 0, effectiveMonthlyCost: Math.round(effectiveMonthlyCost),
            valueScore: Math.round(quality * 10) / 10, momentum: numeric(row.momentum), morale: numeric(row.morale),
            recommendation: recommendation,
            suggestedRenewalRange: { monthlyLow: Math.round(Number(row.wagePerMonth || 0) * multiplier * 0.9), monthlyHigh: Math.round(Number(row.wagePerMonth || 0) * multiplier * 1.15), appearanceLow: Math.round(Number(row.wagePerAppearance || 0) * multiplier * 0.9), appearanceHigh: Math.round(Number(row.wagePerAppearance || 0) * multiplier * 1.15) },
            reasons: reasons
        };
    }).sort(function (a, b) {
        if (a.expiringWithinHorizon !== b.expiringWithinHorizon) return a.expiringWithinHorizon ? -1 : 1;
        return b.valueScore - a.valueScore;
    });
    return { game: state(api), companyFinance: finances(api, ctx), horizonDays: horizon, analysisWindowDays: clamp(options.usageDays, 90, 7, 730), contracts: advice.slice(0, clamp(options.limit, 100, 1, 500)), caveat: 'Renewal ranges are planning estimates based on current pay, performance, momentum, usage, and company finances. PWS may value an offer differently.' };
}

module.exports = {
    addDays: addDays,
    ageAt: ageAt,
    boolean: boolean,
    canParticipateInMatch: canParticipateInMatch,
    catalog: catalog,
    clamp: clamp,
    context: context,
    contractAdvice: contractAdvice,
    hiring: hiring,
    importanceName: importanceName,
    integer: integer,
    numeric: numeric,
    isAvailableOn: isAvailableOn,
    overview: overview,
    popularityTier: popularityTier,
    promotionSize: promotionSize,
    advancedPromotionSize: advancedPromotionSize,
    query: query,
    get: get,
    gimmicks: gimmicks,
    personas: personas,
    promises: promises,
    roster: roster,
    rosterCount: rosterCount,
    rosterRows: rosterRows,
    search: search,
    show: show,
    state: state,
    storylines: storylines,
    storylineAttributionDiagnostics: storylineAttributionDiagnostics,
    titles: titles,
    unavailabilityAt: unavailabilityAt,
    upcomingShows: upcomingShows,
    venues: venues,
    workerProfile: workerProfile
};

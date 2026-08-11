'use strict';

var audit = require('./audit');
var domain = require('./domain');
var segments = require('./segments');

function integer(value, label) {
    var result = domain.integer(value);
    if (result === null || result < 1) throw new Error(label + ' must be a positive integer');
    return result;
}

function input(options, fields, label) {
    options = options || {};
    segments.rejectUnknown(options, fields.concat(['preview', 'confirmed']), label + ' input');
    return options;
}

function requireAction(api, name) {
    if (!api.actions || typeof api.actions[name] !== 'function') throw new Error('Action is unavailable in this PWS version: ' + name);
    return api.actions[name];
}

function mutation(options, action, details, apply, verify) {
    if (options.preview !== false) return { success: true, status: 'preview', action: action, before: details.before, proposed: details.proposed };
    if (options.confirmed !== true) throw new Error('Refusing to change the save: use preview first, then set preview=false and confirmed=true');
    var result = apply();
    if (result && result.success === false) throw new Error(result.error || (action + ' was rejected by PWS'));
    var verification = verify();
    if (!verification.success) throw new Error('Post-action verification failed: ' + verification.error);
    var entry = audit.record(details.api, action, details.audit);
    return { success: true, status: 'applied', action: action, before: details.before, after: verification.after == null ? null : verification.after, result: result == null ? null : result, verification: verification, audit: entry };
}

function context(api) {
    return domain.context(api);
}

function removeSegment(api, options) {
    options = input(options, ['segmentId'], 'pws_remove_segment');
    var segmentId = integer(options.segmentId, 'segmentId');
    var before = segments.readSegment(api, segmentId);
    var raw = domain.get(api, 'SELECT s.segmentID,ei.complete,ei.isCancelled,e.promotionID FROM segments s JOIN eventinstance ei ON ei.instanceID=s.showID JOIN events e ON e.eventID=ei.eventID WHERE s.segmentID=?', [segmentId]);
    if (!raw || Number(raw.promotionID) !== context(api).promotionId) throw new Error('The segment does not belong to the player promotion');
    if (raw.complete || raw.isCancelled) throw new Error('The segment is on a completed or cancelled show');
    return mutation(options, 'booking.removeSegment', {
        api: api, before: before, proposed: { segmentId: segmentId, operation: 'remove' },
        audit: { segmentId: segmentId, showId: before.showId, before: before }
    }, function () { return requireAction(api, 'removeSegment').call(api.actions, segmentId); }, function () {
        var persisted = domain.get(api, 'SELECT segmentID FROM segments WHERE segmentID=?', [segmentId]);
        return persisted ? { success: false, error: 'segment ' + segmentId + ' still exists', after: persisted } : { success: true, after: null };
    });
}

function storyline(api, storylineId) {
    return domain.get(api, 'SELECT storylineID,storylineName,overview,promotionID,active FROM storylines WHERE storylineID=?', [storylineId]);
}

function storylineMember(api, storylineId, contractId) {
    return domain.get(api, 'SELECT storylineID,contractID FROM storylineworkers WHERE storylineID=? AND contractID=?', [storylineId, contractId]);
}

function validateStoryline(api, storylineId) {
    var before = storyline(api, storylineId);
    if (!before) throw new Error('Storyline not found: ' + storylineId);
    if (Number(before.promotionID) !== context(api).promotionId) throw new Error('The storyline does not belong to the player promotion');
    if (!Number(before.active)) throw new Error('The storyline is already inactive');
    return before;
}

function validateContract(api, contractId) {
    var contract = domain.get(api, "SELECT c.contractID,c.workerID,c.promotionID,c.finalised,c.expired,c.contractStarted,COALESCE(NULLIF(c.contractName,''),w.name) AS name FROM contracts c LEFT JOIN workers w ON w.workerID=c.workerID WHERE c.contractID=?", [contractId]);
    if (!contract) throw new Error('Contract not found: ' + contractId);
    if (Number(contract.promotionID) !== context(api).promotionId) throw new Error('The contract does not belong to the player promotion');
    if (!Number(contract.finalised) || Number(contract.expired) || !Number(contract.contractStarted)) throw new Error('The contract is not active');
    return contract;
}

function validateGimmick(api, value) {
    var name = String(value == null ? '' : value).trim();
    if (!name) throw new Error('gimmick is required');
    if (name.length > 100) throw new Error('gimmick cannot exceed 100 characters');
    if (name.toLowerCase() === 'none') return 'None';
    var row = domain.get(api, 'SELECT name FROM gimmicks WHERE name=? COLLATE NOCASE LIMIT 1', [name]);
    if (!row) throw new Error('Gimmick not found in the loaded save: ' + name + '. Use pws_get_gimmicks to browse this database.');
    return row.name;
}

function stable(api, stableId) {
    var row = domain.get(api, 'SELECT stableID,stableName,stableHeat,promotionID,stableImage FROM stables WHERE stableID=?', [stableId]);
    if (!row) return null;
    row.members = domain.query(api, "SELECT sw.contractID,sw.isLeader,c.workerID,COALESCE(NULLIF(c.contractName,''),w.name) AS name FROM stableworkers sw JOIN contracts c ON c.contractID=sw.contractID LEFT JOIN workers w ON w.workerID=c.workerID WHERE sw.stableID=? ORDER BY CASE WHEN sw.isLeader IN (1,'true') THEN 0 ELSE 1 END,name", [stableId]);
    return row;
}

function validateStable(api, stableId) {
    var before = stable(api, stableId);
    if (!before) throw new Error('Stable not found: ' + stableId);
    if (Number(before.promotionID) !== context(api).promotionId) throw new Error('The stable does not belong to the player promotion');
    return before;
}

function listStables(api, options) {
    options = options || {};
    var ctx = context(api);
    var rows = domain.query(api, 'SELECT stableID FROM stables WHERE promotionID=? ORDER BY stableHeat DESC,stableName', [ctx.promotionId]);
    if (options.stableId != null) rows = rows.filter(function (row) { return Number(row.stableID) === Number(options.stableId); });
    return { game: domain.state(api), stables: rows.map(function (row) { return stable(api, Number(row.stableID)); }) };
}

function createStable(api, options) {
    options = input(options, ['name', 'contractIds', 'leaderContractId', 'heat'], 'pws_create_stable');
    var name = String(options.name || '').trim();
    if (!name) throw new Error('name is required');
    if (name.length > 100) throw new Error('name cannot exceed 100 characters');
    if (!Array.isArray(options.contractIds) || options.contractIds.length < 2) throw new Error('contractIds must contain at least two contracts');
    var ids = options.contractIds.map(function (id) { return integer(id, 'contractIds entry'); });
    if (new Set(ids).size !== ids.length) throw new Error('contractIds contains a duplicate');
    var contracts = ids.map(function (id) { return validateContract(api, id); });
    var leader = options.leaderContractId == null ? null : integer(options.leaderContractId, 'leaderContractId');
    if (leader !== null && ids.indexOf(leader) === -1) throw new Error('leaderContractId must be one of contractIds');
    var heat = options.heat == null ? 50 : Number(options.heat);
    if (!Number.isInteger(heat) || heat < 1 || heat > 100) throw new Error('heat must be an integer from 1 to 100');
    var proposed = { promotionId: context(api).promotionId, name: name, contractIds: ids, leaderContractId: leader, heat: heat };
    return mutation(options, 'stable.create', { api: api, before: null, proposed: proposed, audit: { proposed: proposed, contracts: contracts } }, function () {
        return requireAction(api, 'createStable').call(api.actions, proposed);
    }, function () {
        var created = domain.get(api, 'SELECT stableID FROM stables WHERE promotionID=? AND stableName=? ORDER BY stableID DESC LIMIT 1', [proposed.promotionId, name]);
        var after = created ? stable(api, Number(created.stableID)) : null;
        var memberIds = after ? after.members.map(function (member) { return Number(member.contractID); }).sort() : [];
        var persistedLeader = after && after.members.find(function (member) { return member.isLeader === true || Number(member.isLeader) === 1 || member.isLeader === 'true'; });
        var correctLeader = leader === null ? !persistedLeader : persistedLeader && Number(persistedLeader.contractID) === leader;
        var correct = after && JSON.stringify(memberIds) === JSON.stringify(ids.slice().sort()) && Number(after.stableHeat) === heat && correctLeader;
        return correct ? { success: true, after: after } : { success: false, error: 'stable or membership was not persisted as requested', after: after };
    });
}

function dissolveStable(api, options) {
    options = input(options, ['stableId'], 'pws_dissolve_stable');
    var stableId = integer(options.stableId, 'stableId');
    var before = validateStable(api, stableId);
    return mutation(options, 'stable.dissolve', { api: api, before: before, proposed: { stableId: stableId, operation: 'dissolve' }, audit: { stableId: stableId, before: before } }, function () {
        return requireAction(api, 'dissolveStable').call(api.actions, stableId);
    }, function () {
        var after = stable(api, stableId);
        return !after ? { success: true, after: null } : { success: false, error: 'stable still exists', after: after };
    });
}

function changeStableMember(api, options, adding) {
    var label = adding ? 'pws_add_stable_worker' : 'pws_remove_stable_worker';
    options = input(options, ['stableId', 'contractId', 'isLeader'], label);
    var stableId = integer(options.stableId, 'stableId');
    var contractId = integer(options.contractId, 'contractId');
    var before = validateStable(api, stableId);
    var contract = validateContract(api, contractId);
    var existing = before.members.find(function (member) { return Number(member.contractID) === contractId; });
    if (adding && existing) throw new Error('The worker is already in this stable');
    if (!adding && !existing) throw new Error('The worker is not in this stable');
    if (!adding && before.members.length <= 2) throw new Error('A stable must retain at least two members; dissolve it instead');
    return mutation(options, adding ? 'stable.addWorker' : 'stable.removeWorker', { api: api, before: before, proposed: { stableId: stableId, contractId: contractId, member: adding, isLeader: adding && options.isLeader === true }, audit: { stableId: stableId, contractId: contractId, before: before } }, function () {
        var fn = requireAction(api, adding ? 'addWorkerToStable' : 'removeWorkerFromStable');
        return adding ? fn.call(api.actions, stableId, contractId, options.isLeader === true) : fn.call(api.actions, stableId, contractId);
    }, function () {
        var after = stable(api, stableId);
        var member = after && after.members.find(function (item) { return Number(item.contractID) === contractId; });
        var correct = adding ? Boolean(member) : !member;
        return correct ? { success: true, after: after } : { success: false, error: 'stable membership was not persisted', after: after };
    });
}

function setContractGimmick(api, options) {
    options = input(options, ['contractId', 'gimmick'], 'pws_set_contract_gimmick');
    var contractId = integer(options.contractId, 'contractId');
    var before = validateContract(api, contractId);
    var gimmick = validateGimmick(api, options.gimmick);
    return mutation(options, 'contract.setGimmick', { api: api, before: before, proposed: { contractId: contractId, gimmick: gimmick }, audit: { contractId: contractId, gimmick: gimmick, before: before } }, function () {
        return requireAction(api, 'modifyContract').call(api.actions, { contractId: contractId, changes: { gimmick: gimmick } });
    }, function () {
        var after = domain.get(api, 'SELECT contractID,workerID,promotionID,gimmick FROM contracts WHERE contractID=?', [contractId]);
        return after && after.gimmick === gimmick ? { success: true, after: after } : { success: false, error: 'gimmick was not persisted', after: after };
    });
}

function event(api, eventId) {
    return domain.get(api, 'SELECT eventID,eventName,promotionID,prestige,recurrenceType,recurrenceMonth,recurrenceWeek,brand,eventLength,importance,inactive,preferredVenue FROM events WHERE eventID=?', [eventId]);
}

function createEvent(api, options) {
    options = input(options, ['name', 'recurrenceType', 'recurrenceMonth', 'recurrenceWeek', 'prestige', 'importance', 'eventLength', 'brand'], 'pws_create_event');
    var ctx = context(api);
    var name = String(options.name || '').trim();
    if (!name) throw new Error('name is required');
    if (name.length > 100) throw new Error('name cannot exceed 100 characters');
    var recurrenceType = options.recurrenceType || 'OneOff';
    if (['Weekly', 'Monthly', 'Annual', 'OneOff'].indexOf(recurrenceType) === -1) throw new Error('recurrenceType is invalid');
    var month = options.recurrenceMonth == null ? null : Number(options.recurrenceMonth);
    var week = options.recurrenceWeek == null ? null : Number(options.recurrenceWeek);
    if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) throw new Error('recurrenceMonth must be 1-12');
    if (week !== null && (!Number.isInteger(week) || week < 1 || week > 5)) throw new Error('recurrenceWeek must be 1-5');
    if (recurrenceType === 'Annual' && month === null) throw new Error('Annual events require recurrenceMonth');
    if (recurrenceType === 'Monthly' && week === null) throw new Error('Monthly events require recurrenceWeek');
    var prestige = options.prestige == null ? 1 : Number(options.prestige);
    var length = options.eventLength == null ? 120 : Number(options.eventLength);
    if (!Number.isInteger(prestige) || prestige < 1 || prestige > 100) throw new Error('prestige must be 1-100');
    if (!Number.isInteger(length) || length < 1 || length > 600) throw new Error('eventLength must be 1-600');
    var importance = options.importance || 'Normal';
    if (['Huge', 'High', 'Normal', 'Unimportant', 'House Show'].indexOf(importance) === -1) throw new Error('importance is invalid');
    var proposed = { promotionId: ctx.promotionId, name: name, recurrenceType: recurrenceType, recurrenceMonth: month, recurrenceWeek: week, prestige: prestige, importance: importance, eventLength: length };
    if (options.brand != null) proposed.brand = integer(options.brand, 'brand');
    return mutation(options, 'event.create', { api: api, before: null, proposed: proposed, audit: { proposed: proposed } }, function () {
        return requireAction(api, 'createEvent').call(api.actions, proposed);
    }, function () {
        var row = domain.get(api, 'SELECT eventID FROM events WHERE promotionID=? AND eventName=? ORDER BY eventID DESC LIMIT 1', [ctx.promotionId, name]);
        var after = row ? event(api, Number(row.eventID)) : null;
        return after && Number(after.eventLength) === length && after.recurrenceType === recurrenceType ? { success: true, after: after } : { success: false, error: 'event was not persisted as requested', after: after };
    });
}

function scheduleShow(api, options) {
    options = input(options, ['eventId', 'airDate', 'location', 'venueId'], 'pws_schedule_show');
    var eventId = integer(options.eventId, 'eventId');
    var series = event(api, eventId);
    if (!series) throw new Error('Event not found: ' + eventId);
    if (Number(series.promotionID) !== context(api).promotionId) throw new Error('The event does not belong to the player promotion');
    var airDate = String(options.airDate || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(airDate) || !domain.addDays(airDate, 0)) throw new Error('airDate must be a valid YYYY-MM-DD date');
    if (airDate < context(api).currentDate) throw new Error('airDate cannot be before the current game date');
    var location = options.location == null ? '' : String(options.location).trim();
    if (location.length > 200) throw new Error('location cannot exceed 200 characters');
    var venueId = options.venueId == null ? null : integer(options.venueId, 'venueId');
    if (venueId !== null && !domain.get(api, 'SELECT venueID FROM venues WHERE venueID=?', [venueId])) throw new Error('Venue not found: ' + venueId);
    var proposed = { eventId: eventId, airDate: airDate, location: location, venueId: venueId };
    return mutation(options, 'show.schedule', { api: api, before: series, proposed: proposed, audit: { proposed: proposed } }, function () {
        return requireAction(api, 'scheduleShow').call(api.actions, proposed);
    }, function () {
        var after = domain.get(api, 'SELECT instanceID AS showId,eventID,airDate,location,venueID,complete,isCancelled FROM eventinstance WHERE eventID=? AND airDate=? ORDER BY instanceID DESC LIMIT 1', [eventId, airDate]);
        var correct = after && Number(after.eventID) === eventId && (venueId === null || Number(after.venueID) === venueId);
        return correct ? { success: true, after: after } : { success: false, error: 'show instance was not persisted as requested', after: after };
    });
}

function cancelShow(api, options) {
    options = input(options, ['showId'], 'pws_cancel_show');
    var showId = integer(options.showId, 'showId');
    var before = domain.get(api, 'SELECT ei.instanceID AS showId,ei.eventID,ei.airDate,ei.complete,ei.isCancelled,e.promotionID FROM eventinstance ei JOIN events e ON e.eventID=ei.eventID WHERE ei.instanceID=?', [showId]);
    if (!before) throw new Error('Show not found: ' + showId);
    if (Number(before.promotionID) !== context(api).promotionId) throw new Error('The show does not belong to the player promotion');
    if (Number(before.complete)) throw new Error('A completed show cannot be cancelled');
    if (Number(before.isCancelled)) throw new Error('The show is already cancelled');
    return mutation(options, 'show.cancel', { api: api, before: before, proposed: { showId: showId, isCancelled: true }, audit: { showId: showId, before: before } }, function () {
        return requireAction(api, 'cancelShow').call(api.actions, showId);
    }, function () {
        var after = domain.get(api, 'SELECT instanceID AS showId,eventID,airDate,complete,isCancelled FROM eventinstance WHERE instanceID=?', [showId]);
        return after && Number(after.isCancelled) === 1 ? { success: true, after: after } : { success: false, error: 'show cancellation was not persisted', after: after };
    });
}

function endStoryline(api, options) {
    options = input(options, ['storylineId'], 'pws_end_storyline');
    var storylineId = integer(options.storylineId, 'storylineId');
    var before = validateStoryline(api, storylineId);
    return mutation(options, 'storyline.end', { api: api, before: before, proposed: { storylineId: storylineId, active: false }, audit: { storylineId: storylineId, before: before } },
        function () { return requireAction(api, 'endStoryline').call(api.actions, storylineId); }, function () {
            var after = storyline(api, storylineId);
            return after && !Number(after.active) ? { success: true, after: after } : { success: false, error: 'storyline remains active', after: after };
        });
}

function changeStorylineMember(api, options, adding) {
    var tool = adding ? 'pws_add_storyline_worker' : 'pws_remove_storyline_worker';
    options = input(options, ['storylineId', 'contractId'], tool);
    var storylineId = integer(options.storylineId, 'storylineId');
    var contractId = integer(options.contractId, 'contractId');
    var story = validateStoryline(api, storylineId);
    var contract = validateContract(api, contractId);
    var existing = storylineMember(api, storylineId, contractId);
    if (adding && existing) throw new Error((contract.name || ('Contract ' + contractId)) + ' is already in the storyline');
    if (!adding && !existing) throw new Error((contract.name || ('Contract ' + contractId)) + ' is not in the storyline');
    var actionName = adding ? 'addWorkerToStoryline' : 'removeWorkerFromStoryline';
    var action = adding ? 'storyline.addWorker' : 'storyline.removeWorker';
    var before = { storyline: story, contract: contract, membership: existing || null };
    return mutation(options, action, { api: api, before: before, proposed: { storylineId: storylineId, contractId: contractId, member: adding }, audit: { storylineId: storylineId, contractId: contractId, before: before } },
        function () { return requireAction(api, actionName).call(api.actions, storylineId, contractId); }, function () {
            var after = storylineMember(api, storylineId, contractId);
            var correct = adding ? Boolean(after) : !after;
            return correct ? { success: true, after: after || null } : { success: false, error: 'storyline membership was not persisted', after: after || null };
        });
}

function releaseWorker(api, options) {
    options = input(options, ['contractId'], 'pws_release_worker');
    var contractId = integer(options.contractId, 'contractId');
    var before = validateContract(api, contractId);
    return mutation(options, 'contract.releaseWorker', { api: api, before: before, proposed: { contractId: contractId, active: false }, audit: { contractId: contractId, workerId: Number(before.workerID), before: before } },
        function () { return requireAction(api, 'releaseWorker').call(api.actions, contractId); }, function () {
            var after = domain.get(api, 'SELECT contractID,workerID,promotionID,finalised,expired,contractStarted FROM contracts WHERE contractID=?', [contractId]);
            var inactive = !after || Number(after.expired) || !Number(after.finalised) || !Number(after.contractStarted);
            return inactive ? { success: true, after: after || null } : { success: false, error: 'contract remains active', after: after };
        });
}

function vacateTitle(api, options) {
    options = input(options, ['titleId', 'reason'], 'pws_vacate_title');
    var titleId = integer(options.titleId, 'titleId');
    var reason = options.reason == null ? '' : String(options.reason).trim();
    if (reason.length > 500) throw new Error('reason cannot exceed 500 characters');
    var before = domain.get(api, 'SELECT titleID,name,promotionID,inactive,currentChampion,currentChampion2,currentChampion3 FROM titles WHERE titleID=?', [titleId]);
    if (!before) throw new Error('Title not found: ' + titleId);
    if (Number(before.promotionID) !== context(api).promotionId) throw new Error('The title does not belong to the player promotion');
    if (![before.currentChampion, before.currentChampion2, before.currentChampion3].some(function (id) { return Number(id) > 0; })) throw new Error('The title is already vacant');
    return mutation(options, 'title.vacate', { api: api, before: before, proposed: { titleId: titleId, currentChampionIds: [], reason: reason || null }, audit: { titleId: titleId, reason: reason || null, before: before } },
        function () { return requireAction(api, 'vacateTitle').call(api.actions, titleId, reason); }, function () {
            var after = domain.get(api, 'SELECT titleID,name,promotionID,inactive,currentChampion,currentChampion2,currentChampion3 FROM titles WHERE titleID=?', [titleId]);
            var remaining = after && [after.currentChampion, after.currentChampion2, after.currentChampion3].some(function (id) { return Number(id) > 0; });
            return after && !remaining ? { success: true, after: after } : { success: false, error: 'title still has a current champion', after: after };
        });
}

function setShowVenue(api, options) {
    options = input(options, ['showId', 'venueId', 'setEventDefault'], 'pws_set_show_venue');
    var showId = integer(options.showId, 'showId');
    var venueId = integer(options.venueId, 'venueId');
    var before = domain.get(api, 'SELECT ei.instanceID AS showId,ei.venueID AS venueId,ei.complete,ei.isCancelled,e.eventID,e.eventName,e.preferredVenue,e.promotionID FROM eventinstance ei JOIN events e ON e.eventID=ei.eventID WHERE ei.instanceID=?', [showId]);
    if (!before) throw new Error('Show not found: ' + showId);
    if (Number(before.promotionID) !== context(api).promotionId) throw new Error('The show does not belong to the player promotion');
    if (Number(before.complete) || Number(before.isCancelled)) throw new Error('The show is completed or cancelled');
    var venue = domain.get(api, 'SELECT venueID AS venueId,venueName AS name,capacity,type,continent,country,region FROM venues WHERE venueID=?', [venueId]);
    if (!venue) throw new Error('Venue not found: ' + venueId);
    var setEventDefault = options.setEventDefault === true;
    return mutation(options, 'show.setVenue', { api: api, before: before, proposed: { showId: showId, venue: venue, eventDefault: setEventDefault }, audit: { showId: showId, venueId: venueId, eventId: Number(before.eventID), setEventDefault: setEventDefault, before: before } }, function () {
        api.database.execute('UPDATE eventinstance SET venueID=? WHERE instanceID=?', [venueId, showId]);
        if (setEventDefault) api.database.execute('UPDATE events SET preferredVenue=? WHERE eventID=?', [venueId, Number(before.eventID)]);
        return { success: true };
    }, function () {
        var after = domain.get(api, 'SELECT ei.instanceID AS showId,ei.venueID AS venueId,e.eventID,e.preferredVenue FROM eventinstance ei JOIN events e ON e.eventID=ei.eventID WHERE ei.instanceID=?', [showId]);
        var correct = after && Number(after.venueId) === venueId && (!setEventDefault || Number(after.preferredVenue) === venueId);
        return correct ? { success: true, after: Object.assign({}, after, { venue: venue, eventDefault: setEventDefault }) } : { success: false, error: 'venue or event default was not persisted', after: after };
    });
}

module.exports = { cancelShow: cancelShow, changeStableMember: changeStableMember, changeStorylineMember: changeStorylineMember, createEvent: createEvent, createStable: createStable, dissolveStable: dissolveStable, endStoryline: endStoryline, listStables: listStables, releaseWorker: releaseWorker, removeSegment: removeSegment, scheduleShow: scheduleShow, setContractGimmick: setContractGimmick, setShowVenue: setShowVenue, stable: stable, vacateTitle: vacateTitle, validateGimmick: validateGimmick };

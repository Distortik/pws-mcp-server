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

module.exports = { changeStorylineMember: changeStorylineMember, endStoryline: endStoryline, releaseWorker: releaseWorker, removeSegment: removeSegment, setShowVenue: setShowVenue, vacateTitle: vacateTitle };

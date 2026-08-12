'use strict';

var domain = require('./domain');
var segmentService = require('./segments');

var MATCH_PLAN_FIELDS = [
    'type', 'participants', 'gimmick', 'segmentLength', 'winner', 'winType', 'purpose',
    'purposeWorker', 'losers', 'segmentName', 'description', 'finishSpecific', 'matchStoryId',
    'segmentPosition', 'cardPosition', 'referee', 'announcers', 'agent', 'titleIds',
    'ringsideWorkers', 'planningReason'
];
var ANGLE_PLAN_FIELDS = [
    'type', 'angleType', 'participants', 'beats', 'segmentLength', 'segmentName',
    'description', 'segmentPosition', 'cardPosition', 'planningReason'
];

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function contractIdsFromStoryline(storyline) {
    if (Array.isArray(storyline.workers)) {
        return storyline.workers.map(function (worker) { return Number(worker.contractID || worker.contractId); }).filter(Number.isFinite);
    }
    return String(storyline.contractIds || '').split(',').map(Number).filter(Number.isFinite);
}

function bookingContext(api, options) {
    options = options || {};
    var ctx = domain.context(api);
    var showId = domain.integer(options.showId);
    if (showId === null) {
        var next = domain.upcomingShows(api, { limit: 1 }).shows[0];
        if (!next) throw new Error('No upcoming unfinished show was found');
        showId = Number(next.showId);
    }
    var card = domain.show(api, { showId: showId });
    if (Number(card.show.promotionID) !== ctx.promotionId) throw new Error('The show does not belong to the player promotion');
    var rows = domain.rosterRows(api, ctx, { limit: 500 }).filter(function (row) {
        return domain.isAvailableOn(row, card.show.date || ctx.currentDate);
    });
    var roster = rows.map(function (row) {
        return {
            contractId: Number(row.contractID), workerId: Number(row.workerID), name: row.name,
            gender: row.gender, age: domain.ageAt(row.birthDate, ctx.currentDate), style: row.style,
            alignment: row.alignment, push: row.push, brand: row.brand, momentum: domain.numeric(row.momentum),
            popularity: domain.numeric(row.marketPopularity), wrestling: domain.numeric(row.wrestlingSkill),
            entertainment: domain.numeric(row.entertainment), starPower: domain.numeric(row.starPower),
            stamina: domain.numeric(row.stamina), psychology: domain.numeric(row.psychology),
            canDoAngles: Boolean(row.canDoAngles), appearances90: Number(row.appearances || 0),
            matches90: Number(row.matches || 0), angles90: Number(row.angles || 0), lastBooked: row.lastBooked || null
        };
    });
    return {
        game: domain.state(api),
        promotion: ctx.promotion,
        show: card.show,
        existingCard: card.segments,
        bookedMinutes: card.bookedMinutes,
        remainingMinutes: Math.max(0, Number(card.show.length || 0) - card.bookedMinutes),
        roster: roster,
        titles: domain.titles(api, ctx.promotionId),
        storylines: domain.storylines(api, ctx.promotionId),
        recentMatches: domain.query(api,
            "SELECT ei.airDate AS date,COALESCE(NULLIF(ei.customName,''),e.eventName) showName,s.segmentID,s.segmentName,s.rating,GROUP_CONCAT(o.contractID) contractIds,GROUP_CONCAT(COALESCE(NULLIF(c.contractName,''),w.name),' vs ') participants FROM segments s JOIN eventinstance ei ON ei.instanceID=s.showID JOIN events e ON e.eventID=ei.eventID LEFT JOIN opponents o ON o.segmentID=s.segmentID AND COALESCE(o.isRingside,0)=0 LEFT JOIN contracts c ON c.contractID=o.contractID LEFT JOIN workers w ON w.workerID=COALESCE(o.workerID,c.workerID) WHERE e.promotionID=? AND ei.complete=1 AND s.segmentType='Match' GROUP BY s.segmentID ORDER BY ei.airDate DESC,s.segmentID DESC LIMIT 40",
            [ctx.promotionId])
    };
}

function bookingScore(worker, featured) {
    var pushBonus = { 'Main Event': 15, 'Upper Midcard': 10, 'Midcard': 5 }[worker.push] || 0;
    return Number(worker.momentum || 0) * 0.22 + Number(worker.popularity || 0) * 0.25 +
        Number(worker.wrestling || 0) * 0.2 + Number(worker.entertainment || 0) * 0.13 +
        Number(worker.starPower || 0) * 0.15 + Number(worker.stamina || 0) * 0.05 +
        pushBonus + (featured.indexOf(worker.contractId) !== -1 ? 30 : 0) - Number(worker.appearances90 || 0) * 0.35;
}

function makeMatch(left, right, length, position, name) {
    return {
        type: 'match',
        participants: [[left.contractId], [right.contractId]],
        segmentLength: length,
        winner: 'auto',
        winType: 'Pinfall',
        purpose: 'Regular Match',
        segmentName: name || (left.name + ' vs ' + right.name),
        description: 'Automatically planned by PWS MCP. Review the winner and finish before applying.',
        segmentPosition: position,
        cardPosition: 'mainshow'
    };
}

function makeAngle(workers, length, position, storyline) {
    var left = workers[0];
    var right = workers[1] || workers[0];
    return {
        type: 'angle',
        angleType: 'Promo',
        participants: [[left.contractId], [right.contractId]],
        segmentLength: length,
        beats: [{
            type: 'promo', length: length,
            group1: [{ contractID: left.contractId, workerID: left.workerId }],
            group2: [{ contractID: right.contractId, workerID: right.workerId }]
        }],
        segmentName: storyline ? (storyline.storylineName || storyline.name) + ' – Story Advancement' : left.name + ' / ' + right.name + ' Promo',
        description: storyline && storyline.overview ? storyline.overview : 'Automatically planned storyline or character-development angle.',
        segmentPosition: position,
        cardPosition: 'mainshow'
    };
}

function planShow(api, options) {
    options = options || {};
    var data = bookingContext(api, options);
    if (data.show.complete || data.show.isCancelled) throw new Error('The selected show cannot be booked');
    var availableMinutes = options.minutes == null ? data.remainingMinutes : Math.min(data.remainingMinutes, Math.max(1, Number(options.minutes)));
    if (availableMinutes < 10) throw new Error('The show has fewer than 10 unbooked minutes');
    var featured = Array.isArray(options.featureContractIds) ? options.featureContractIds.map(Number) : [];
    var avoid = Array.isArray(options.avoidContractIds) ? options.avoidContractIds.map(Number) : [];
    var roster = data.roster.filter(function (worker) {
        return avoid.indexOf(worker.contractId) === -1 && (!data.show.brand || !worker.brand || Number(worker.brand) === Number(data.show.brand));
    });
    roster.forEach(function (worker) { worker.bookingScore = Math.round(bookingScore(worker, featured) * 10) / 10; });
    roster.sort(function (a, b) { return b.bookingScore - a.bookingScore; });
    if (roster.length < 2) throw new Error('At least two available wrestlers are required');

    var desiredMatches = domain.clamp(options.matchCount, Math.max(1, Math.min(7, Math.floor(availableMinutes / 18))), 1, 12);
    desiredMatches = Math.min(desiredMatches, Math.floor(roster.length / 2));
    var chosenAngleLength = domain.clamp(options.angleLength, 6, 3, 15);
    var angleCount = options.includeAngles === false ? 0 : Math.min(domain.clamp(options.angleCount, Math.max(1, Math.floor(desiredMatches / 2)), 0, 8), Math.floor(availableMinutes / 5));
    while (angleCount > 0 && angleCount * chosenAngleLength + desiredMatches * 8 > availableMinutes) angleCount -= 1;
    var angleMinutes = angleCount * chosenAngleLength;
    var matchMinutes = Math.max(desiredMatches * 8, availableMinutes - angleMinutes);
    var baseMatchLength = Math.max(8, Math.floor(matchMinutes / desiredMatches));
    var used = {};
    var pairs = [];

    function workerByContract(id) {
        return roster.find(function (worker) { return worker.contractId === Number(id); });
    }
    function addPair(left, right, reason) {
        if (!left || !right || left.contractId === right.contractId || used[left.contractId] || used[right.contractId] || pairs.length >= desiredMatches) return false;
        used[left.contractId] = true;
        used[right.contractId] = true;
        pairs.push({ left: left, right: right, reason: reason });
        return true;
    }

    data.storylines.slice().sort(function (a, b) { return Number(b.heat || 0) - Number(a.heat || 0); }).forEach(function (storyline) {
        var ids = contractIdsFromStoryline(storyline);
        var participants = ids.map(workerByContract).filter(Boolean).filter(function (worker) { return !used[worker.contractId]; });
        var face = participants.find(function (worker) { return worker.alignment === 'Face'; });
        var heel = participants.find(function (worker) { return worker.alignment === 'Heel'; });
        if (!face || !heel) { face = participants[0]; heel = participants[1]; }
        addPair(face, heel, 'active storyline');
    });

    while (pairs.length < desiredMatches) {
        var remaining = roster.filter(function (worker) { return !used[worker.contractId]; });
        if (remaining.length < 2) break;
        var left = remaining[0];
        var opponent = remaining.find(function (worker) { return worker.alignment && left.alignment && worker.alignment !== left.alignment && worker.gender === left.gender; }) ||
            remaining.find(function (worker) { return worker.alignment && left.alignment && worker.alignment !== left.alignment; }) || remaining[1];
        if (!addPair(left, opponent, 'roster ranking and alignment')) break;
    }

    var segments = [];
    var position = data.existingCard.length + 1;
    var storylineAngles = data.storylines.slice(0, angleCount);
    pairs.slice().reverse().forEach(function (pair, index) {
        var isMainEvent = index === pairs.length - 1;
        var length = baseMatchLength + (isMainEvent ? Math.min(5, Math.max(0, availableMinutes - angleMinutes - baseMatchLength * pairs.length)) : 0);
        segments.push(makeMatch(pair.left, pair.right, length, position, isMainEvent ? 'Main Event: ' + pair.left.name + ' vs ' + pair.right.name : null));
        segments[segments.length - 1].planningReason = pair.reason;
        position += 1;
        if (segments.length < pairs.length + angleCount && storylineAngles.length) {
            var storyline = storylineAngles.shift();
            var storyWorkers = contractIdsFromStoryline(storyline).map(workerByContract).filter(function (worker) { return worker && worker.canDoAngles; });
            if (storyWorkers.length >= 2) {
                segments.push(makeAngle(storyWorkers, chosenAngleLength, position, storyline));
                position += 1;
            }
        }
    });
    while (segments.filter(function (segment) { return segment.type === 'angle'; }).length < angleCount) {
        var talkers = roster.filter(function (worker) { return worker.canDoAngles; }).sort(function (a, b) { return Number(b.entertainment || 0) - Number(a.entertainment || 0); });
        var offset = segments.filter(function (segment) { return segment.type === 'angle'; }).length * 2;
        if (!talkers[offset] || !talkers[offset + 1]) break;
        segments.splice(Math.max(0, segments.length - 1), 0, makeAngle([talkers[offset], talkers[offset + 1]], chosenAngleLength, position, null));
        position += 1;
    }
    segments.forEach(function (segment, index) { segment.segmentPosition = data.existingCard.length + index + 1; });
    var plannedMinutes = segments.reduce(function (sum, segment) { return sum + Number(segment.segmentLength || 0); }, 0);
    return {
        game: data.game,
        show: data.show,
        status: 'dry-run',
        existingBookedMinutes: data.bookedMinutes,
        availableMinutes: data.remainingMinutes,
        plannedMinutes: plannedMinutes,
        projectedTotalMinutes: data.bookedMinutes + plannedMinutes,
        preferences: { requestedMinutes: options.minutes || null, requestedMatches: options.matchCount || null, includeAngles: options.includeAngles !== false, notes: options.notes || null },
        segments: segments,
        warnings: [
            'This is a draft. Review winners, finishes, title stakes, match purposes, storyline continuity, and worker repetition before applying.',
            'Applying the plan requires pws_apply_show_plan with confirmed=true.'
        ]
    };
}

function duration(segment) {
    if (segment.type === 'match') return Number(segment.segmentLength || 0);
    if (Array.isArray(segment.beats)) return segment.beats.reduce(function (sum, beat) { return sum + Number(beat.length || 0); }, 0);
    return Number(segment.segmentLength || 0);
}

function validatePlan(api, options) {
    options = options || {};
    var showId = domain.integer(options.showId);
    if (showId === null) throw new Error('showId is required');
    var card = domain.show(api, { showId: showId });
    var ctx = domain.context(api);
    if (Number(card.show.promotionID) !== ctx.promotionId) throw new Error('The show does not belong to the player promotion');
    if (card.show.complete || card.show.isCancelled) throw new Error('The show is completed or cancelled');
    if (!Array.isArray(options.segments) || !options.segments.length) throw new Error('segments must contain at least one segment');
    if (options.segments.length > 40) throw new Error('A single operation cannot add more than 40 segments');
    var active = domain.rosterRows(api, ctx, { includeStaff: true, limit: 1000 });
    var byContract = {};
    active.forEach(function (row) { byContract[Number(row.contractID)] = row; });
    var matchUsage = {};
    var normalized = options.segments.map(function (input, index) {
        var segment = clone(input);
        segment.type = String(segment.type || '').toLowerCase();
        if (segment.type !== 'match' && segment.type !== 'angle') throw new Error('Segment ' + (index + 1) + ' must have type match or angle');
        segmentService.rejectUnknown(input, segment.type === 'match' ? MATCH_PLAN_FIELDS : ANGLE_PLAN_FIELDS, 'Segment ' + (index + 1));
        var minimumGroups = segment.type === 'match' ? 2 : 1;
        if (!Array.isArray(segment.participants) || segment.participants.length < minimumGroups) throw new Error('Segment ' + (index + 1) + ' requires at least ' + minimumGroups + ' participant group' + (minimumGroups === 1 ? '' : 's'));
        segment.participants = segment.participants.map(function (group) {
            if (!Array.isArray(group) || !group.length) throw new Error('Every participant group must contain a contract ID');
            return group.map(function (id) {
                var contractId = Number(id);
                var worker = byContract[contractId];
                if (!worker) throw new Error('Contract ' + id + ' is not active at the player promotion');
                var unavailable = domain.unavailabilityAt(worker, card.show.date || ctx.currentDate);
                if (unavailable.length) {
                    var first = unavailable[0];
                    throw new Error(worker.name + ' is unavailable on ' + (card.show.date || ctx.currentDate) + ' (' + first.reason + (first.returnDate ? ' until ' + first.returnDate : '') + ')');
                }
                if (segment.type === 'match' && !domain.canParticipateInMatch(worker.type)) throw new Error(worker.name + ' is not a wrestler and cannot be a match participant');
                return contractId;
            });
        });
        var flattened = [].concat.apply([], segment.participants);
        if (new Set(flattened).size !== flattened.length) throw new Error('Segment ' + (index + 1) + ' contains a duplicate participant');
        if (segment.type === 'match') {
            flattened.forEach(function (contractId) {
                if (matchUsage[contractId] && !options.allowMultipleMatches) throw new Error('Contract ' + contractId + ' is booked in more than one new match');
                matchUsage[contractId] = true;
            });
            segment.segmentLength = domain.clamp(segment.segmentLength, 10, 1, 120);
            segment.titleIds = segment.titleIds == null ? [] : segment.titleIds;
            var selectedTitles = segmentService.validateTitles(api, ctx, card.show, segment.participants, segment.titleIds, byContract);
            segment.titleIds = selectedTitles.map(function (title) { return title.titleId; });
            var winner = segment.winner == null ? 'auto' : String(segment.winner);
            if (winner !== 'auto' && winner !== 'draw') {
                var winnerId = domain.integer(segment.winner);
                if (winnerId === null || flattened.indexOf(winnerId) === -1) throw new Error('Segment ' + (index + 1) + ' winner must be auto, draw, or a participating contract ID');
                segment.winner = String(winnerId);
            } else segment.winner = winner;
            segment.winType = segment.winType || 'Pinfall';
            segment.purpose = segment.purpose || 'Regular Match';
            segment.gimmick = segment.gimmick || 'None';
            segment.finishSpecific = segment.finishSpecific || '';
            segment.matchStoryId = segment.matchStoryId || 'None';
            if (segment.gimmick !== 'None' && !domain.get(api, 'SELECT matchgimmickID FROM matchgimmicks WHERE name=?', [segment.gimmick])) throw new Error('Segment ' + (index + 1) + ' uses an unknown match gimmick: ' + segment.gimmick);
            if (segment.matchStoryId !== 'None') {
                var matchStoryId = domain.integer(segment.matchStoryId);
                if (matchStoryId === null || !domain.get(api, 'SELECT matchstoryID FROM matchstories WHERE matchstoryID=?', [matchStoryId])) throw new Error('Segment ' + (index + 1) + ' uses an unknown matchStoryId: ' + segment.matchStoryId);
                segment.matchStoryId = String(matchStoryId);
            }
            ['purposeWorker', 'referee', 'agent'].forEach(function (field) {
                if (segment[field] == null || segment[field] === '') return;
                var contractId = domain.integer(segment[field]);
                if (contractId === null || !byContract[contractId]) throw new Error('Segment ' + (index + 1) + ' ' + field + ' is not an active player-promotion contract');
                segment[field] = contractId;
            });
            if (segment.purposeWorker != null && flattened.indexOf(Number(segment.purposeWorker)) === -1) throw new Error('Segment ' + (index + 1) + ' purposeWorker must be a match participant');
            if (segment.losers != null && segment.losers !== '' && segment.losers !== 'Unspecified') {
                var loserId = domain.integer(segment.losers);
                if (loserId === null || flattened.indexOf(loserId) === -1) throw new Error('Segment ' + (index + 1) + ' losers must be a match participant or Unspecified');
                segment.losers = String(loserId);
            }
            ['announcers', 'ringsideWorkers'].forEach(function (field) {
                if (segment[field] == null) return;
                if (!Array.isArray(segment[field])) throw new Error('Segment ' + (index + 1) + ' ' + field + ' must be an array');
                if (field === 'announcers' && segment[field].length > 4) throw new Error('Segment ' + (index + 1) + ' cannot have more than four announcers');
                var seenIds = {};
                segment[field] = segment[field].map(function (value) {
                    var contractId = domain.integer(value);
                    if (contractId === null || !byContract[contractId]) throw new Error('Segment ' + (index + 1) + ' ' + field + ' contains a contract that is not active at the player promotion');
                    if (seenIds[contractId]) throw new Error('Segment ' + (index + 1) + ' ' + field + ' contains duplicate contract ' + contractId);
                    if (field === 'ringsideWorkers' && flattened.indexOf(contractId) !== -1) throw new Error('Segment ' + (index + 1) + ' ringside worker ' + contractId + ' is already a participant');
                    seenIds[contractId] = true;
                    return contractId;
                });
            });
        } else {
            segment.angleType = segment.angleType || 'Promo';
            if (!Array.isArray(segment.beats) || !segment.beats.length) {
                if (segment.participants.length > 3) throw new Error('Segment ' + (index + 1) + ' has more than three angle groups; PWS beats support group1 through group3');
                var generatedBeat = { type: 'promo', length: domain.clamp(segment.segmentLength, 5, 1, 60) };
                segment.participants.forEach(function (group, groupIndex) {
                    generatedBeat['group' + (groupIndex + 1)] = group.map(function (contractId) {
                        return { contractID: Number(contractId), workerID: Number(byContract[contractId].workerID) };
                    });
                });
                segment.beats = [generatedBeat];
            }
            segment.beats = segmentService.normalizeBeats(segment.beats, byContract);
            delete segment.segmentLength;
        }
        segment.showId = showId;
        segment.cardPosition = segment.cardPosition || 'mainshow';
        segment.segmentName = segment.segmentName || '';
        segment.description = segment.description || '';
        delete segment.planningReason;
        delete segment.type;
        return { kind: String(input.type).toLowerCase(), options: segment, selectedTitles: selectedTitles || [] };
    });
    var addedMinutes = normalized.reduce(function (sum, item) { return sum + duration(Object.assign({ type: item.kind }, item.options)); }, 0);
    var projected = card.bookedMinutes + addedMinutes;
    if (projected > Number(card.show.length || 0) && !options.allowOverrun) throw new Error('Plan exceeds the show length by ' + (projected - Number(card.show.length || 0)) + ' minutes');
    return {
        show: card.show, existingCard: card.segments, existingMinutes: card.bookedMinutes, addedMinutes: addedMinutes,
        projectedMinutes: projected, segments: normalized,
        selectedTitles: normalized.reduce(function (all, item, index) {
            return all.concat((item.selectedTitles || []).map(function (title) { return Object.assign({ segmentIndex: index }, title); }));
        }, [])
    };
}

function rollbackCreated(api, created) {
    var rollback = [];
    for (var reverse = created.length - 1; reverse >= 0; reverse -= 1) {
        try { rollback.push(Object.assign({ segmentId: created[reverse].segmentId }, api.actions.removeSegment(created[reverse].segmentId))); }
        catch (error) { rollback.push({ segmentId: created[reverse].segmentId, success: false, error: error.message }); }
    }
    return rollback;
}

function verificationFields(item) {
    var fields = ['participants', 'segmentLength', 'segmentName', 'description', 'cardPosition'];
    if (item.options.segmentPosition != null) fields.push('segmentPosition');
    if (item.kind === 'match') {
        fields = fields.concat(['titleIds', 'winner', 'winType', 'purpose', 'finishSpecific', 'gimmick', 'matchStoryId']);
        if (item.options.referee != null) fields.push('referee');
        if (item.options.agent != null) fields.push('agent');
        if (item.options.announcers != null) fields.push('announcers');
        if (item.options.ringsideWorkers != null) fields.push('ringsideWorkers');
    } else fields = fields.concat(['angleType', 'beats']);
    return fields;
}

function applyPlan(api, options) {
    if (!options || options.confirmed !== true) throw new Error('Refusing to change the save: set confirmed=true after the user reviews the plan');
    var validated = validatePlan(api, options);
    var created = [];
    for (var index = 0; index < validated.segments.length; index += 1) {
        var item = validated.segments[index];
        var result;
        try { result = item.kind === 'match' ? api.actions.bookMatch(item.options) : api.actions.bookAngle(item.options); }
        catch (error) {
            return { success: false, error: error.message, failedAt: index, createdBeforeFailure: created, rollback: rollbackCreated(api, created) };
        }
        if (!result || !result.success) {
            var rollback = rollbackCreated(api, created);
            return { success: false, error: result && result.error ? result.error : 'PWS rejected segment ' + (index + 1), failedAt: index, createdBeforeFailure: created, rollback: rollback };
        }
        var createdItem = { type: item.kind, segmentId: Number(result.segmentId) };
        created.push(createdItem);
        try {
            var persisted = segmentService.readSegment(api, createdItem.segmentId);
            var expected = Object.assign({}, item.options);
            expected.segmentName = expected.segmentName || '';
            expected.description = expected.description || '';
            expected.cardPosition = expected.cardPosition || 'mainshow';
            if (item.kind === 'angle') expected.segmentLength = duration({ type: 'angle', beats: expected.beats });
            var mismatches = segmentService.verifyRequested(expected, persisted, verificationFields(item));
            if (mismatches.length) {
                return {
                    success: false,
                    error: 'Post-save verification failed for segment ' + (index + 1),
                    failedAt: index,
                    verification: { success: false, mismatches: mismatches },
                    createdBeforeFailure: created,
                    rollback: rollbackCreated(api, created)
                };
            }
            createdItem.segment = persisted;
            createdItem.selectedTitles = item.selectedTitles;
        } catch (error) {
            return {
                success: false, error: 'Could not verify segment ' + (index + 1) + ': ' + error.message,
                failedAt: index, createdBeforeFailure: created, rollback: rollbackCreated(api, created)
            };
        }
    }
    var afterCard;
    var warnings = [];
    try { afterCard = domain.show(api, { showId: Number(validated.show.showId) }); }
    catch (error) {
        afterCard = { segments: validated.existingCard.concat(created.map(function (item) { return item.segment; })), bookedMinutes: validated.projectedMinutes };
        warnings.push('The new segments were verified individually, but the complete card could not be re-read: ' + error.message);
    }
    return {
        success: true, showId: Number(validated.show.showId), addedMinutes: validated.addedMinutes,
        projectedMinutes: validated.projectedMinutes, selectedTitles: validated.selectedTitles,
        createdSegments: created, verifiedCard: created.map(function (item) { return item.segment; }),
        verification: { success: true, mismatches: [] },
        before: { segments: validated.existingCard, bookedMinutes: validated.existingMinutes },
        after: { segments: afterCard.segments, bookedMinutes: afterCard.bookedMinutes }, warnings: warnings
    };
}

module.exports = { applyPlan: applyPlan, bookingContext: bookingContext, planShow: planShow, validatePlan: validatePlan };

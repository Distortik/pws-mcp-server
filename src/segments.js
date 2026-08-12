'use strict';

var audit = require('./audit');
var domain = require('./domain');

var COMMON_CHANGE_FIELDS = ['participants', 'segmentLength', 'segmentPosition', 'cardPosition', 'segmentName', 'description'];
var MATCH_CHANGE_FIELDS = COMMON_CHANGE_FIELDS.concat([
    'titleIds', 'winner', 'winType', 'finishSpecific', 'purpose', 'purposeWorker', 'losers',
    'gimmick', 'matchStoryId', 'referee', 'agent', 'announcers', 'ringsideWorkers'
]);
var ANGLE_CHANGE_FIELDS = COMMON_CHANGE_FIELDS.concat(['angleType', 'beats', 'subjectContractIds']);

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function has(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

function rejectUnknown(object, allowed, label) {
    Object.keys(object || {}).forEach(function (key) {
        if (allowed.indexOf(key) === -1) throw new Error((label || 'Object') + ' contains unsupported field "' + key + '"');
    });
}

function requiredInteger(value, label, minimum) {
    var result = domain.integer(value);
    if (result === null || (minimum != null && result < minimum)) throw new Error(label + ' must be an integer' + (minimum != null ? ' of at least ' + minimum : ''));
    return result;
}

function optionalContract(value, label) {
    if (value == null || value === '') return '';
    return requiredInteger(value, label, 1);
}

function boundedText(value, label, maxLength) {
    if (value == null) return '';
    var result = String(value);
    if (result.length > maxLength) throw new Error(label + ' cannot exceed ' + maxLength + ' characters');
    return result;
}

function uniqueIntegers(values, label, maximum) {
    if (!Array.isArray(values)) throw new Error(label + ' must be an array');
    if (maximum != null && values.length > maximum) throw new Error(label + ' cannot contain more than ' + maximum + ' values');
    var seen = {};
    return values.map(function (value, index) {
        var id = requiredInteger(value, label + '[' + index + ']', 1);
        if (seen[id]) throw new Error(label + ' contains duplicate ID ' + id);
        seen[id] = true;
        return id;
    });
}

function normalizeCardPosition(value) {
    var result = value == null || value === '' ? 'mainshow' : String(value).toLowerCase();
    if (['preshow', 'mainshow', 'postshow'].indexOf(result) === -1) throw new Error('cardPosition must be preshow, mainshow, or postshow');
    return result;
}

function cardPosition(row) {
    if (Number(row.isPreshow)) return 'preshow';
    if (Number(row.isPostshow)) return 'postshow';
    return 'mainshow';
}

function parseBeats(value) {
    if (Array.isArray(value)) return clone(value);
    if (!value) return [];
    try {
        var parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function readSegment(api, segmentId) {
    segmentId = requiredInteger(segmentId, 'segmentId', 1);
    var row = domain.get(api, [
        'SELECT s.*,ei.complete,ei.isCancelled,e.promotionID,e.brand AS showBrand',
        'FROM segments s JOIN eventinstance ei ON ei.instanceID=s.showID',
        'JOIN events e ON e.eventID=ei.eventID WHERE s.segmentID=?'
    ].join(' '), [segmentId]);
    if (!row) throw new Error('Segment not found: ' + segmentId);
    var opponentRows = domain.query(api, [
        'SELECT o.opponentID,o.opponentSet,o.contractID,o.workerID,o.isRingside,o.isSubject,',
        "COALESCE(NULLIF(c.contractName,''),w.name) AS name",
        'FROM opponents o LEFT JOIN contracts c ON c.contractID=o.contractID',
        'LEFT JOIN workers w ON w.workerID=COALESCE(o.workerID,c.workerID)',
        'WHERE o.segmentID=? ORDER BY o.opponentSet,o.opponentID'
    ].join(' '), [segmentId]);
    var groups = {};
    var ringside = [];
    var subjects = [];
    opponentRows.forEach(function (opponent) {
        var contractId = Number(opponent.contractID);
        if (!Number.isInteger(contractId)) return;
        if (Number(opponent.isRingside) === 1 || Number(opponent.opponentSet) < 0) {
            ringside.push(contractId);
            return;
        }
        var group = Number(opponent.opponentSet);
        if (!groups[group]) groups[group] = [];
        groups[group].push(contractId);
        if (Number(opponent.isSubject) === 1) subjects.push(contractId);
    });
    var participants = Object.keys(groups).map(Number).sort(function (a, b) { return a - b; }).map(function (key) { return groups[key]; });
    var titleRows = domain.query(api, [
        'SELECT mt.matchTitleID,mt.titleID,mt.champion,mt.winner,t.name,t.type,t.promotionID,t.inactive,',
        't.brand,t.genderLimits,t.defendable,t.currentChampion,t.currentChampion2,t.currentChampion3,t.defences',
        'FROM matchtitles mt LEFT JOIN titles t ON t.titleID=mt.titleID',
        'WHERE mt.segmentID=? ORDER BY mt.matchTitleID'
    ].join(' '), [segmentId]);
    var type = String(row.segmentType || '').toLowerCase();
    var result = {
        segmentId: Number(row.segmentID),
        showId: Number(row.showID),
        type: type,
        segmentLength: Number(row.segmentLength || 0),
        segmentPosition: Number(row.segmentorder || 0),
        cardPosition: cardPosition(row),
        segmentName: row.segmentName || '',
        description: row.description || '',
        participants: participants,
        opponentDetails: opponentRows.map(function (item) {
            return { contractId: Number(item.contractID), workerId: Number(item.workerID), name: item.name || null, group: Number(item.opponentSet), ringside: Boolean(item.isRingside || Number(item.opponentSet) < 0), subject: Boolean(item.isSubject) };
        }),
        titleIds: titleRows.map(function (title) { return Number(title.titleID); }),
        titles: titleRows.map(function (title) {
            return {
                titleId: Number(title.titleID), name: title.name || null, type: title.type || null,
                champion: title.champion == null ? null : Number(title.champion),
                winner: title.winner == null ? null : Number(title.winner),
                currentChampionIds: [title.currentChampion, title.currentChampion2, title.currentChampion3].filter(function (id) { return Number(id) > 0; }).map(Number),
                defences: Number(title.defences || 0)
            };
        })
    };
    if (type === 'match') {
        Object.assign(result, {
            winner: row.winner == null || row.winner === '' ? 'auto' : String(row.winner),
            winnerWorkerId: Number(row.winnerWorkerID || 0),
            winningSet: row.winningSet == null ? '' : String(row.winningSet),
            winType: row.winType || '', finishSpecific: row.finishSpecific || '', purpose: row.purpose || '',
            purposeWorker: row.purposeWorker === '' || row.purposeWorker == null ? null : Number(row.purposeWorker),
            losers: row.losers || '', gimmick: row.gimmick || '',
            matchStoryId: row.matchStoryID == null || row.matchStoryID === '' ? 'None' : String(row.matchStoryID),
            referee: row.referee === '' || row.referee == null ? null : Number(row.referee),
            agent: row.agent === '' || row.agent == null ? null : Number(row.agent),
            announcers: [row.announcer1, row.announcer2, row.announcer3, row.announcer4].filter(function (id) { return id !== '' && id != null && Number(id) > 0; }).map(Number),
            ringsideWorkers: ringside
        });
    } else if (type === 'angle') {
        result.angleType = row.angleType || '';
        result.beats = parseBeats(row.beats);
        result.subjectContractIds = subjects;
        result.videoOnly = Boolean(row.videoOnly);
    }
    return result;
}

function contractMap(api, promotionId) {
    var rows = domain.query(api, [
        'SELECT c.contractID,c.workerID,c.promotionID,c.brand,c.suspended,c.onTimeOff,w.name,w.type,w.gender,',
        'w.injuryType,w.isSuspended FROM contracts c JOIN workers w ON w.workerID=c.workerID',
        'WHERE c.promotionID=? AND c.finalised=1 AND c.expired=0 AND c.contractStarted=1'
    ].join(' '), [promotionId]);
    var result = {};
    rows.forEach(function (row) { result[Number(row.contractID)] = row; });
    return result;
}

function validateContractIds(values, label, contracts, options) {
    options = options || {};
    var ids = uniqueIntegers(values, label, options.maximum);
    ids.forEach(function (id) {
        var contract = contracts[id];
        if (!contract) throw new Error('Contract ' + id + ' is not active at the player promotion');
        if (options.requireAvailable !== false && (contract.injuryType || contract.isSuspended || contract.suspended || contract.onTimeOff)) {
            throw new Error((contract.name || ('Contract ' + id)) + ' is unavailable');
        }
    });
    return ids;
}

function validateParticipants(value, contracts, minimumGroups, options) {
    options = options || {};
    if (!Array.isArray(value) || value.length < minimumGroups) throw new Error('participants must contain at least ' + minimumGroups + ' non-empty group' + (minimumGroups === 1 ? '' : 's'));
    var seen = {};
    return value.map(function (group, groupIndex) {
        var ids = validateContractIds(group, 'participants[' + groupIndex + ']', contracts);
        if (!ids.length) throw new Error('participants[' + groupIndex + '] cannot be empty');
        ids.forEach(function (id) {
            if (options.requireWrestlers && !domain.canParticipateInMatch(contracts[id].type)) throw new Error((contracts[id].name || ('Contract ' + id)) + ' is not a wrestler and cannot be a match participant');
            if (seen[id]) throw new Error('participants contains duplicate contract ' + id);
            seen[id] = true;
        });
        return ids;
    });
}

function titleTeamSize(type) {
    var normalized = String(type || '').toLowerCase();
    if (/trio|six.?man/.test(normalized)) return 3;
    if (/tag/.test(normalized)) return 2;
    return 1;
}

function genderAllowed(limit, gender) {
    var normalized = String(limit || '').toLowerCase();
    if (!normalized || /none|open|any|all|mixed/.test(normalized)) return true;
    if (/women|woman|female/.test(normalized)) return String(gender || '').toLowerCase() === 'female';
    if (/men|man|male/.test(normalized)) return String(gender || '').toLowerCase() === 'male';
    return true;
}

function validateTitles(api, context, show, participants, titleIds, contracts) {
    var ids = uniqueIntegers(titleIds || [], 'titleIds', 20);
    var flattened = [].concat.apply([], participants || []);
    var workerIds = flattened.map(function (id) { return Number(contracts[id].workerID); });
    return ids.map(function (titleId) {
        var title = domain.get(api, [
            'SELECT titleID,promotionID,name,type,inactive,brand,genderLimits,defendable,',
            'currentChampion,currentChampion2,currentChampion3,defences FROM titles WHERE titleID=?'
        ].join(' '), [titleId]);
        if (!title) throw new Error('Title ' + titleId + ' does not exist');
        if (Number(title.inactive) === 1) throw new Error((title.name || ('Title ' + titleId)) + ' is inactive');
        if (Number(title.promotionID) !== Number(context.promotionId)) throw new Error((title.name || ('Title ' + titleId)) + ' does not belong to the player promotion');
        if (title.defendable != null && Number(title.defendable) === 0) throw new Error((title.name || ('Title ' + titleId)) + ' is not defendable');
        if (show.brand != null && show.brand !== '' && title.brand != null && title.brand !== '' && Number(show.brand) !== Number(title.brand)) {
            throw new Error((title.name || ('Title ' + titleId)) + ' belongs to a different brand');
        }
        var expectedTeamSize = titleTeamSize(title.type);
        participants.forEach(function (group) {
            if (group.length !== expectedTeamSize) throw new Error((title.name || ('Title ' + titleId)) + ' requires ' + expectedTeamSize + ' wrestler' + (expectedTeamSize === 1 ? '' : 's') + ' in every participant group');
        });
        flattened.forEach(function (contractId) {
            if (!genderAllowed(title.genderLimits, contracts[contractId].gender)) throw new Error((contracts[contractId].name || ('Contract ' + contractId)) + ' is not eligible for ' + (title.name || ('title ' + titleId)) + ' under its gender rules');
        });
        var champions = [title.currentChampion, title.currentChampion2, title.currentChampion3].filter(function (id) { return Number(id) > 0; }).map(Number);
        champions.forEach(function (workerId) {
            if (workerIds.indexOf(workerId) === -1) throw new Error((title.name || ('Title ' + titleId)) + ' is held, but not every current champion is in the match');
        });
        return {
            titleId: Number(title.titleID), name: title.name, type: title.type,
            currentChampionIds: champions, vacant: champions.length === 0,
            defense: champions.length > 0, defences: Number(title.defences || 0)
        };
    });
}

function validateWinner(value, participants, contracts) {
    var winner = value == null || value === '' ? 'auto' : String(value);
    if (winner === 'auto') return { winner: 'auto', winnerWorkerId: 0, winningSet: 'auto' };
    if (winner === 'draw') return { winner: 'draw', winnerWorkerId: 0, winningSet: 'draw' };
    var id = requiredInteger(value, 'winner', 1);
    var set = -1;
    participants.some(function (group, index) {
        if (group.indexOf(id) !== -1) { set = index; return true; }
        return false;
    });
    if (set === -1) throw new Error('Winner contract ' + id + ' is not among the participants');
    return { winner: String(id), winnerWorkerId: Number(contracts[id].workerID), winningSet: String(set) };
}

function normalizeBeats(beats, contracts) {
    if (!Array.isArray(beats) || !beats.length) throw new Error('beats must contain at least one beat');
    var allowed = ['type', 'length', 'group1', 'group2', 'group3', 'option1', 'option2'];
    return beats.map(function (beat, index) {
        if (!beat || typeof beat !== 'object' || Array.isArray(beat)) throw new Error('beats[' + index + '] must be an object');
        rejectUnknown(beat, allowed, 'beats[' + index + ']');
        var result = clone(beat);
        result.type = boundedText(result.type || 'promo', 'beats[' + index + '].type', 50);
        result.length = requiredInteger(result.length == null ? 1 : result.length, 'beats[' + index + '].length', 1);
        if (result.length > 120) throw new Error('beats[' + index + '].length cannot exceed 120');
        ['group1', 'group2', 'group3'].forEach(function (key) {
            if (!has(result, key)) return;
            if (!Array.isArray(result[key])) throw new Error('beats[' + index + '].' + key + ' must be an array');
            result[key] = result[key].map(function (member, memberIndex) {
                if (typeof member === 'object' && member !== null) rejectUnknown(member, ['contractID', 'workerID'], 'beats[' + index + '].' + key + '[' + memberIndex + ']');
                var contractId = typeof member === 'object' && member !== null ? member.contractID : member;
                contractId = requiredInteger(contractId, 'beats[' + index + '].' + key + '[' + memberIndex + '].contractID', 1);
                if (!contracts[contractId]) throw new Error('Contract ' + contractId + ' is not active at the player promotion');
                return { contractID: contractId, workerID: Number(contracts[contractId].workerID) };
            });
        });
        if (has(result, 'option1')) result.option1 = boundedText(result.option1, 'beats[' + index + '].option1', 200);
        if (has(result, 'option2')) result.option2 = boundedText(result.option2, 'beats[' + index + '].option2', 200);
        return result;
    });
}

function same(value1, value2) {
    return JSON.stringify(value1) === JSON.stringify(value2);
}

function sorted(values) {
    return (values || []).slice().map(Number).sort(function (a, b) { return a - b; });
}

function verifyRequested(expected, actual, fields) {
    var mismatches = [];
    fields.forEach(function (field) {
        var left = expected[field];
        var right = actual[field];
        if (field === 'titleIds' || field === 'announcers' || field === 'ringsideWorkers' || field === 'subjectContractIds') {
            left = sorted(left); right = sorted(right);
        }
        if (!same(left, right)) mismatches.push({ field: field, requested: left, persisted: right });
    });
    return mismatches;
}

function normalizeUpdate(api, before, changes) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('changes must be an object');
    var type = before.type;
    rejectUnknown(changes, type === 'match' ? MATCH_CHANGE_FIELDS : ANGLE_CHANGE_FIELDS, 'changes');
    if (!Object.keys(changes).length) throw new Error('changes must contain at least one supported field');
    var context = domain.context(api);
    if (Number(before.promotionId) !== context.promotionId) throw new Error('The segment does not belong to the player promotion');
    if (before.complete || before.isCancelled) throw new Error('The segment is on a completed or cancelled show');
    var contracts = contractMap(api, context.promotionId);
    var desired = clone(before);
    var participants = has(changes, 'participants') ? validateParticipants(changes.participants, contracts, type === 'match' ? 2 : 1, { requireWrestlers: type === 'match' }) : desired.participants;
    desired.participants = participants;
    if (has(changes, 'segmentLength')) {
        desired.segmentLength = requiredInteger(changes.segmentLength, 'segmentLength', 1);
        if (desired.segmentLength > 120) throw new Error('segmentLength cannot exceed 120');
    }
    if (has(changes, 'segmentPosition')) desired.segmentPosition = requiredInteger(changes.segmentPosition, 'segmentPosition', 1);
    if (has(changes, 'cardPosition')) desired.cardPosition = normalizeCardPosition(changes.cardPosition);
    if (has(changes, 'segmentName')) desired.segmentName = boundedText(changes.segmentName, 'segmentName', 500);
    if (has(changes, 'description')) desired.description = boundedText(changes.description, 'description', 10000);
    var selectedTitles = [];
    if (type === 'match') {
        if (has(changes, 'titleIds')) desired.titleIds = uniqueIntegers(changes.titleIds, 'titleIds', 20);
        selectedTitles = validateTitles(api, context, { brand: before.showBrand }, participants, desired.titleIds, contracts);
        desired.titles = selectedTitles;
        var winner = validateWinner(has(changes, 'winner') ? changes.winner : desired.winner, participants, contracts);
        desired.winner = winner.winner;
        desired.winnerWorkerId = winner.winnerWorkerId;
        desired.winningSet = winner.winningSet;
        if (has(changes, 'winType')) desired.winType = boundedText(changes.winType, 'winType', 100);
        if (has(changes, 'finishSpecific')) desired.finishSpecific = boundedText(changes.finishSpecific, 'finishSpecific', 500);
        if (has(changes, 'purpose')) desired.purpose = boundedText(changes.purpose, 'purpose', 100);
        if (has(changes, 'purposeWorker')) desired.purposeWorker = optionalContract(changes.purposeWorker, 'purposeWorker');
        if (has(changes, 'losers')) desired.losers = changes.losers === 'Unspecified' ? 'Unspecified' : String(optionalContract(changes.losers, 'losers'));
        if (has(changes, 'gimmick')) {
            desired.gimmick = boundedText(changes.gimmick, 'gimmick', 200);
            if (desired.gimmick !== 'None' && !domain.get(api, 'SELECT matchgimmickID FROM matchgimmicks WHERE name=?', [desired.gimmick])) throw new Error('Unknown match gimmick: ' + desired.gimmick);
        }
        if (has(changes, 'matchStoryId')) {
            desired.matchStoryId = changes.matchStoryId == null || changes.matchStoryId === '' ? 'None' : String(changes.matchStoryId);
            if (desired.matchStoryId !== 'None') {
                var matchStoryId = requiredInteger(desired.matchStoryId, 'matchStoryId', 1);
                if (!domain.get(api, 'SELECT matchstoryID FROM matchstories WHERE matchstoryID=?', [matchStoryId])) throw new Error('Unknown matchStoryId: ' + matchStoryId);
                desired.matchStoryId = String(matchStoryId);
            }
        }
        if (has(changes, 'referee')) desired.referee = optionalContract(changes.referee, 'referee');
        if (has(changes, 'agent')) desired.agent = optionalContract(changes.agent, 'agent');
        if (has(changes, 'announcers')) desired.announcers = validateContractIds(changes.announcers, 'announcers', contracts, { maximum: 4 });
        if (has(changes, 'ringsideWorkers')) desired.ringsideWorkers = validateContractIds(changes.ringsideWorkers, 'ringsideWorkers', contracts);
        var participantIds = [].concat.apply([], participants);
        ['purposeWorker', 'referee', 'agent'].forEach(function (field) {
            if (desired[field] !== '' && desired[field] != null && !contracts[Number(desired[field])]) throw new Error(field + ' contract ' + desired[field] + ' is not active at the player promotion');
        });
        if (desired.losers !== 'Unspecified' && desired.losers !== '' && !contracts[Number(desired.losers)]) throw new Error('losers contract ' + desired.losers + ' is not active at the player promotion');
        if (desired.purposeWorker !== '' && desired.purposeWorker != null && participantIds.indexOf(Number(desired.purposeWorker)) === -1) throw new Error('purposeWorker must be a match participant');
        if (desired.losers !== 'Unspecified' && desired.losers !== '' && participantIds.indexOf(Number(desired.losers)) === -1) throw new Error('losers must be a match participant or Unspecified');
        desired.ringsideWorkers.forEach(function (contractId) {
            if (participantIds.indexOf(contractId) !== -1) throw new Error('Ringside worker ' + contractId + ' is already a match participant');
        });
    } else {
        if (has(changes, 'angleType')) desired.angleType = boundedText(changes.angleType, 'angleType', 100);
        if (has(changes, 'beats')) {
            desired.beats = normalizeBeats(changes.beats, contracts);
            desired.segmentLength = desired.beats.reduce(function (sum, beat) { return sum + Number(beat.length); }, 0);
        }
        if (has(changes, 'subjectContractIds')) desired.subjectContractIds = validateContractIds(changes.subjectContractIds, 'subjectContractIds', contracts);
        var flattened = [].concat.apply([], participants);
        desired.subjectContractIds.forEach(function (id) {
            if (flattened.indexOf(id) === -1) throw new Error('subjectContractIds contains contract ' + id + ', which is not an angle participant');
        });
    }
    return { desired: desired, contracts: contracts, selectedTitles: selectedTitles };
}

function execute(api, sql, parameters) {
    if (!api.database || typeof api.database.execute !== 'function') throw new Error('This PWS version has not granted the plugin its required narrow database-write capability');
    return api.database.execute(sql, parameters || []);
}

function updateRows(api, desired, changes, contracts) {
    var assignments = [];
    var values = [];
    function set(column, value) { assignments.push(column + '=?'); values.push(value); }
    if (has(changes, 'segmentLength') || has(changes, 'beats')) set('segmentLength', desired.segmentLength);
    if (has(changes, 'segmentPosition')) set('segmentorder', desired.segmentPosition);
    if (has(changes, 'cardPosition')) {
        set('isPreshow', desired.cardPosition === 'preshow' ? 1 : 0);
        set('isMainshow', desired.cardPosition === 'mainshow' ? 1 : 0);
        set('isPostshow', desired.cardPosition === 'postshow' ? 1 : 0);
    }
    if (has(changes, 'segmentName')) set('segmentName', desired.segmentName);
    if (has(changes, 'description')) set('description', desired.description);
    if (desired.type === 'match') {
        if (has(changes, 'winner') || has(changes, 'participants')) {
            set('winner', desired.winner); set('winnerWorkerID', desired.winnerWorkerId); set('winningSet', desired.winningSet);
        }
        var matchColumns = {
            winType: 'winType', finishSpecific: 'finishSpecific', purpose: 'purpose', purposeWorker: 'purposeWorker',
            losers: 'losers', gimmick: 'gimmick', matchStoryId: 'matchStoryID', referee: 'referee', agent: 'agent'
        };
        Object.keys(matchColumns).forEach(function (field) { if (has(changes, field)) set(matchColumns[field], desired[field]); });
        if (has(changes, 'announcers')) {
            for (var announcerIndex = 0; announcerIndex < 4; announcerIndex += 1) set('announcer' + (announcerIndex + 1), desired.announcers[announcerIndex] || '');
        }
    } else {
        if (has(changes, 'angleType')) set('angleType', desired.angleType);
        if (has(changes, 'beats')) {
            set('beats', JSON.stringify(desired.beats));
            set('videoOnly', desired.beats.every(function (beat) { return beat.type === 'video'; }) ? 1 : 0);
        }
    }
    if (assignments.length) execute(api, 'UPDATE segments SET ' + assignments.join(',') + ' WHERE segmentID=?', values.concat([desired.segmentId]));

    if (has(changes, 'participants') || (desired.type === 'match' && has(changes, 'ringsideWorkers')) || (desired.type === 'angle' && has(changes, 'subjectContractIds'))) {
        execute(api, 'DELETE FROM opponents WHERE segmentID=?', [desired.segmentId]);
        desired.participants.forEach(function (group, groupIndex) {
            group.forEach(function (contractId) {
                execute(api, 'INSERT INTO opponents (segmentID,opponentSet,contractID,workerID,isRingside,isSubject) VALUES (?,?,?,?,?,?)', [
                    desired.segmentId, groupIndex, contractId, Number(contracts[contractId].workerID), 0,
                    desired.type === 'angle' && desired.subjectContractIds.indexOf(contractId) !== -1 ? 1 : 0
                ]);
            });
        });
        if (desired.type === 'match') desired.ringsideWorkers.forEach(function (contractId) {
            execute(api, 'INSERT INTO opponents (segmentID,opponentSet,contractID,workerID,isRingside,isSubject) VALUES (?,?,?,?,?,?)', [desired.segmentId, -1, contractId, Number(contracts[contractId].workerID), 1, 0]);
        });
    }
    if (desired.type === 'match' && has(changes, 'titleIds')) {
        execute(api, 'DELETE FROM matchtitles WHERE segmentID=?', [desired.segmentId]);
        desired.titleIds.forEach(function (titleId) {
            execute(api, 'INSERT INTO matchtitles (segmentID,titleID) VALUES (?,?)', [desired.segmentId, titleId]);
        });
    }
}

function updateSegment(api, options) {
    options = options || {};
    rejectUnknown(options, ['segmentId', 'changes', 'preview', 'confirmed'], 'pws_update_segment input');
    var segmentId = requiredInteger(options.segmentId, 'segmentId', 1);
    var raw = domain.get(api, [
        'SELECT s.segmentID,s.showID,s.segmentType,ei.complete,ei.isCancelled,e.promotionID,e.brand AS showBrand',
        'FROM segments s JOIN eventinstance ei ON ei.instanceID=s.showID JOIN events e ON e.eventID=ei.eventID',
        'WHERE s.segmentID=?'
    ].join(' '), [segmentId]);
    if (!raw) throw new Error('Segment not found: ' + segmentId);
    var before = readSegment(api, segmentId);
    before.complete = Boolean(raw.complete);
    before.isCancelled = Boolean(raw.isCancelled);
    before.promotionId = Number(raw.promotionID);
    before.showBrand = raw.showBrand;
    var normalized = normalizeUpdate(api, before, options.changes);
    var desired = normalized.desired;
    var changedFields = Object.keys(options.changes);
    var preview = options.preview !== false;
    var previewResult = {
        success: true, status: 'preview', segmentId: segmentId, before: before, proposed: desired,
        selectedTitles: normalized.selectedTitles,
        warnings: before.type === 'match' && has(options.changes, 'matchStoryId') ? ['matchStoryId selects a match-story template; the current PWS database has no editable pre-show association between a segment and an active storyline.'] : []
    };
    if (preview) return previewResult;
    if (options.confirmed !== true) throw new Error('Refusing to change the save: use preview first, then set preview=false and confirmed=true');

    var began = false;
    try {
        execute(api, 'BEGIN IMMEDIATE');
        began = true;
        updateRows(api, desired, options.changes, normalized.contracts);
        var persisted = readSegment(api, segmentId);
        var fieldsToVerify = changedFields.slice();
        if (changedFields.indexOf('participants') !== -1 && changedFields.indexOf('winner') === -1 && before.type === 'match') fieldsToVerify.push('winner');
        if (changedFields.indexOf('beats') !== -1 && fieldsToVerify.indexOf('segmentLength') === -1) fieldsToVerify.push('segmentLength');
        var mismatches = verifyRequested(desired, persisted, fieldsToVerify);
        if (mismatches.length) throw new Error('Post-save verification failed: ' + JSON.stringify(mismatches));
        execute(api, 'COMMIT');
        began = false;
        var entry = audit.record(api, 'booking.updateSegment', {
            segmentId: segmentId, showId: before.showId, changedFields: changedFields,
            before: before, after: persisted
        });
        return {
            success: true, status: 'applied', segmentId: segmentId, changedFields: changedFields,
            before: before, after: persisted, segment: persisted, selectedTitles: normalized.selectedTitles,
            verification: { success: true, mismatches: [] }, audit: entry
        };
    } catch (error) {
        if (began) {
            try { execute(api, 'ROLLBACK'); } catch (_) { /* return the original error */ }
        }
        throw error;
    }
}

module.exports = {
    ANGLE_CHANGE_FIELDS: ANGLE_CHANGE_FIELDS,
    MATCH_CHANGE_FIELDS: MATCH_CHANGE_FIELDS,
    readSegment: readSegment,
    rejectUnknown: rejectUnknown,
    updateSegment: updateSegment,
    validateParticipants: validateParticipants,
    validateTitles: validateTitles,
    verifyRequested: verifyRequested
};

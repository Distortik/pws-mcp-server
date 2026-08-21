'use strict';

var audit = require('./audit');
var domain = require('./domain');

function integer(value, label) {
    var result = domain.integer(value);
    if (result === null || result < 1) throw new Error(label + ' must be a positive integer');
    return result;
}

function execute(api, sql, values) {
    if (!api.database || typeof api.database.execute !== 'function') throw new Error('This PWS version has not granted the plugin its required narrow database-write capability');
    return api.database.execute(sql, values || []);
}

function mutate(api, options, action, before, proposed, apply, readAfter, verify, warnings) {
    if (options.preview !== false) return { success: true, status: 'preview', action: action, before: before, proposed: proposed, warnings: warnings || [] };
    if (options.confirmed !== true) throw new Error('Refusing to change the save: use preview first, then set preview=false and confirmed=true');
    execute(api, 'BEGIN IMMEDIATE');
    try {
        var result = apply();
        var after = readAfter();
        var error = verify(after);
        if (error) throw new Error('Post-action verification failed: ' + error);
        execute(api, 'COMMIT');
        return { success: true, status: 'applied', action: action, before: before, after: after, result: result || null, verification: { success: true }, audit: audit.record(api, action, { before: before, proposed: proposed }), warnings: warnings || [] };
    } catch (error) {
        try { execute(api, 'ROLLBACK'); } catch (_) { /* preserve original error */ }
        throw error;
    }
}

function context(api) { return domain.context(api); }
function requireAction(api,name) { if(!api.actions || typeof api.actions[name] !== 'function') throw new Error('Action is unavailable in this PWS version: '+name); return api.actions[name]; }

function activeContract(api, contractId) {
    var row = domain.get(api, "SELECT c.contractID,c.workerID,c.promotionID,c.contractName,w.name,w.type FROM contracts c JOIN workers w ON w.workerID=c.workerID WHERE c.contractID=? AND c.finalised=1 AND c.expired=0 AND c.contractStarted=1", [integer(contractId, 'contractId')]);
    if (!row || Number(row.promotionID) !== context(api).promotionId) throw new Error('Contract ' + contractId + ' is not active at the player promotion');
    return row;
}

function auditShow(api, options) {
    options = options || {};
    var show = domain.show(api, { showId: integer(options.showId, 'showId') });
    var ctx = context(api);
    if (Number(show.show.promotionID) !== ctx.promotionId) throw new Error('The show does not belong to the player promotion');
    var errors = [], warnings = [], seenMatches = {}, participantCount = 0;
    if (show.show.complete) warnings.push('This show is already complete.');
    if (show.show.isCancelled) errors.push('This show is cancelled.');
    if (!show.segments.length) errors.push('The card has no segments.');
    show.segments.forEach(function (segment) {
        var participants = [].concat.apply([], segment.participants || []);
        participantCount += participants.length;
        if (!participants.length) errors.push('Segment ' + segment.segmentId + ' has no participants.');
        if (segment.type === 'match') {
            participants.forEach(function (id) {
                if (seenMatches[id]) warnings.push('Contract ' + id + ' is booked in multiple matches (' + seenMatches[id] + ' and ' + segment.segmentId + ').');
                seenMatches[id] = segment.segmentId;
            });
            if (segment.winner !== 'auto' && segment.winner !== 'draw' && participants.indexOf(Number(segment.winner)) === -1) errors.push('Segment ' + segment.segmentId + ' has a winner who is not a participant.');
            if ((segment.titleIds || []).length && segment.winner === 'auto') warnings.push('Title match ' + segment.segmentId + ' still has an automatic winner.');
        }
    });
    var target = Number(show.show.length || 0);
    if (target && show.bookedMinutes > target) errors.push('The card overruns by ' + (show.bookedMinutes - target) + ' minutes.');
    if (target && show.bookedMinutes < Math.floor(target * 0.75)) warnings.push('Only ' + show.bookedMinutes + ' of ' + target + ' minutes are booked.');
    var score = Math.max(0, 100 - errors.length * 25 - warnings.length * 7);
    return { game: domain.state(api), show: show.show, readiness: { score: score, status: errors.length ? 'blocked' : warnings.length ? 'review' : 'ready', errors: errors, warnings: warnings }, totals: { segments: show.segments.length, participants: participantCount, bookedMinutes: show.bookedMinutes, targetMinutes: target }, segments: show.segments };
}

function workerUsage(api, options) {
    options = options || {};
    var ctx = context(api), days = Math.max(7, Math.min(730, Number(options.days || 90)));
    var rows = domain.query(api, [
        "SELECT c.contractID,c.workerID,COALESCE(NULLIF(c.contractName,''),w.name) AS name,c.push,",
        'COUNT(DISTINCT CASE WHEN ei.complete=1 THEN s.showID END) AS appearances,',
        "COUNT(DISTINCT CASE WHEN ei.complete=1 AND lower(s.segmentType)='match' THEN s.segmentID END) AS matches,",
        "COUNT(DISTINCT CASE WHEN ei.complete=1 AND lower(s.segmentType)='angle' THEN s.segmentID END) AS angles,MAX(CASE WHEN ei.complete=1 THEN ei.airDate END) AS lastBooked",
        'FROM contracts c JOIN workers w ON w.workerID=c.workerID LEFT JOIN opponents o ON o.contractID=c.contractID',
        'LEFT JOIN segments s ON s.segmentID=o.segmentID LEFT JOIN eventinstance ei ON ei.instanceID=s.showID AND date(ei.airDate)>=date(?,?)',
        'WHERE c.promotionID=? AND c.finalised=1 AND c.expired=0 AND c.contractStarted=1 GROUP BY c.contractID ORDER BY appearances DESC,name'
    ].join(' '), [ctx.currentDate, '-' + days + ' days', ctx.promotionId]);
    rows.forEach(function (row) {
        row.contractID = Number(row.contractID); row.workerID = Number(row.workerID); row.appearances = Number(row.appearances || 0); row.matches = Number(row.matches || 0); row.angles = Number(row.angles || 0);
        row.rotationFlag = row.appearances === 0 ? 'unused' : row.appearances >= 8 ? 'heavy-use' : 'active';
    });
    return { game: domain.state(api), windowDays: days, workers: rows, summary: { unused: rows.filter(function (r) { return r.rotationFlag === 'unused'; }).length, heavyUse: rows.filter(function (r) { return r.rotationFlag === 'heavy-use'; }).length, active: rows.filter(function (r) { return r.rotationFlag === 'active'; }).length } };
}

function contract(api,id) { return domain.get(api,'SELECT * FROM contracts WHERE contractID=?',[id]); }
function updateContract(api,options) {
    options=options||{}; var id=integer(options.contractId,'contractId'), before=contract(api,id), ctx=context(api);
    if(!before || Number(before.promotionID)!==ctx.promotionId || !Number(before.finalised) || Number(before.expired) || !Number(before.contractStarted)) throw new Error('Contract is not active at the player promotion');
    var allowed=['push','contractName','brand','wagePerMonth','wagePerAppearance','exclusive','role','expiryDate','contractLength','noHouseShows','creativeControl','isDevelopment','developmentPurpose','allowIndyBookings','onTimeOff','timeOffEndDate'];
    var changes={}; allowed.forEach(function(key){ if(Object.prototype.hasOwnProperty.call(options.changes||{},key)) changes[key]=options.changes[key]; });
    if(Object.keys(changes).length!==Object.keys(options.changes||{}).length) throw new Error('changes contains an unsupported contract field');
    if(!Object.keys(changes).length) throw new Error('changes must contain at least one supported field');
    ['wagePerMonth','wagePerAppearance'].forEach(function(key){if(changes[key]!=null){changes[key]=Number(changes[key]);if(!Number.isFinite(changes[key])||changes[key]<0)throw new Error(key+' must be non-negative');}});
    if(changes.contractLength!=null){changes.contractLength=Number(changes.contractLength);if(!Number.isInteger(changes.contractLength)||(changes.contractLength!==-1&&changes.contractLength<1))throw new Error('contractLength must be -1 or a positive number of days');}
    ['exclusive','noHouseShows','creativeControl','isDevelopment','allowIndyBookings','onTimeOff'].forEach(function(key){if(changes[key]!=null)changes[key]=changes[key]?1:0;});
    ['expiryDate','timeOffEndDate'].forEach(function(key){if(changes[key]!=null&&changes[key]!==''&&!/^\d{4}-\d{2}-\d{2}$/.test(String(changes[key])))throw new Error(key+' must be YYYY-MM-DD or empty');});
    if(changes.brand!=null&&changes.brand!==''){changes.brand=integer(changes.brand,'brand');var b=brand(api,changes.brand);if(!b||Number(b.promotionID)!==ctx.promotionId)throw new Error('Brand not found at the player promotion');}
    ['push','contractName','role','developmentPurpose'].forEach(function(key){if(changes[key]!=null)changes[key]=String(changes[key]).trim();});
    return mutate(api,options,'contract.update',before,{contractId:id,changes:changes},function(){var result=requireAction(api,'modifyContract').call(api.actions,{contractId:id,changes:changes});if(!result||result.success===false)throw new Error(result&&result.error||'PWS rejected the contract changes');return result;},function(){return contract(api,id);},function(after){var bad=Object.keys(changes).find(function(key){return ['wagePerMonth','wagePerAppearance','contractLength','exclusive','noHouseShows','creativeControl','isDevelopment','allowIndyBookings','onTimeOff','brand'].indexOf(key)!==-1?Number(after[key]||0)!==Number(changes[key]||0):String(after[key]==null?'':after[key])!==String(changes[key]);});return bad?'contract field '+bad+' was not persisted':null;});
}

function signWorker(api,options) {
    options=options||{}; var ctx=context(api), workerId=integer(options.workerId,'workerId');
    var worker=domain.get(api,'SELECT workerID,name,picture FROM workers WHERE workerID=?',[workerId]); if(!worker)throw new Error('Worker not found: '+workerId);
    var existing=domain.get(api,'SELECT contractID FROM contracts WHERE workerID=? AND promotionID=? AND finalised=1 AND expired=0',[workerId,ctx.promotionId]); if(existing)throw new Error('Worker already has an active player-company contract: '+existing.contractID);
    var type=String(options.contractType||'').trim(); if(['Written','Handshake','PPA'].indexOf(type)===-1)throw new Error('contractType must be Written, Handshake, or PPA');
    var role=String(options.role||'').trim(); if(!role)throw new Error('role is required');
    var proposed={workerId:workerId,promotionId:ctx.promotionId,contractType:type,exclusive:options.exclusive===true,role:role,wagePerMonth:Number(options.wagePerMonth||0),wagePerAppearance:Number(options.wagePerAppearance||0),contractLength:options.contractLength==null?365:Number(options.contractLength),push:String(options.push||'Midcarder'),gimmick:String(options.gimmick||'None'),contractName:String(options.contractName||worker.name),brand:options.brand==null?'':options.brand};
    if(proposed.wagePerMonth<0||proposed.wagePerAppearance<0)throw new Error('Wages must be non-negative'); if(!Number.isInteger(proposed.contractLength)||proposed.contractLength<1)throw new Error('contractLength must be a positive number of days');
    if(proposed.brand!==''){proposed.brand=integer(proposed.brand,'brand');var b=brand(api,proposed.brand);if(!b||Number(b.promotionID)!==ctx.promotionId)throw new Error('Brand not found at the player promotion');}
    if(proposed.gimmick!=='None'&&!domain.get(api,'SELECT name FROM gimmicks WHERE name=?',[proposed.gimmick]))throw new Error('Gimmick not found: '+proposed.gimmick);
    var createdId=null;
    return mutate(api,options,'contract.sign',null,proposed,function(){var result=requireAction(api,'signWorker').call(api.actions,proposed);if(!result||result.success===false)throw new Error(result&&result.error||'PWS rejected the signing');createdId=Number(result.contractId);return result;},function(){return contract(api,createdId);},function(after){return !after||Number(after.workerID)!==workerId||Number(after.promotionID)!==ctx.promotionId||String(after.contractType)!==type?'signed contract was not persisted as requested':null;},['This action signs the worker immediately. It does not simulate PWS offer/counter-offer negotiations.']);
}

function storyline(api,id) { var row=domain.get(api,'SELECT storylineID,storylineName,overview,promotionID,startDate,endDate,active FROM storylines WHERE storylineID=?',[id]); if(row)row.contractIds=domain.query(api,'SELECT contractID FROM storylineworkers WHERE storylineID=? ORDER BY contractID',[id]).map(function(x){return Number(x.contractID);}); return row; }
function createStoryline(api,options) {
    options=options||{};var ctx=context(api),ids=(options.contractIds||[]).map(function(id){return Number(activeContract(api,id).contractID);});if(ids.length<2||ids.length>10||new Set(ids).size!==ids.length)throw new Error('contractIds must contain 2-10 unique active contracts');
    var proposed={promotionId:ctx.promotionId,contractIds:ids,name:String(options.name||'').trim(),overview:String(options.overview||''),startDate:options.startDate||ctx.currentDate};var createdId=null;
    return mutate(api,options,'storyline.create',null,proposed,function(){var result=requireAction(api,'createStoryline').call(api.actions,proposed);if(!result||result.success===false)throw new Error(result&&result.error||'PWS rejected the storyline');createdId=Number(result.storylineId);return result;},function(){return storyline(api,createdId);},function(after){return !after||Number(after.promotionID)!==ctx.promotionId||JSON.stringify(after.contractIds)!==JSON.stringify(ids.slice().sort(function(a,b){return a-b;}))?'storyline or members were not persisted':null;});
}
function updateStoryline(api,options) {
    options=options||{};var id=integer(options.storylineId,'storylineId'),before=storyline(api,id);if(!before||Number(before.promotionID)!==context(api).promotionId)throw new Error('Storyline not found at the player promotion');
    var proposed={name:options.name==null?before.storylineName:String(options.name).trim(),overview:options.overview==null?before.overview:String(options.overview)};if(!proposed.name)throw new Error('name is required');
    return mutate(api,options,'storyline.update',before,proposed,function(){execute(api,'UPDATE storylines SET storylineName=?,overview=? WHERE storylineID=?',[proposed.name,proposed.overview,id]);},function(){return storyline(api,id);},function(after){return !after||after.storylineName!==proposed.name||String(after.overview||'')!==proposed.overview?'storyline metadata was not persisted':null;});
}

function tagTeam(api, tagId) {
    return domain.get(api, 'SELECT t.tagID,t.worker1,t.worker2,t.tagExperience,t.defaultName,t.tagStatus,pt.promotionID,pt.tagName,pt.tagStatus AS promotionStatus FROM tagteams t JOIN promotiontagteams pt ON pt.tagID=t.tagID WHERE t.tagID=? AND pt.promotionID=?', [tagId, context(api).promotionId]);
}
function listTagTeams(api) {
    var promotionId = context(api).promotionId;
    var registered = domain.query(api, 'SELECT t.tagID,t.worker1,t.worker2,t.tagExperience,t.defaultName,t.tagStatus,pt.tagName,pt.tagStatus AS promotionStatus FROM tagteams t JOIN promotiontagteams pt ON pt.tagID=t.tagID WHERE pt.promotionID=? ORDER BY pt.tagName', [promotionId]);
    var available = domain.query(api, [
        "SELECT t.tagID,t.worker1,t.worker2,t.tagExperience,t.defaultName,t.tagStatus,MIN(c1.contractID) AS contractId1,MIN(c2.contractID) AS contractId2,",
        "COALESCE(NULLIF(MIN(c1.contractName),''),MIN(w1.name)) AS workerName1,COALESCE(NULLIF(MIN(c2.contractName),''),MIN(w2.name)) AS workerName2",
        'FROM tagteams t JOIN workers w1 ON w1.workerID=t.worker1 JOIN workers w2 ON w2.workerID=t.worker2',
        'JOIN contracts c1 ON c1.workerID=t.worker1 AND c1.promotionID=? AND c1.finalised=1 AND c1.expired=0 AND c1.contractStarted=1',
        'JOIN contracts c2 ON c2.workerID=t.worker2 AND c2.promotionID=? AND c2.finalised=1 AND c2.expired=0 AND c2.contractStarted=1',
        'WHERE NOT EXISTS (SELECT 1 FROM promotiontagteams pt WHERE pt.tagID=t.tagID AND pt.promotionID=?)',
        'GROUP BY t.tagID ORDER BY t.tagExperience DESC,t.defaultName'
    ].join(' '), [promotionId,promotionId,promotionId]);
    available.forEach(function (team) { team.suggestedName = String(team.defaultName || '').trim() || team.workerName1 + ' & ' + team.workerName2; });
    return { game: domain.state(api), tagTeams: registered, availableExistingTeams: available };
}
function registerTagTeam(api, options) {
    options = options || {}; var id = integer(options.tagId,'tagId'), ctx = context(api);
    var before = domain.get(api, 'SELECT t.* FROM tagteams t WHERE t.tagID=?', [id]);
    if (!before) throw new Error('Global tag team not found: '+id);
    if (domain.get(api,'SELECT tagID FROM promotiontagteams WHERE tagID=? AND promotionID=?',[id,ctx.promotionId])) throw new Error('This tag team is already registered at the player promotion');
    var contracts = [before.worker1,before.worker2].map(function(workerId){ return domain.get(api,"SELECT c.contractID,c.contractName,w.name FROM contracts c JOIN workers w ON w.workerID=c.workerID WHERE c.workerID=? AND c.promotionID=? AND c.finalised=1 AND c.expired=0 AND c.contractStarted=1 ORDER BY c.contractID LIMIT 1",[workerId,ctx.promotionId]); });
    if (!contracts[0] || !contracts[1]) throw new Error('Both tag-team members must have active player-company contracts');
    var name = String(options.name == null ? before.defaultName || '' : options.name).trim() || (contracts[0].contractName || contracts[0].name)+' & '+(contracts[1].contractName || contracts[1].name);
    var proposed = { tagId:id,promotionId:ctx.promotionId,name:name,active:options.active !== false,preservedExperience:Number(before.tagExperience||0) };
    return mutate(api,options,'tagTeam.register',before,proposed,function(){ execute(api,'INSERT INTO promotiontagteams (tagID,promotionID,tagName,tagStatus) VALUES (?,?,?,?)',[id,ctx.promotionId,name,proposed.active?1:0]); if(proposed.active) execute(api,'UPDATE tagteams SET tagStatus=1 WHERE tagID=?',[id]); },function(){ return tagTeam(api,id); },function(after){ return !after || after.tagName!==name || Number(after.promotionStatus)!==(proposed.active?1:0) ? 'promotion tag-team registration was not persisted' : null; });
}
function createTagTeam(api, options) {
    options = options || {}; var one = activeContract(api, options.contractId1), two = activeContract(api, options.contractId2);
    if (Number(one.workerID) === Number(two.workerID)) throw new Error('A tag team requires two different workers');
    var existing = domain.get(api,'SELECT tagID,defaultName,tagExperience FROM tagteams WHERE (worker1=? AND worker2=?) OR (worker1=? AND worker2=?)',[one.workerID,two.workerID,two.workerID,one.workerID]);
    if (existing) throw new Error('These workers already have global tag team '+existing.tagID+'. Register it with pws_register_tag_team to preserve its name and experience.');
    var proposed = { worker1: Number(one.workerID), worker2: Number(two.workerID), name: String(options.name || '').trim() || one.name + ' & ' + two.name, experience: Math.max(0, Math.min(100, Number(options.experience || 0))), promotionId: context(api).promotionId, status: options.active === false ? 0 : 1 };
    var createdId = null;
    return mutate(api, options, 'tagTeam.create', null, proposed, function () { var result = api.actions.createTagTeam(proposed); if (!result || result.success === false) throw new Error(result && result.error || 'PWS rejected the tag team'); createdId = Number(result.tagId); return result; }, function () { return tagTeam(api, createdId); }, function (after) { return !after || Number(after.promotionID) !== proposed.promotionId ? 'tag team was not persisted' : null; });
}
function updateTagTeam(api, options) {
    options = options || {}; var id = integer(options.tagId, 'tagId'), before = tagTeam(api, id);
    if (!before || Number(before.promotionID) !== context(api).promotionId) throw new Error('Tag team not found at the player promotion');
    var member1 = options.contractId1 == null ? null : activeContract(api, options.contractId1), member2 = options.contractId2 == null ? null : activeContract(api, options.contractId2);
    var proposed = { tagId: id, name: options.name == null ? before.tagName : String(options.name).trim(), experience: options.experience == null ? Number(before.tagExperience) : Math.max(0, Math.min(100, Number(options.experience))), status: options.active == null ? Number(before.tagStatus) : options.active === false ? 0 : 1, worker1: member1 ? Number(member1.workerID) : Number(before.worker1), worker2: member2 ? Number(member2.workerID) : Number(before.worker2) };
    if (proposed.worker1 === proposed.worker2) throw new Error('A tag team requires two different workers');
    return mutate(api, options, 'tagTeam.update', before, proposed, function () { var result = api.actions.updateTagTeam({ tagId:id,name:proposed.name,experience:proposed.experience,status:proposed.status }); if (result && result.success === false) throw new Error(result.error || 'PWS rejected the update'); execute(api, 'UPDATE tagteams SET worker1=?,worker2=? WHERE tagID=?', [proposed.worker1,proposed.worker2,id]); execute(api, 'UPDATE promotiontagteams SET tagName=?,tagStatus=? WHERE tagID=? AND promotionID=?', [proposed.name, proposed.status, id, context(api).promotionId]); return result; }, function () { return tagTeam(api, id); }, function (after) { return !after || after.tagName !== proposed.name || Number(after.tagExperience) !== proposed.experience || Number(after.worker1) !== proposed.worker1 || Number(after.worker2) !== proposed.worker2 ? 'tag team changes were not persisted' : null; });
}
function dissolveTagTeam(api, options) {
    options = options || {}; var id = integer(options.tagId, 'tagId'), before = tagTeam(api, id);
    if (!before || Number(before.promotionID) !== context(api).promotionId) throw new Error('Tag team not found at the player promotion');
    return mutate(api, options, 'tagTeam.dissolve', before, { tagId: id, operation: 'dissolve' }, function () { var result = api.actions.dissolveTagTeam(id); if (result && result.success === false) throw new Error(result.error || 'PWS rejected the dissolution'); return result; }, function () { return tagTeam(api, id); }, function (after) { return after ? 'tag team still exists' : null; });
}

function brand(api, id) { return domain.get(api, 'SELECT brandID,brandName,promotionID,importance,announcer1,announcer2,announcer3,announcer4 FROM brands WHERE brandID=?', [id]); }
function listBrands(api) { return { game: domain.state(api), brands: domain.query(api, 'SELECT brandID,brandName,importance,announcer1,announcer2,announcer3,announcer4 FROM brands WHERE promotionID=? ORDER BY importance DESC,brandName', [context(api).promotionId]) }; }
function saveBrand(api, options) {
    options = options || {}; var id = options.brandId == null ? null : integer(options.brandId, 'brandId'), before = id ? brand(api, id) : null;
    if (id && (!before || Number(before.promotionID) !== context(api).promotionId)) throw new Error('Brand not found at the player promotion');
    var proposed = { name: String(options.name == null && before ? before.brandName : options.name || '').trim(), importance: Number(options.importance == null && before ? before.importance : options.importance || 1) };
    if (!proposed.name) throw new Error('name is required');
    return mutate(api, options, id ? 'brand.update' : 'brand.create', before, proposed, function () { if (id) execute(api, 'UPDATE brands SET brandName=?,importance=? WHERE brandID=?', [proposed.name, proposed.importance, id]); else { execute(api, 'INSERT INTO brands (brandName,importance,promotionID) VALUES (?,?,?)', [proposed.name, proposed.importance, context(api).promotionId]); id = Number(domain.get(api, 'SELECT last_insert_rowid() AS id').id); } }, function () { return brand(api, id); }, function (after) { return !after || after.brandName !== proposed.name ? 'brand was not persisted' : null; });
}
function assignBrand(api, options) {
    options = options || {}; var contract = activeContract(api, options.contractId), before = domain.get(api, 'SELECT contractID,brand FROM contracts WHERE contractID=?', [contract.contractID]);
    var brandId = options.brandId == null ? '' : integer(options.brandId, 'brandId');
    if (brandId !== '') { var selected = brand(api, brandId); if (!selected || Number(selected.promotionID) !== context(api).promotionId) throw new Error('Brand not found at the player promotion'); }
    return mutate(api, options, 'brand.assignWorker', before, { contractId:Number(contract.contractID),brandId:brandId || null }, function () { execute(api, 'UPDATE contracts SET brand=? WHERE contractID=?', [brandId,contract.contractID]); }, function () { return domain.get(api, 'SELECT contractID,brand FROM contracts WHERE contractID=?', [contract.contractID]); }, function (after) { return String(after.brand || '') !== String(brandId) ? 'worker brand was not persisted' : null; });
}
function deleteBrand(api, options) {
    options = options || {}; var id = integer(options.brandId, 'brandId'), before = brand(api,id);
    if (!before || Number(before.promotionID) !== context(api).promotionId) throw new Error('Brand not found at the player promotion');
    var affected = { contracts:Number(domain.get(api, 'SELECT COUNT(*) AS count FROM contracts WHERE promotionID=? AND brand=?',[context(api).promotionId,id]).count), events:Number(domain.get(api, 'SELECT COUNT(*) AS count FROM events WHERE promotionID=? AND brand=?',[context(api).promotionId,id]).count) };
    return mutate(api, options, 'brand.delete', before, { brandId:id,operation:'delete',affected:affected }, function () { execute(api, "UPDATE contracts SET brand='' WHERE promotionID=? AND brand=?", [context(api).promotionId,id]); execute(api, "UPDATE events SET brand='' WHERE promotionID=? AND brand=?", [context(api).promotionId,id]); execute(api, 'DELETE FROM brands WHERE brandID=?',[id]); }, function () { return brand(api,id); }, function (after) { return after ? 'brand still exists' : null; }, ['Deleting clears this brand from '+affected.contracts+' contracts and '+affected.events+' events.']);
}
function setCommentary(api, options) {
    options = options || {}; var ids = Array.isArray(options.contractIds) ? options.contractIds.map(function (id) { activeContract(api, id); return Number(id); }) : [];
    if (ids.length > 4 || new Set(ids).size !== ids.length) throw new Error('contractIds must contain up to four unique active contracts');
    if ((options.brandId == null) === (options.eventId == null)) throw new Error('Provide exactly one of brandId or eventId');
    var table, key, id, before;
    if (options.brandId != null) { table = 'brands'; key = 'brandID'; id = integer(options.brandId, 'brandId'); before = brand(api, id); }
    else { table = 'events'; key = 'eventID'; id = integer(options.eventId, 'eventId'); before = domain.get(api, 'SELECT eventID,promotionID,announcer1,announcer2,announcer3,announcer4 FROM events WHERE eventID=?', [id]); }
    if (!before || Number(before.promotionID) !== context(api).promotionId) throw new Error('The brand or event does not belong to the player promotion');
    var values = [ids[0] || '', ids[1] || '', ids[2] || '', ids[3] || '', id];
    return mutate(api, options, 'commentary.setDefaults', before, { contractIds: ids }, function () { execute(api, 'UPDATE ' + table + ' SET announcer1=?,announcer2=?,announcer3=?,announcer4=? WHERE ' + key + '=?', values); }, function () { return domain.get(api, 'SELECT * FROM ' + table + ' WHERE ' + key + '=?', [id]); }, function (after) { return ids.some(function (value, index) { return Number(after['announcer' + (index + 1)]) !== value; }) ? 'commentary defaults were not persisted' : null; });
}

function listChampionships(api) { return { game: domain.state(api), championships: domain.query(api, 'SELECT titleID,name,type,prestige,inactive,genderLimits,minWeightLimit,weightLimits,defendable,brand,currentChampion,currentChampion2,currentChampion3,defences FROM titles WHERE promotionID=? ORDER BY inactive,name', [context(api).promotionId]) }; }
function saveChampionship(api, options) {
    options = options || {}; var id = options.titleId == null ? null : integer(options.titleId, 'titleId');
    var before = id ? domain.get(api, 'SELECT * FROM titles WHERE titleID=?', [id]) : null;
    if (id && (!before || Number(before.promotionID) !== context(api).promotionId)) throw new Error('Championship not found at the player promotion');
    var proposed = { name: String(options.name == null && before ? before.name : options.name || '').trim(), type: String(options.type == null && before ? before.type : options.type || 'Singles'), prestige: Number(options.prestige == null && before ? before.prestige : options.prestige || 1), genderLimits: String(options.genderLimits == null && before ? before.genderLimits : options.genderLimits || 'None'), minWeightLimit: Number(options.minWeightLimit == null && before ? before.minWeightLimit : options.minWeightLimit || 0), weightLimits: Number(options.weightLimits == null && before ? before.weightLimits : options.weightLimits || 0), defendable: options.defendable == null && before ? Number(before.defendable) : options.defendable === false ? 0 : 1, brand: options.brand == null && before ? before.brand : options.brand || '' };
    if (!proposed.name) throw new Error('name is required');
    return mutate(api, options, id ? 'championship.update' : 'championship.create', before, proposed, function () { if (id) execute(api, 'UPDATE titles SET name=?,type=?,prestige=?,genderLimits=?,minWeightLimit=?,weightLimits=?,defendable=?,brand=? WHERE titleID=?', [proposed.name,proposed.type,proposed.prestige,proposed.genderLimits,proposed.minWeightLimit,proposed.weightLimits,proposed.defendable,proposed.brand,id]); else { execute(api, "INSERT INTO titles (promotionID,name,prestige,created,type,titleImage,genderLimits,minWeightLimit,weightLimits,won,defendable,brand,inactive) VALUES (?,?,?,?,?,'',?,?,?,0,?,?,0)", [context(api).promotionId,proposed.name,proposed.prestige,context(api).currentDate,proposed.type,proposed.genderLimits,proposed.minWeightLimit,proposed.weightLimits,proposed.defendable,proposed.brand]); id = Number(domain.get(api, 'SELECT last_insert_rowid() AS id').id); } }, function () { return domain.get(api, 'SELECT * FROM titles WHERE titleID=?', [id]); }, function (after) { return !after || after.name !== proposed.name ? 'championship was not persisted' : null; });
}
function setChampionshipActive(api, options) {
    options = options || {}; var id = integer(options.titleId, 'titleId'), before = domain.get(api, 'SELECT * FROM titles WHERE titleID=?', [id]);
    if (!before || Number(before.promotionID) !== context(api).promotionId) throw new Error('Championship not found at the player promotion');
    var inactive = options.active === false ? 1 : 0;
    return mutate(api, options, 'championship.setActive', before, { active: !inactive }, function () { execute(api, 'UPDATE titles SET inactive=? WHERE titleID=?', [inactive,id]); }, function () { return domain.get(api, 'SELECT * FROM titles WHERE titleID=?', [id]); }, function (after) { return Number(after.inactive) !== inactive ? 'championship status was not persisted' : null; });
}
function awardChampionship(api,options) {
    options=options||{};var id=integer(options.titleId,'titleId'),before=domain.get(api,'SELECT * FROM titles WHERE titleID=?',[id]),ctx=context(api);if(!before||Number(before.promotionID)!==ctx.promotionId)throw new Error('Championship not found at the player promotion');if(Number(before.inactive))throw new Error('Championship is retired');
    var contractIds=(options.contractIds||[]).map(function(contractId){return Number(activeContract(api,contractId).contractID);});if(!contractIds.length||contractIds.length>3||new Set(contractIds).size!==contractIds.length)throw new Error('contractIds must contain 1-3 unique active contracts');
    var expected=/trio|six.?man/i.test(before.type||'')?3:/tag/i.test(before.type||'')?2:1;if(contractIds.length!==expected)throw new Error((before.name||'Championship')+' requires '+expected+' champion'+(expected===1?'':'s'));
    var workerIds=contractIds.map(function(contractId){return Number(activeContract(api,contractId).workerID);});var proposed={titleId:id,contractIds:contractIds,workerIds:workerIds};
    return mutate(api,options,'championship.award',before,proposed,function(){var args={titleId:id,workerId:workerIds[0]};if(workerIds[1])args.workerId2=workerIds[1];if(workerIds[2])args.workerId3=workerIds[2];var result=requireAction(api,'awardTitle').call(api.actions,args);if(!result||result.success===false)throw new Error(result&&result.error||'PWS rejected the title change');return result;},function(){return domain.get(api,'SELECT * FROM titles WHERE titleID=?',[id]);},function(after){var actual=[after.currentChampion,after.currentChampion2,after.currentChampion3].filter(function(x){return Number(x)>0;}).map(Number);return JSON.stringify(actual)!==JSON.stringify(workerIds)?'new champions were not persisted':null;});
}

function eventRow(api,id) { var row=domain.get(api,'SELECT eventID,eventName,promotionID,prestige,recurrenceType,recurrenceMonth,recurrenceWeek,brand,eventLength,importance,inactive,preferredVenue,announcer1,announcer2,announcer3,announcer4 FROM events WHERE eventID=?',[id]);if(row){row.active=!domain.boolean(row.inactive);row.importanceName=domain.importanceName(row.importance);}return row; }
function listEvents(api,options) { options=options||{};var ctx=context(api),rows=domain.query(api,'SELECT e.eventID,COUNT(ei.instanceID) AS showCount,SUM(CASE WHEN ei.complete=0 AND ei.isCancelled=0 THEN 1 ELSE 0 END) AS unfinishedShows FROM events e LEFT JOIN eventinstance ei ON ei.eventID=e.eventID WHERE e.promotionID=? GROUP BY e.eventID ORDER BY e.inactive,e.eventName',[ctx.promotionId]);return{game:domain.state(api),events:rows.map(function(row){return Object.assign(eventRow(api,Number(row.eventID)),{showCount:Number(row.showCount||0),unfinishedShows:Number(row.unfinishedShows||0)});})}; }
function updateEvent(api,options) {
    options=options||{};var id=integer(options.eventId,'eventId'),before=eventRow(api,id),ctx=context(api);if(!before||Number(before.promotionID)!==ctx.promotionId)throw new Error('Event not found at the player promotion');var changes=options.changes||{},allowed=['name','prestige','recurrenceType','recurrenceMonth','recurrenceWeek','brand','eventLength','importance','preferredVenue'];if(Object.keys(changes).some(function(k){return allowed.indexOf(k)===-1;}))throw new Error('changes contains an unsupported event field');if(!Object.keys(changes).length)throw new Error('changes must contain at least one field');
    function supplied(key){return Object.prototype.hasOwnProperty.call(changes,key);}
    var importanceMap={'House Show':0,'Unimportant':1,'Normal':2,'High':3,'Huge':4};
    var proposed={name:supplied('name')?String(changes.name).trim():before.eventName,prestige:supplied('prestige')?Number(changes.prestige):Number(before.prestige),recurrenceType:supplied('recurrenceType')?String(changes.recurrenceType):before.recurrenceType,recurrenceMonth:supplied('recurrenceMonth')?changes.recurrenceMonth:before.recurrenceMonth,recurrenceWeek:supplied('recurrenceWeek')?changes.recurrenceWeek:before.recurrenceWeek,brand:supplied('brand')?changes.brand:before.brand,eventLength:supplied('eventLength')?Number(changes.eventLength):Number(before.eventLength),importance:supplied('importance')?(typeof changes.importance==='string'?importanceMap[changes.importance]:Number(changes.importance)):Number(before.importance),preferredVenue:supplied('preferredVenue')?changes.preferredVenue:before.preferredVenue};
    if(!proposed.name)throw new Error('name is required');if(!Number.isInteger(proposed.prestige)||proposed.prestige<1||proposed.prestige>100)throw new Error('prestige must be 1-100');if(['Weekly','Monthly','Annual','OneOff'].indexOf(proposed.recurrenceType)===-1)throw new Error('recurrenceType is invalid');if(proposed.recurrenceType==='Annual'&&(!Number.isInteger(Number(proposed.recurrenceMonth))||Number(proposed.recurrenceMonth)<1||Number(proposed.recurrenceMonth)>12))throw new Error('Annual events require recurrenceMonth 1-12');if(proposed.recurrenceType==='Monthly'&&(!Number.isInteger(Number(proposed.recurrenceWeek))||Number(proposed.recurrenceWeek)<1||Number(proposed.recurrenceWeek)>5))throw new Error('Monthly events require recurrenceWeek 1-5');if(!Number.isInteger(proposed.eventLength)||proposed.eventLength<1||proposed.eventLength>600)throw new Error('eventLength must be 1-600');if(!Number.isInteger(proposed.importance)||proposed.importance<0||proposed.importance>4)throw new Error('importance is invalid');
    if(proposed.brand!=null&&proposed.brand!==''){var b=brand(api,integer(proposed.brand,'brand'));if(!b||Number(b.promotionID)!==ctx.promotionId)throw new Error('Brand not found at the player promotion');}if(proposed.preferredVenue!=null&&proposed.preferredVenue!==''&&!domain.get(api,'SELECT venueID FROM venues WHERE venueID=?',[integer(proposed.preferredVenue,'preferredVenue')]))throw new Error('Preferred venue not found');
    return mutate(api,options,'event.update',before,proposed,function(){execute(api,'UPDATE events SET eventName=?,prestige=?,recurrenceType=?,recurrenceMonth=?,recurrenceWeek=?,brand=?,eventLength=?,importance=?,preferredVenue=? WHERE eventID=?',[proposed.name,proposed.prestige,proposed.recurrenceType,proposed.recurrenceMonth,proposed.recurrenceWeek,proposed.brand,proposed.eventLength,proposed.importance,proposed.preferredVenue,id]);},function(){return eventRow(api,id);},function(after){return !after||after.eventName!==proposed.name||Number(after.prestige)!==proposed.prestige||after.recurrenceType!==proposed.recurrenceType||Number(after.eventLength)!==proposed.eventLength||Number(after.importance)!==proposed.importance?'event changes were not persisted':null;});
}
function rescheduleShow(api,options) {
    options=options||{};var id=integer(options.showId,'showId'),ctx=context(api),before=domain.get(api,'SELECT ei.*,e.promotionID FROM eventinstance ei JOIN events e ON e.eventID=ei.eventID WHERE ei.instanceID=?',[id]);if(!before||Number(before.promotionID)!==ctx.promotionId)throw new Error('Show not found at the player promotion');if(Number(before.complete)||Number(before.isCancelled))throw new Error('Only unfinished, non-cancelled shows can be rescheduled');var date=String(options.airDate||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!domain.addDays(date,0))throw new Error('airDate must be a valid YYYY-MM-DD date');if(date<ctx.currentDate)throw new Error('airDate cannot be before the current game date');
    return mutate(api,options,'show.reschedule',before,{showId:id,airDate:date},function(){execute(api,'UPDATE eventinstance SET airDate=? WHERE instanceID=?',[date,id]);},function(){return domain.get(api,'SELECT * FROM eventinstance WHERE instanceID=?',[id]);},function(after){return !after||after.airDate!==date?'show date was not persisted':null;},['Changing a show date can change worker availability and network scheduling. Run pws_audit_show again afterward.']);
}

function networks(api) { var ctx = context(api); return { game: domain.state(api), networks: domain.query(api, 'SELECT n.* FROM networks n ORDER BY n.name'), deals: domain.query(api, 'SELECT nd.*,n.name AS networkName FROM networkDeals nd JOIN networks n ON n.networkID=nd.networkID WHERE nd.promotionID=? ORDER BY nd.status DESC,nd.expirationDate', [ctx.promotionId]), availability: domain.query(api, 'SELECT na.* FROM networkAvailability na'), guidance: 'Use reach, requirements, costs, income, timeslot, and live status to compare options. Final acceptance and renegotiation stay in PWS because the game calculates hidden deal terms.' }; }
function cancelNetworkDeal(api, options) {
    options = options || {}; var id = integer(options.dealId, 'dealId'), before = domain.get(api, 'SELECT nd.*,n.name AS networkName FROM networkDeals nd JOIN networks n ON n.networkID=nd.networkID WHERE nd.dealID=?', [id]);
    if (!before || Number(before.promotionID) !== context(api).promotionId) throw new Error('Network deal not found at the player promotion');
    return mutate(api, options, 'networkDeal.cancel', before, { dealId: id, status: 0 }, function () { execute(api, 'UPDATE networkDeals SET status=0 WHERE dealID=?', [id]); execute(api, 'INSERT INTO news (date,newsType,promotionInvolved1,eventID,additionalInfo) VALUES (?,?,?,?,?)', [context(api).currentDate,'Network Expire',before.promotionID,before.eventID,before.networkID]); }, function () { return domain.get(api, 'SELECT * FROM networkDeals WHERE dealID=?', [id]); }, function (after) { return Number(after.status) !== 0 ? 'network deal is still active' : null; }, ['Cancellation can affect reach and income. New deals must still be negotiated in PWS so the game can calculate its hidden terms.']);
}

module.exports = { assignBrand: assignBrand, auditShow: auditShow, awardChampionship: awardChampionship, cancelNetworkDeal: cancelNetworkDeal, createStoryline: createStoryline, createTagTeam: createTagTeam, deleteBrand: deleteBrand, dissolveTagTeam: dissolveTagTeam, listBrands: listBrands, listChampionships: listChampionships, listEvents: listEvents, listTagTeams: listTagTeams, networks: networks, registerTagTeam: registerTagTeam, rescheduleShow: rescheduleShow, saveBrand: saveBrand, saveChampionship: saveChampionship, setChampionshipActive: setChampionshipActive, setCommentary: setCommentary, signWorker: signWorker, updateContract: updateContract, updateEvent: updateEvent, updateStoryline: updateStoryline, updateTagTeam: updateTagTeam, workerUsage: workerUsage };

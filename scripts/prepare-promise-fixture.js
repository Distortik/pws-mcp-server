#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');

function isPwsRunning() {
    if (process.platform !== 'win32') return false;
    try {
        var output = childProcess.execFileSync('tasklist.exe', ['/FI', 'IMAGENAME eq ProWrestlingSim.exe', '/NH'], { encoding: 'utf8', windowsHide: true });
        return /ProWrestlingSim\.exe/i.test(output);
    } catch (_) {
        return false;
    }
}

function usage() {
    return 'Usage: node scripts/prepare-promise-fixture.js <source-save.db> <new-fixture.db> [--contract-id <id>]';
}

function parseArgs(argv) {
    if (argv.length < 2) throw new Error(usage());
    var options = { source: path.resolve(argv[0]), output: path.resolve(argv[1]), contractId: null };
    for (var index = 2; index < argv.length; index += 1) {
        if (argv[index] !== '--contract-id' || index + 1 >= argv.length) throw new Error('Unknown or incomplete argument: ' + argv[index] + '\n' + usage());
        var contractId = Number(argv[index += 1]);
        if (!Number.isInteger(contractId) || contractId < 1) throw new Error('--contract-id must be a positive integer');
        options.contractId = contractId;
    }
    return options;
}

function addDays(value, days) {
    var date = new Date(String(value) + 'T00:00:00Z');
    if (Number.isNaN(date.getTime())) throw new Error('The copied save has an invalid current date: ' + value);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function prepare(options) {
    if (isPwsRunning()) throw new Error('Close Pro Wrestling Sim before copying or preparing a save fixture.');
    if (options.source === options.output) throw new Error('The fixture output must be a new file; the source save is never modified.');
    if (!fs.existsSync(options.source)) throw new Error('Source save not found: ' + options.source);
    if (fs.existsSync(options.output)) throw new Error('Refusing to overwrite an existing fixture: ' + options.output);
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.copyFileSync(options.source, options.output, fs.constants.COPYFILE_EXCL);

    var database;
    try {
        var DatabaseSync = require('node:sqlite').DatabaseSync;
        database = new DatabaseSync(options.output);
        var save = database.prepare('SELECT saveName,saveCurrentDate,saveUserPromotion FROM saveinfo LIMIT 1').get();
        if (!save) throw new Error('The copied database is not a recognizable PWS save');
        var contract = options.contractId == null ? database.prepare([
            'SELECT c.contractID,c.workerID,COALESCE(NULLIF(c.contractName,\'\'),w.name) AS name',
            'FROM contracts c JOIN workers w ON w.workerID=c.workerID',
            'WHERE c.promotionID=? AND c.finalised=1 AND c.expired=0 AND c.contractStarted=1',
            "AND w.type='Wrestler' ORDER BY c.contractID LIMIT 1"
        ].join(' ')).get(save.saveUserPromotion) : database.prepare([
            'SELECT c.contractID,c.workerID,COALESCE(NULLIF(c.contractName,\'\'),w.name) AS name',
            'FROM contracts c JOIN workers w ON w.workerID=c.workerID',
            'WHERE c.contractID=? AND c.promotionID=? AND c.finalised=1 AND c.expired=0 AND c.contractStarted=1'
        ].join(' ')).get(options.contractId, save.saveUserPromotion);
        if (!contract) throw new Error('No matching active player-company contract was found');

        var promiseId = Number(database.prepare('SELECT COALESCE(MAX(promiseID),0)+1 AS id FROM promises').get().id);
        var emailId = Number(database.prepare('SELECT COALESCE(MAX(emailID),0)+1 AS id FROM emails').get().id);
        var expiryDate = addDays(save.saveCurrentDate, 60);
        database.exec('BEGIN IMMEDIATE');
        try {
            database.prepare([
                'INSERT INTO promises (promiseID,worker1,worker2,title,type,startDate,expiryDate,agreed,promotionID,expired,passed)',
                "VALUES (?,?,'','','Title Match',?,?,0,?,0,0)"
            ].join(' ')).run(promiseId, contract.contractID, save.saveCurrentDate, expiryDate, save.saveUserPromotion);
            database.prepare([
                'INSERT INTO emails (emailID,type,workerInvolved1,workerInvolved2,date,archived,isRead,hasDecision,decisionIsHandled,promiseID)',
                "VALUES (?,'Promise',?,'',?,0,0,1,0,?)"
            ].join(' ')).run(emailId, contract.workerID, save.saveCurrentDate, promiseId);
            var verified = database.prepare([
                'SELECT p.promiseID,p.worker1,p.type,p.agreed,p.expired,p.passed,e.emailID,e.workerInvolved1,e.hasDecision,e.decisionIsHandled',
                'FROM promises p JOIN emails e ON e.promiseID=p.promiseID WHERE p.promiseID=?'
            ].join(' ')).get(promiseId);
            if (!verified || Number(verified.worker1) !== Number(contract.contractID) || Number(verified.workerInvolved1) !== Number(contract.workerID) || Number(verified.hasDecision) !== 1 || Number(verified.decisionIsHandled) !== 0) throw new Error('Fixture verification failed');
            database.exec('COMMIT');
        } catch (error) {
            try { database.exec('ROLLBACK'); } catch (_) { /* preserve the original error */ }
            throw error;
        }
        database.close();
        database = null;
        return {
            output: options.output, sourceSave: save.saveName, gameDate: save.saveCurrentDate,
            promotionId: Number(save.saveUserPromotion), contractId: Number(contract.contractID), workerId: Number(contract.workerID),
            workerName: contract.name, promiseId: promiseId, emailId: emailId, expiryDate: expiryDate
        };
    } catch (error) {
        if (database) {
            try { database.close(); } catch (_) { /* continue cleanup */ }
        }
        try { fs.unlinkSync(options.output); } catch (_) { /* no incomplete output remains when possible */ }
        throw error;
    }
}

if (require.main === module) {
    try {
        var result = prepare(parseArgs(process.argv.slice(2)));
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        process.stdout.write('Load only the new fixture save, then test pws_respond_to_promise with promiseId ' + result.promiseId + '.\n');
    } catch (error) {
        process.stderr.write(error.message + '\n');
        process.exitCode = 1;
    }
}

module.exports = { addDays: addDays, isPwsRunning: isPwsRunning, parseArgs: parseArgs, prepare: prepare, usage: usage };

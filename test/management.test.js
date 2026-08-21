'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var domain = require('../src/domain');
var management = require('../src/management');

test('tag-team detail is scoped to the player promotion', function () {
    var original = domain.context;
    domain.context = function () { return { promotionId: 2 }; };
    var observedParameters;
    var api = {
        database: {
            get: function (sql, parameters) {
                assert.match(sql, /pt\.promotionID=\?/);
                observedParameters = parameters;
                return { tagID: 7, worker1: 10, worker2: 20, tagExperience: 25, defaultName: 'Team', tagStatus: 1, promotionID: 2, tagName: 'Team', promotionStatus: 1 };
            }
        }
    };
    try {
        var preview = management.updateTagTeam(api, { tagId: 7, name: 'Team', preview: true });
        assert.equal(preview.status, 'preview');
        assert.equal(preview.proposed.status, 1);
        assert.deepEqual(observedParameters, [7, 2]);
    } finally { domain.context = original; }
});

test('registers an established team using its existing name and experience in preview', function () {
    var original = domain.context;
    domain.context = function () { return { promotionId: 2 }; };
    var api = { database: {
        get: function (sql, parameters) {
            if (/FROM tagteams t WHERE/.test(sql)) return { tagID: 9, worker1: 101, worker2: 102, defaultName: 'Established Name', tagExperience: 73, tagStatus: 1 };
            if (/FROM promotiontagteams/.test(sql)) return null;
            if (/FROM contracts c JOIN workers/.test(sql)) return Number(parameters[0]) === 101 ? { contractID: 11, contractName: 'One', name: 'Worker One' } : { contractID: 12, contractName: 'Two', name: 'Worker Two' };
            throw new Error('Unexpected SQL: ' + sql);
        }
    } };
    try {
        var preview = management.registerTagTeam(api, { tagId: 9, preview: true });
        assert.equal(preview.status, 'preview');
        assert.equal(preview.proposed.name, 'Established Name');
        assert.equal(preview.proposed.preservedExperience, 73);
    } finally { domain.context = original; }
});

GW.define('TestSuite', 'object', {
	name: '[test name]',

	tests: [],

	fail: function(err) {
		this.defer.reject(err);
	},

	done: function() {
		this.defer.resolve();
	},

	assert: function(expr, failMsg) {
		if (!expr) {
			this.fail(failMsg);
		}
	},

	print: function(v) {
		print(Duktape.enc('jx', v, null, '    '));
	},

	assertEq: function(a, b, failMsg) {
		this.assert(a == b, failMsg + ': ' + Duktape.enc('jx', a) + ' != ' + Duktape.enc('jx', b));
	},

	assertEqApprox: function(a, b, room, failMsg) {
		this.assertRange(Math.abs(a - b), 0, room / 2, failMsg);
	},

	assertRange: function(a, min, max, failMsg) {
		this.assert(a >= min && a <= max, failMsg + ': ' + Duktape.enc('jx', a) + ' not between ' + min + ' and ' + max);
	},

	assertNeq: function(a, b, failMsg) {
		this.assert(a != b, failMsg + ': ' + Duktape.enc('jx', a) + ' == ' + Duktape.enc('jx', b));
	},

	run: function(name) {
		var me = this;
		var suiteName = this.name;
		var tests = _(this.tests).chain().filter(function(t) {
			return !t.disabled && (!name || t.name == name);
		}).map(function(t) {
			return function() {
				return Defer.defer(function(defer) {
					me.defer = defer;
					t.run.call(me);
				}).then(function() {
					print('  ' + suiteName + ': ' + t.name + ' [OK]');
				}, function(msg) {
					print('  ' + suiteName + ': ' + t.name + ' [FAIL] ' + msg);
				});
			};
		}).value();

		return Defer.chain(tests);
	}
});

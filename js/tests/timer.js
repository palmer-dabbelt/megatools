GW.define('TestSuite.Timer', 'TestSuite', {
	name: 'timer',

	getTests: function() {
		return [{
			name: 'timer',
			run: function(test) {
				return Defer.defer(function(defer) {
					var start = (new Date).getTime();

					C.timeout(function() {
						var end = (new Date).getTime();
						var dur = end - start;

						test.assertEqApprox(dur, 500, 10, 'dur != real time');
						defer.resolve();
					}, 500);
				});
			}
		}];
	}
});

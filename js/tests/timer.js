GW.define('TestSuite.Timer', 'TestSuite', {
	name: 'timer',

	tests: [{
		name: 'timer',
		run: function() {
			var start = (new Date).getTime();
			C.timeout(_.bind(function() {
				var end = (new Date).getTime();
                                var dur = end - start;

				this.assertEqApprox(dur, 500, 10, 'dur != real time');
				this.done();
			}, this), 500);
		}
	}]
});

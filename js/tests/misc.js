GW.define('TestSuite.MISC', 'TestSuite', {
	name: 'misc',

	tests: [{
		name: 'find',
		run: function() {
			var arr = [{
				a: 'qwe',
				b: 1
			}, {
				a: 'qwe2',
				b: 3
			}, {
				a: 'qwe3',
				b: 5
			}];

			var v = _(arr).find(function(v) {
				return v.a == 'qwe2';
			});

			this.assertEq(v.b, 3, 'a != b');
			this.done();
		}
	}]
});

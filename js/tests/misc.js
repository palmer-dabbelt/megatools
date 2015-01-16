GW.define('TestSuite.MISC', 'TestSuite', {
	name: 'misc',

	getTests: function() {
		return [{
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
			}
		}, {
			name: 'exec-fail',
			run: function(test) {
				return Utils.exec(['./megatools', 'lss']).then(function() {
					return Defer.rejected('nofail', 'megatools lss should fail');
				}, function() {
					return Defer.resolved();
				});
			}
		}, {
			name: 'exec-ok',
			run: function(test) {
				return Utils.exec(['ls']);
			}
		}];
	}
});

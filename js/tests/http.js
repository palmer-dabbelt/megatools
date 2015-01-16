GW.define('TestSuite.Http', 'TestSuite', {
	name: 'http',

	getTests: function() {
		return [{
			name: 'get',
			run: function() {
				var test = this;
				var i;

				function request() {
					return Defer.defer(function(defer) {
						C.http({
							url: 'http://localhost/data',
							onload: function(data) {
								defer.resolve(data);
							},
							onerror: function(code, msg) {
								defer.msg = msg;
								defer.reject(code, msg);
							}
						});
					});
				}

				var requests = [];
				for (i = 0; i <= 200; i++) {
					requests.push(request());
				}

				return Defer.when(requests).done(function(resolved, rejected) {
					if (rejected.length > 0) {
						var msg = _.map(rejected, function(d) {
							return d.msg;
						}).join('\n');

						return Defer.rejected('fail', msg);
					}
				});
			}
		}];
	}
});

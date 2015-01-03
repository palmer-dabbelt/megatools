GW.define('TestSuite.Http', 'TestSuite', {
	name: 'http',

	tests: [{
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
						onerror: function(err) {
							defer.reject(err);
						}
					});

					//print(Duktape.enc('jx', req, null, '  '));
				});
			}

			var requests = [];
			for (i = 0; i <= 200; i++) {
				requests.push(request());
			}

			Defer.when(requests).done(function(resolved, rejected) {
				if (rejected.length == 0) {
					test.done();
				} else {
					var msg = _.map(rejected, function(d) {
						return d.getArgs()[0].message;
					}).join('\n');

					test.fail('Request failed with ' + msg);
				}
			});
		}
	}]
});

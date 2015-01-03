GW.define('TestSuite.Session', 'TestSuite', {
	name: 'session',

	tests: [{
		name: 'open',
		run: function() {
			var test = this;
			var session = new Session();

			session.setCredentials('mt4@megous.com', 'qwe');

			Defer.chain([

				function() {
					return session.open().done(function() {
						Log.debug('session.open.done:', session.data);
					});
				},

				function() {
					return session.fs.load().done(function() {
						session.save();
					});
				}

			]).then(function() {
				test.done();
			}, function(code, message) {
				test.fail(code + ': ' + message);
			});
		}
	}]
});

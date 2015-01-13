GW.define('Tool.FIXUP', 'tool', {
	order: 520,
	name: 'fixup',
	description: 'Fix issues with the remote filesystem',
	usages: [
		'[--dry-run|-n]'
	],

	getOptsSpecCustom: function() {
		return [{
			longName: 'dry-run',
			shortName: 'n',
			help: 'Don\'t perform any changes, just print them.'
		}].concat(this.loginOpts);
	},

	run: function(defer) {
		var opts = this.opts;

		Defer.chain([
			function() {
				return this.getSession();
			},

			function(session) {
				var fs = session.getFilesystem();
				var issues = fs.getIssues();

				if (opts['dry-run']) {
					_(issues.unreadableNodes).each(function(n) {
						Log.msg('Remove unreadable node ' + n.h);
					});

					return Defer.resolved();
				}

				session.api.startBatch();

				_(issues.unreadableNodes).each(function(n) {
					session.api.callSingle({
						a: 'd',
						n: n.h
					}).then(function() {
						Log.verbose('Removed unreadable node ' + n.h);
					}, function(code, message) {
						Log.error('Can\'t remove unreadable node ' + n.h);
					});
				});

				return session.api.sendBatch();
			}
		], this).then(function() {
			defer.resolve();
		}, function(code, msg) {
			Log.error(msg);
			defer.reject(1);
		}, this);
	}
});

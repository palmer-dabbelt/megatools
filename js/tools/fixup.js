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

	run: function() {
		var opts = this.opts;

		return this.getSession().then(function(session) {
			var fs = session.getFilesystem();
			var issues = fs.getIssues();

			if (opts['dry-run']) {
				_(issues.unreadableNodes).each(function(n) {
					Log.msg('Remove unreadable node ' + n.h);
				});

				return Defer.resolved();
			}

			var batch = session.api.createBatch();

			_(issues.unreadableNodes).each(function(n) {
				batch.deleteNode(n.h).then(function() {
					Log.verbose('Removed unreadable node ' + n.h);
				}, function(code, message) {
					Log.error('Can\'t remove unreadable node ' + n.h);
				});
			});

			return batch.send();
		});
	}
});

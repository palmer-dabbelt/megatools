GW.define('Tool.RMDIR', 'tool', {
	order: 710,
	name: 'rmdir',
	description: 'Remove empty remote directories',
	allowArgs: true,
	usages: [
		'[<remotepaths>...]'
	],

	examples: [{
		title: 'Remove empty directories:',
		commands: [
			'$ megatools rmdir /Root/dir'
		]
	}],

	getOptsSpecCustom: function() {
		return [{
			argHelp: '<remotepaths>',
			help: [
				'One or more remote directories to remove.'
			]

		}].concat(this.loginOpts);
	},

	run: function(defer) {
		var opts = this.opts;

		if (this.args.length == 0) {
			Log.error("You must specify <remotepaths> to remove.");
			defer.reject(10);
			return;
		}

		Defer.chain([
			function() {
				return this.getSession();
			},

			function(session) {
				var fs = session.getFilesystem();
				var nodes = fs.getNodesForPathsRemoveAncestors(this.args);

				session.api.startBatch();

				_.each(nodes, function(n) {
					var path = n.path + (n.type == NodeType.FILE ? '' : '/');
					var op;

					if (n.type == NodeType.FOLDER) {
						if (fs.getChildren(n).length != 0) {
							Log.error("Can't remove non-empty folder " + path + ": use rm -r");
							return;
						}
					} else if (n.type == NodeType.FILE) {
						Log.error("Can't remove " + path + ": not a folder");
					} else {
						Log.error("Can't remove " + path + ": special folders can't be removed");
					}

					session.api.callSingle({
						a: "d",
						n: n.handle
					}).then(function() {
						Log.verbose('Removed ' + path);
					}, function(code, message) {
						Log.error("Can't remove " + path + ": " + message);
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

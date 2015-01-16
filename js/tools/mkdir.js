GW.define('Tool.MKDIR', 'tool', {
	order: 740,
	name: 'mkdir',
	description: 'Create remote folders',
	allowArgs: true,
	usages: [
		'[-p] [<remotepaths>...]'
	],

	examples: [{
		title: 'Create new remote folder:',
		commands: [
			'$ megatools mkdir /Root/dir'
		]
	}],

	getOptsSpecCustom: function() {
		return [{
			longName: 'parents',
			shortName: 'p',
			help: 'Create parent folders if necessary.'
		}, {
			argHelp: '<remotepaths>',
			help: [
				'One or more remote folders to create.'
			]

		}].concat(this.loginOpts);
	},

	run: function() {
		var opts = this.opts;
		var args = this.args;

		if (args.length == 0) {
			return Defer.rejected('args', "You must specify <remotepaths> to create.");
		}

		return this.getSession().done(function(session) {
			var fs = session.getFilesystem();
			var batch = session.api.createBatch();

			_(args).each(function(path) {
				var node = fs.getNodeByPath(path);
				if (node) {
					if (node.type == NodeType.FILE) {
						Log.error('File exists at ' + path);
					} else {
						Log.warning('Folder already exists at ' + path);
					}

					return;
				}

				var parentPath = C.path_up(path);
				var name = C.path_name(path);
				var parentNode = fs.getNodeByPath(parentPath);
				if (!parentNode) {
					Log.warning("Parent folder doesn't exists at " + parentPath);
					return;
				} else if (parentNode.type == NodeType.FILE) {
					Log.error('File exists at ' + parentPath);
					return;
				}

				if (!name) {
					Log.error('Invalid path ' + path);
					return;
				}

				batch.createFolder(name, parentNode.handle, session.data.mk).then(function() {
					Log.verbose('Created ' + path);
				}, function(code, message) {
					Log.error("Can't create folder " + path + ": " + message);
				});
			});

			return batch.send();
		});
	}
});

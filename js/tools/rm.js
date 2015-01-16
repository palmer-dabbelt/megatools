GW.define('Tool.RM', 'tool', {
	order: 700,
	name: 'rm',
	description: 'Remove remote files and directories',
	allowArgs: true,
	usages: [
		'[-r|--recursive] [-d|--dir] [-R|--rubbish] <remotepaths>...'
	],

	examples: [{
		title: 'Move files and directories to trash:',
		commands: [
			'$ megatools rm -r -R /Root/dir'
		]
	}, {
		title: 'Move only files to trash:',
		commands: [
			'$ megatools rm -R /Root/file1 /Root/file2'
		]
	}, {
		title: 'Remove files directly:',
		commands: [
			'$ megatools rm -r /Root'
		]
	}],

	getOptsSpecCustom: function() {
		return [{ 
			longName: "recursive",
			shortName: 'r', 
			help: "Remove directories and files recursively."
		}, { 
			longName: "dir",   
			shortName: 'd',   
			help: "Remove empty directories. (implied with -r)"
		}, {
			longName: "rubbish",
			shortName: 'R',
			help: "Instead of removing files move them to the /Rubbish folder"
		}, {
			argHelp: '<remotepaths>',
			help: [
				'One or more remote filesystem paths to remove. If a path points to a directory, it will be removed only if `-r` is specified or it is empty and `-d` is specified.'
			]

		}].concat(this.loginOpts);
	},

	run: function(defer) {
		var opts = this.opts;
		var args = this.args;

		if (args.length == 0) {
			return Defer.rejected('args', "You must specify <remotepaths> to remove.");
		}

		return this.getSession().then(function(session) {
			var fs = session.getFilesystem();
			var nodes;

			if (opts.recursive) {
				nodes = fs.getNodesForPathsRemoveChildren(args);
			} else {
				nodes = fs.getNodesForPathsRemoveAncestors(args);
			}

			var rubbishNode = fs.getRubbish();
			if (!rubbishNode && opts.rubbish) {
				return Defer.rejected('no_rubbish', '/Rubbish folder not found');
			}

			function isNodeType(type, invert) {
				return function(n) {
					return invert ? n.type != type : n.type == type;
				};
			}

			var removeRoot = _(nodes).find(isNodeType(NodeType.ROOT));
			var removeRubbish = _(nodes).find(isNodeType(NodeType.RUBBISH));

			// if user is removing /Rubbish recursively, we don't need to move anything to it,
			// but we need to select its contents
			if (removeRubbish && opts.recursive) {
				opts.rubbish = false;
				nodes = _(nodes).filter(isNodeType(NodeType.RUBBISH, true));
				nodes = nodes.concat(fs.getChildren(removeRubbish));
			}

			// if user is removing /Root recursively we need to select its contents instead
			if (removeRoot && opts.recursive) {
				nodes = _(nodes).filter(isNodeType(NodeType.ROOT, true));
				nodes = nodes.concat(fs.getChildren(removeRoot));
			}

			var batch = session.api.createBatch();

			_.each(nodes, function(n) {
				var path = n.path + (n.type == NodeType.FILE ? '' : '/');
				var op;

				if (n.type == NodeType.FILE) {
					null;
				} else if (n.type == NodeType.FOLDER) {
					if (!opts.recursive && opts.dir && fs.getChildren(n).length != 0) {
						Log.error("Can't remove non-empty folder " + path + ": use -r option");
						return;
					} else if (!opts.recursive) {
						Log.error("Can't remove folder " + path + ": use -r or -d options");
						return;
					}
				} else {
					if (n.type == NodeType.ROOT || n.type == NodeType.RUBBISH) {
						Log.error("Can't remove " + path + ": can only be emptied with -r option");
					} else {
						Log.error("Can't remove " + path + ": special folders can't be removed");
					}
					return;
				}

				if (opts.rubbish) {
					batch.moveNode(n.handle, rubbishNode.handle).then(function() {
						Log.verbose('Moved to /Rubbish ' + path);
					}, function(code, message) {
						Log.error("Can't remove " + path + ": " + message);
					});
				} else {
					batch.deleteNode(n.handle).then(function() {
						Log.verbose('Removed ' + path);
					}, function(code, message) {
						Log.error("Can't remove " + path + ": " + message);
					});
				}
			});

			return batch.send();
		});
	}
});

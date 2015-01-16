GW.define('Tool.LS', 'tool', {
	order: 500,
	name: 'ls',
	description: 'Lists remote files and folders',
	allowArgs: true,
	usages: [
		'[-h] [-l] [-R] [<remotepaths>...]'
	],

	examples: [{
		title: 'List all files:',
		commands: [
			'$ megatools ls',
			'/',
			'/Contacts/',
			'/Inbox/',
			'/Root/',
			'/Root/README',
			'/Root/bigfile',
			'/Rubbish/'
		]
	}, {
		title: 'List all files in the /Root with details',
		commands: [
			'$ megatools ls -l /Root',
			'',
			'3RsS2QwJ                2             - 2013-01-22 12:31:06 /Root',
			'2FFSiaKZ    Xz2tWWB5Dmo 0          2686 2013-04-15 08:33:47 /Root/README',
			'udtDgR7I    Xz2tWWB5Dmo 0    4405067776 2013-04-10 19:16:02 /Root/bigfile'
		]
	}],

	getOptsSpecCustom: function() {
		return [{ 
			longName: "recursive",
			shortName: 'R', 
			help: "List directories recursively. This is the default if no paths are specified."
		}, { 
			longName: "long",   
			shortName: 'l',   
			help: "List additional information about listed filesystem nodes. Node handle, owner, node type, file size, and the last modification date."
		}, {
			longName: "human",
			shortName: 'h',
			help: "Display file sizes in a human readable format."
		}, {
			argHelp: '<remotepaths>',
			help: [
				'One or more remote filesystem paths to list. If path points to a directory, contents of the directory and the directory itself is listed.',
				'If path points to a file, the file itself is listed.',
				'If ommited, the entire remote filesystem is listed recursively.'
			]
		}].concat(this.loginOpts, this.exportedFolderOpts);
	},

	run: function() {
		var opts = this.opts;
		var args = this.args;

		return this.getSession().then(function(session) {
			var nodes, fs = session.getFilesystem();

			if (args.length > 0) {
				nodes = fs.getChildNodesForPaths(args, opts.recursive);
			} else {
				nodes = fs.getNodes();
			}

			nodes = _.sortBy(nodes, function(n) {
				return n.path;
			});

			_.each(nodes, function(n) {
				var path = n.path + (n.type == NodeType.FILE ? '' : '/');

				if (n.type == NodeType.TOP) {
					return;
				}

				if (opts['long']) {
					Log.msg([
						Utils.pad(n.handle || '', 11), 
						Utils.pad(n.user || '', 11), 
						Utils.align(n.type, 1), 
						Utils.align(n.type == NodeType.FILE ? (opts.human ? Utils.humanSize(n.size) : n.size) : '', 11), 
						Utils.align(n.mtime ? C.date('%F %T', n.mtime) : '', 19), 
						path
					].join(' '));
				} else {
					Log.msg(path);
				}
			});
		});
	}
});

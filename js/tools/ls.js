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
			'$ megals',
			'/',
			'/Contacts/',
			'/Inbox/',
			'/Root/',
			'/Root/README',
			'/Root/bigfile',
			'/Rubbish/'
		]
	}, {
		title: 'List all files in the /Root, recursively and with details',
		commands: [
			'$ megals -l /Root',
			'',
			'3RsS2QwJ                2             - 2013-01-22 12:31:06 /Root',
			'2FFSiaKZ    Xz2tWWB5Dmo 0          2686 2013-04-15 08:33:47 /Root/README',
			'udtDgR7I    Xz2tWWB5Dmo 0    4405067776 2013-04-10 19:16:02 /Root/bigfile'
		]
	}, {
		title: 'List all files in the /Root, recursively and with details, show only file names:',
		commands: [
			'$ megals -ln /Root',
			'',
			'2FFSiaKZ    Xz2tWWB5Dmo 0          2686 2013-04-15 08:33:47 README',
			'udtDgR7I    Xz2tWWB5Dmo 0    4405067776 2013-04-10 19:16:02 bigfile'
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
				'One or more remote filesystem paths to list. If path points to a directory, contents of the directory and the directory itself is listed. When `--names` is given, only the contents of the directory is listed.',
				'If path points to a file, the file itself is listed.',
				'If ommited, the entire remote filesystem is listed recursively.'
			]

		}].concat(this.loginOpts, this.exportedFolderOpts);
	},

	run: function(defer) {
		var opts = this.opts;

		Defer.chain([
			function() {
				return this.getSession();
			},

			function(session) {
				var nodes, fs = session.getFilesystem();

				if (this.args.length > 0) {
					nodes = fs.getChildNodesForPaths(this.args, opts.recursive);
				} else {
					nodes = fs.getNodes();
				}

				nodes = _.sortBy(nodes, function(n) {
					return n.path;
				});


				var space = Utils.getSpace(40);
				function align(s, len) {
					s = String(s);

					return space.substr(0, len - s.length) + s;
				}
				function pad(s, len) {
					s = String(s);

					return s + space.substr(0, len - s.length);
				}

				_.each(nodes, function(n) {
					var path = n.path + (n.type == NodeType.FILE ? '' : '/');

					if (opts['long']) {
						print([
							pad(n.handle || '', 11), 
							pad(n.user || '', 11), 
							align(n.type, 1), 
							align(n.type == NodeType.FILE ? (opts.human ? Utils.humanSize(n.size) : n.size) : '', 11), 
							align(n.mtime ? C.date('%F %T', n.mtime) : '', 19), 
							path
						].join(' '));
					} else {
						print(path);
					}
				});

				return Defer.resolved();
			}
		], this).then(function() {
			defer.resolve();
		}, function(code, msg) {
			Log.error(msg);
			defer.reject(1);
		}, this);
	}
});

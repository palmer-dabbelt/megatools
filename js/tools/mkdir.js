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

	run: function(defer) {
		var opts = this.opts;

		if (this.args.length == 0) {
			Log.error("You must specify <remotepaths> to create.");
			defer.reject(10);
			return;
		}

		Defer.chain([
			function() {
				return this.getSession();
			},

			function(session) {
				var fs = session.getFilesystem();

				session.api.startBatch();

				_(this.args).each(function(path) {
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

					var nk = C.aes_key_random();
					var attrs = C.alignbuf(Duktape.Buffer('MEGA' + JSON.stringify({
						n: name
					})), 16, true);
					var eattrs = C.aes_enc_cbc(nk, attrs);

					session.api.callSingle({
						a: "p",
						t: parentNode.handle,
						n: [{
							"h": "xxxxxxxx",
							"t": NodeType.FOLDER,
							"a": C.ub64enc(eattrs),
							"k": C.ub64enc(C.aes_enc(session.data.mk, nk))
						}]
					}).then(function() {
						Log.verbose('Created ' + path);
					}, function(code, message) {
						Log.error("Can't create folder " + path + ": " + message);
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

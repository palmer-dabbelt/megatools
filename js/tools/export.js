GW.define('Tool.EXPORT', 'tool', {
	order: 510,
	name: 'export',
	description: 'Export public download links for files and folders',
	allowArgs: true,
	usages: [
		'[--cancel|-c] <remotepaths>...'
	],

	detail: [
		'Prepare public download links for files and folders.'
	],

	examples: [{
		title: 'Export file and a directory:',
		commands: [
			'$ megatools export /Root/somedir /Root/somefile',
			'/Root/somedir https://mega.co.nz/#F!wgQwlL4R!p-3H1EO4UzJ2I_-DRPlMdw',
			'/Root/somefile https://mega.co.nz/#!MlxgWRIC!L9Knh8vNyrJc5zo_I_FMulUL7kibApSHQBNp2C3hbbs'
		]
	}],

	getOptsSpecCustom: function() {
		return [{
			longName: 'cancel',
			shortName: 'c',
			help: 'Cancel export of `<remotepaths>...`'
		}, {
			argHelp: '<remotepaths>',
			help: 'One or more remote filesystem paths to export.'
		}].concat(this.loginOpts);
	},

	run: function(defer) {
		var opts = this.opts;

		if (this.args.length == 0) {
			Log.error('Please provide paths for files and folders to export');
			defer.reject(10);
			return;
		}

		Defer.chain([
			function() {
				return this.getSession();
			},

			function(session) {
				var fs = session.getFilesystem();
				var api = session.api;
				var mk = session.data.mk;

				api.startBatch();

				var nodes = _(this.args).chain().map(function(path) {
					var n = fs.getNodeByPath(path);
					if (!n) {
						Log.warning('Path not found:', path);
						return null;
					} else if (n.type != NodeType.FILE && n.type != NodeType.FOLDER) {
						Log.warning('Path is not exportable:', path);
						return null;
					}

					return n;
				}).compact().value();
				
				if (opts.cancel) {
					_(nodes).each(function(n) {
						if (n.type == NodeType.FILE || n.type == NodeType.FOLDER) {
							api.callSingle({
								a: 'l',
								n: n.handle,
								d: 1
							}).fail(function(code, msg) {
								Log.warning('Can\'t cancel export of file ' + n.path + ':', msg);
							});
						}
					});
				} else {
					_(nodes).each(function(n) {
						if (n.type == NodeType.FILE) {
							api.callSingle({
								a: 'l',
								n: n.handle
							}).then(function(link) {
								Log.msg(n.path, 'https://mega.co.nz/#!' + link + '!' + C.ub64enc(n.key_full));
							}, function(code, msg) {
								Log.warning('Can\'t export file ' + n.path + ':', msg);
							});
						} else if (n.type == NodeType.FOLDER) {
							// retrieve list of all nodes in this folder including this folder
							var content = fs.getSelfAndChildrenDeep(n);

							var sk = fs.getShareKey(n.handle), newShareKey = false;
							if (!sk) {
								sk = C.aes_key_random();
								newShareKey = true;
							}

							var hb = Duktape.Buffer(n.handle);
							var req = {
								a: "s",
								n: n.handle,
								s: [{
									u: "EXP",
									r: 0
								}],
								ok: C.ub64enc(C.aes_enc(mk, sk)),
								ha: C.ub64enc(C.aes_enc(mk, C.joinbuf(hb, hb)))
							};

							if (newShareKey) {
								var nodeKeys = [];
								_.each(content, function(contentNode, idx) {
									if (contentNode.key_full || contentNode.key) {
										nodeKeys.push(0, idx, C.ub64enc(C.aes_enc(sk, contentNode.key_full || contentNode.key)));
									}
								});

								req.cr = [[n.handle], _.pluck(content, 'handle'), nodeKeys];
							}

							api.callSingle(req).fail(function(code, msg) {
								Log.warning('Can\'t set share on folder ' + n.path + ':', msg);
							});

							api.callSingle({
								a: 'l',
								n: n.handle
							}).then(function(link) {
								Log.msg(n.path, 'https://mega.co.nz/#F!' + link + '!' + C.ub64enc(sk));
							}, function(code, msg) {
								Log.warning('Can\'t export folder ' + n.path + ':', msg);
							});
						}
					});
				}

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

GW.define('Tool.IMPORT', 'tool', {
	order: 520,
	name: 'import',
	description: 'Import publicly exported files to a remote folder',
	allowArgs: true,
	usages: [
		'[-t <remotefolder>] <links>...'
	],

	examples: [{
		title: 'Import file to a remote folder:',
		commands: [
			"$ megatools import 'https://mega.co.nz/#!MlxgWRIC!L9Knh8vNyrJc5zo_I_FMulUL7kibApSHQBNp2C3hbbs'"
		]
	}],

	getOptsSpecCustom: function() {
		return [{
			longName: 'target-folder',
			shortName: 't',
			argHelp: '<folder>',
			arg: 'string',
			help: 'Import files to a specified folder. Default is `/Root`.'
		}, {
			argHelp: '<links>',
			help: [
				'One or more exported file or folder links.'
			]
		}].concat(this.loginOpts);
	},

	run: function(defer) {
		var opts = this.opts;
		var args = this.args;
		var t = opts['target-folder'];

		if (args.length == 0) {
			Log.error("You must specify <links> to import.");
			defer.reject(10);
			return;
		}

		if (!t) {
			t = '/Root';
		}

		// extract external file info (key, handle, attrs)
		var fileLinks = [];
		var folderLinks = [];

		_(args).each(function(link) {
			var data = {}, m;

			data.link = link;
			
			m = link.match(/^https:\/\/mega\.co\.nz\/#!([a-z0-9]{8})!([a-z0-9_-]{43})$/i);
			if (m) {
				data.type = NodeType.FILE;
				data.handle = m[1];
				data.key_full = C.ub64dec(m[2]);
				data.key = C.file_node_key_unpack(data.key_full);
				fileLinks.push(data);
				return;
			}

			m = link.match(/^https:\/\/mega\.co\.nz\/#F!([a-z0-9]{8})!([a-z0-9_-]{22})$/i);
			if (m) {
				data.type = NodeType.FOLDER;
				data.handle = m[1];
				data.key = C.ub64dec(m[2]);
				folderLinks.push(data);
				return;
			}

			Log.warning('Invalid link ' + link);
		});

		if (fileLinks.concat(folderLinks).length == 0) {
			Log.error("No valid links found.");
			defer.reject(10);
			return;
		}

		Defer.chain([
			function() {
				return this.getSession();
			},

			function(session) {
				var nodes, fs = session.getFilesystem();
				var targetFolderNode = fs.getNodeByPath(t);
				if (!targetFolderNode) {
					return Defer.rejected('target_missing', 'Target folder not found ' + t);
				}

				if (targetFolderNode.type == NodeType.FILE) {
					return Defer.rejected('target_bad', 'Target path is not a folder ' + t);
				}

				if (targetFolderNode.type == NodeType.TOP || targetFolderNode.type == NodeType.NETWORK) {
					return Defer.rejected('target_bad', 'Target folder is not writable ' + t);
				}


				session.api.startBatch();

				// get info from the server
				_.each(fileLinks, function(link) {
					session.api.callSingle({
						a: 'g',
						p: link.handle
					}).then(function(res) {
						var a = MegaAPI.decNodeAttrs(link.key, res.at);
						if (!a) {
							Log.error('Can\'t get link info (invalid key): ' + link.link);
							return;
						}

						link.a = res.at;
						link.name = a.n;
						link.size = res.s;
						link.valid = true;
					}, function(code, message) {
						Log.error('Can\'t get link info: ' + link.link);
					});
				});

				var calls = [session.api.sendBatch()];

				_.each(folderLinks, function(link) {
					var s = new Session();
					s.openExportedFolder(link.handle, link.key);
					var call = s.getFilesystem().load().done(function() {
						link.nodes = s.getFilesystem().getNodes();
						var topFolderNode = _(link.nodes).find(function(n) {
							return n.parent == '*TOP*';
						});
						link.name = topFolderNode ? topFolderNode.path : '?';
						link.valid = true;
					}, function(code, message) {
						Log.error('Can\'t get folder link info: ' + link.link);
					});

					calls.push(call);
				});

				function isValid(link) {
					return link.valid;
				}

				var defer = Defer.defer();

				Defer.when(calls).then(function() {
					// now we have all the information, perform import
					session.api.startBatch();

					_(fileLinks).chain().filter(isValid).each(function(link) {
						session.api.callSingle({
							a: "p",
							t: targetFolderNode.handle,
							n: [{
								ph: link.handle,
								t: 0,
								a: link.a,
								k: C.ub64enc(C.aes_enc(session.data.mk, link.key_full))
							}]
						}).then(function() {
							Log.verbose('Imported ' + link.name + ' (' + link.link + ')');
						}, function(code, message) {
							Log.error('Import failed for ' + link.link + ': ' + message);
						});
					});

					_(folderLinks).chain().filter(isValid).each(function(link) {
						session.api.callSingle({
							a: "p",
							t: targetFolderNode.handle,
							n: _(link.nodes).chain().filter(function(node) {
								return node.type == NodeType.FILE || node.type == NodeType.FOLDER;
							}).map(function(node) {
								return {
									h: node.handle,
									t: node.type,
									a: node.a,
									k: C.ub64enc(C.aes_enc(session.data.mk, node.key_full)),
									p: node.parent != '*TOP*' ? node.parent : undefined
								};
							}).value()
						}).then(function() {
							Log.verbose('Imported ' + link.name + ' (' + link.link + ')');
						}, function(code, message) {
							Log.error('Import failed for ' + link.link + ': ' + message);
						});
					});

					session.api.sendBatch().done(defer.resolve, defer.reject);
				}, defer.reject);

				return defer;
			}
		], this).then(function() {
			defer.resolve();
		}, function(code, msg) {
			Log.error(msg);
			defer.reject(1);
		}, this);
	}
});

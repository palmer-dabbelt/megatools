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
		title: 'Export files and folders:',
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
			help: 'Cancel export of `<remotepaths>`'
		}, {
			argHelp: '<remotepaths>',
			help: 'One or more remote filesystem paths to export.'
		}].concat(this.loginOpts);
	},

	run: function() {
		var opts = this.opts;
		var args = this.args;

		if (args.length == 0) {
			return Defer.rejected('args', 'Please provide paths for files and folders to export');
		}

		return this.getSession().done(function(session) {
			var fs = session.getFilesystem();
			var api = session.api;
			var mk = session.data.mk;
			var batch = api.createBatch();
			var nodes = _(args).chain().map(function(path) {
				var n = fs.getNodeByPath(path);
				if (!n) {
					Log.warning('Path not found ' + path + ', skipping');
					return null;
				} else if (n.type != NodeType.FILE && n.type != NodeType.FOLDER) {
					Log.warning('Path is not exportable ' + path + ', skipping');
					return null;
				}

				return n;
			}).compact().value();

			if (nodes.length == 0) {
				return Defer.rejected('nop', 'Nothing to do!');
			}
			
			if (opts.cancel) {
				_(nodes).each(function(n) {
					if (n.type == NodeType.FILE || n.type == NodeType.FOLDER) {
						batch.removePublicLink(n.handle).fail(function(code, msg) {
							Log.warning('Can\'t cancel export of ' + n.path + ':', msg);
						});
					}
				});
			} else {
				_(nodes).each(function(n) {
					if (n.type == NodeType.FILE) {
						batch.getPublicLink(n.handle).done(function(link) {
							Log.msg(n.path, 'https://mega.co.nz/#!' + link + '!' + C.ub64enc(n.key_full));
						}).fail(function(code, msg) {
							Log.error('Can\'t export file ' + n.path + ':', msg);
						});
					} else if (n.type == NodeType.FOLDER) {
						// retrieve list of all nodes in this folder including this folder
						var sk = fs.getShareKey(n.handle);
						if (!sk) {
							sk = C.aes_key_random();
						}

						var content = _(fs.getSelfAndChildrenDeep(n)).chain().filter(function(n) {
							return n.key_full || n.key;
						}).map(function(n) {
							return {
								key: n.key_full || n.key,
								handle: n.handle
							};
						}).value();

						batch.shareFolder(n.handle, content, mk, sk).fail(function(code, msg) {
							Log.error('Can\'t set share on folder ' + n.path + ':', msg);
						});

						batch.getPublicLink(n.handle).done(function(link) {
							Log.msg(n.path, 'https://mega.co.nz/#F!' + link + '!' + C.ub64enc(sk));
						}).fail(function(code, msg) {
							Log.error('Can\'t export folder ' + n.path + ':', msg);
						});
					}
				});
			}

			return batch.send();
		});
	}
});

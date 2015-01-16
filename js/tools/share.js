GW.define('Tool.SHARE', 'tool', {
	order: 800,
	name: 'share',
	description: 'Share remote folders with your contacts',
	allowArgs: true,
	usages: [
		'--access ro|rw|full|none --user <email> <remotefolders>...'
	],

	examples: [{
		title: 'List currently shared folders',
		commands: [
			'$ megatools share'
		]
	}, {
		title: 'Share existing remote folder with some@user.net:',
		commands: [
			'$ megatools share --share-with some@user.net --access rw /Root/shared-dir'
		]
	}, {
		title: 'Stop sharing remote folder with some@user.net:',
		commands: [
			'$ megatools share --share-with some@user.net --access none /Root/shared-dir'
		]
	}],

	getOptsSpecCustom: function() {
		return [{
			longName: 'share-with',
			shortName: 'w',
			argHelp: '<email>',
			arg: 'string',
			help: 'E-mail address of the mega.co.nz user you want to share `<remotefolders>` with.'
		}, {
			longName: 'access',
			shortName: 'a',
			argHelp: '<access>',
			arg: 'string',
			help: 'Access level to set up. One of: `none`, `ro`, `rw`, or `full`. Meaning no access, read-only, read-write, or full access.'
		}, {
			argHelp: '<remotefolders>',
			help: [
				'One or more remote folders to setup sharing on.'
			]

		}].concat(this.loginOpts);
	},

	run: function() {
		var accessR;
		var opts = this.opts;
		var args = this.args;

		if (args.length == 0) {
			if (opts.access || opts['share-with']) {
				return Defer.rejected('args', 'Please provide paths for folders to share');
			}
		} else {
			if (!opts.access) {
				return Defer.rejected('args', 'Please provide --access option');
			}

			if (!opts['share-with']) {
				return Defer.rejected('args', 'Please provide --share-with option');
			}

			switch (opts.access) {
				case 'none':  accessR = null; break;
				case 'ro':    accessR = 0; break;
				case 'rw':    accessR = 1; break;
				case 'full':  accessR = 2; break;
				default:
					return Defer.rejected('args', 'Invalid --access option, must be one of: none, ro, rw, or full');
			}
		}

		return this.getSession().done(function(session) {
			var fs = session.getFilesystem();
			var api = session.api;

			// list only
			if (args.length == 0) {
				_(fs.getShares()).each(function(s) {
					if (s.node) {
						var user = s.contact && s.contact.email ? s.contact.email : s.user;
						if (s.user == 'EXP') {
							user = 'Exported folder';
						}

						var access = 'None';
						if (s.access === 0) {
							access = 'Read-only';
						} else if (s.access === 1) {
							access = 'Read-write';
						} else if (s.access === 2) {
							access = 'Full access';
						}

						Log.msg([
							Utils.pad(user, 30), 
							Utils.pad(access || '', 15), 
							Utils.align(s.mtime ? C.date('%F %T', s.mtime) : '', 19), 
							s.node.path
						].join(' '));
					}
				});

				return Defer.resolved();
			}

			return api.getPubkForAccount(opts['share-with']).done(function(res) {
				// user.pubk, user.u
				var batch = api.createBatch();
				var nodes = _(args).chain().map(function(path) {
					var n = fs.getNodeByPath(path);
					if (!n) {
						Log.error('Path not found:', path);
						return null;
					} else if (n.type != NodeType.FOLDER) {
						Log.error('Path is not shareable:', path);
						return null;
					}

					return n;
				}).compact().value();

				_(nodes).each(function(n) {
					if (accessR === null) {
						batch.unshareFolder(n.handle, res.uh).fail(function(code, msg) {
							Log.warning('Can\'t remove sharing on folder ' + n.path + ':', msg);
						});

						return;
					}

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

					batch.shareFolder(n.handle, content, session.data.mk, sk, accessR, res.uh, res.pubk).fail(function(code, msg) {
						Log.error('Can\'t set share on folder ' + n.path + ':', msg);
					});
				});

				return batch.send();
			});
		});
	}
});

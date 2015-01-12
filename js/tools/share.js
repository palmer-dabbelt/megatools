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
			help: 'Access level to set up. One of: none, ro, rw, or full. Meaning no access, read-only, read-write, or full access.'
		}, {
			argHelp: '<remotefolders>',
			help: [
				'One or more remote folders to setup sharing on.'
			]

		}].concat(this.loginOpts);
	},

	run: function(defer) {
		var accessR, session, fs, api, mk;
		var opts = this.opts;

		if (this.args.length == 0) {
			if (opts.access || opts['share-with']) {
				Log.error('Please provide paths for folders to share');
				defer.reject(10);
				return;
			}
		} else {
			if (!opts.access) {
				Log.error('Please provide --access option');
				defer.reject(10);
				return;
			}

			if (!opts['share-with']) {
				Log.error('Please provide --share-with option');
				defer.reject(10);
				return;
			}

			switch (opts.access) {
				case 'none':  accessR = null; break;
				case 'ro':    accessR = 0; break;
				case 'rw':    accessR = 1; break;
				case 'full':  accessR = 2; break;
				default:
					Log.error('Invalid --access option, must be one of: none, ro, rw, or full');
					defer.reject(10);
					return;
			}
		}

		Defer.chain([
			function() {
				return this.getSession();
			},

			function(s) {
				session = s;
				fs = session.getFilesystem();
				api = session.api;
				mk = session.data.mk;

				// list only
				if (this.args.length == 0) {
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

							print([
								Utils.pad(user, 30), 
								Utils.pad(access || '', 15), 
								Utils.align(s.mtime ? C.date('%F %T', s.mtime) : '', 19), 
								s.node.path
							].join(' '));
						}
					});

					return Defer.resolved();
				}

				return Defer.defer(function(defer) {
					api.callSingle({
						a: 'uk',
						u: opts['share-with']
					}).done(function(user) {
						// user.pubk, user.u

						api.startBatch();

						var nodes = _(this.args).chain().map(function(path) {
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
							Log.msg(n);
							if (accessR === null) {
								api.callSingle({
									a: "s",
									n: n.handle,
									s: [{
										u: user.u,
										r: null
									}],
									ha: null
								}).fail(function(code, msg) {
									Log.warning('Can\'t remove sharing on folder ' + n.path + ':', msg);
								});

								return;
							}

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
									u: user.u,
									r: accessR,
									k: C.ub64enc(C.rsa_encrypt(user.pubk, sk))
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
						});

						session.api.sendBatch().then(defer.resolve, defer.reject);
					}, this);
				}, this);
			}
		], this).then(function() {
			defer.resolve();
		}, function(code, msg) {
			Log.error(msg);
			defer.reject(1);
		}, this);
	}
});

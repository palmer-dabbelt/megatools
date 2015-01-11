GW.define('Tool.CONTACTS', 'tool', {
	order: 810,
	name: 'contacts',
	description: 'Manage your contacts list',
	allowArgs: true,
	usages: [
		'[-a | -r] [<emails>...]'
	],

	examples: [{
		title: 'List contacts',
		commands: [
			'$ megatools contacts'
		]
	}, {
		title: 'Add contacts',
		commands: [
			'$ megatools contacts --add somebody@email.net somebodyelse@email.net'
		]
	}, {
		title: 'Remove contacts',
		commands: [
			'$ megatools contacts --remove somebody@email.net somebodyelse@email.net'
		]
	}],

	getOptsSpecCustom: function() {
		return [{
			longName: 'add',
			shortName: 'a',
			help: 'Add new contacts.'
		}, {
			longName: 'remove',
			shortName: 'r',
			help: 'Remove existing contacts.'
		}, {
			argHelp: '<emails>',
			help: [
				'One or more email addresses of contacts to add or remove.'
			]

		}].concat(this.loginOpts);
	},

	run: function(defer) {
		var opts = this.opts;

		if (opts.add || opts.remove) {
			if (this.args.length == 0) {
				Log.error("You must specify contacts <emails>.");
				defer.reject(10);
				return;
			}
		} else {
			if (this.args.length > 0) {
				Log.error("You must not specify <emails>.");
				defer.reject(10);
				return;
			}
		}

		if (opts.add && opts.remove) {
			Log.error("You can't both add and remove contacts at the same time.");
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

				function isSelf(email) {
					return session.data.user.email == email;
				}

				if (opts.add) {
					_(this.args).each(function(email) {
						if (isSelf(email)) {
							Log.error("Can't add self " + email);
							return;
						}

						var c = fs.getContactByEmail(email);
						if (c) {
							Log.warning("Contact is already in the list " + email);
							return;
						}

						session.api.callSingle({
							a: 'ur',
							u: email,
							l: '1'
						}).then(function() {
							Log.verbose('Contact added: ' + email);
						}, function(code, message) {
							Log.error("Can't add contact " + email + ": " + message);
						});
					});
				} else if (opts.remove) {
					_(this.args).each(function(email) {
						if (isSelf(email)) {
							Log.error("Can't remove self " + email);
							return;
						}

						var c = fs.getContactByEmail(email);
						if (!c) {
							Log.warning("Contact is not in the list " + email);
							return;
						}

						session.api.callSingle({
							a: 'ur',
							u: c.handle,
							l: '0'
						}).then(function() {
							Log.verbose('Contact removed: ' + email);
						}, function(code, message) {
							Log.error("Can't remove contact " + email + ": " + message);
						});
					});
				} else {
					_(fs.getContacts()).each(function(c) {
						print(c.email);
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


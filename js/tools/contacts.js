GW.define('Tool.CONTACTS', 'tool', {
	order: 810,
	name: 'contacts',
	description: 'Manage the contacts list',
	allowArgs: true,
	usages: [
		'',
		'[-a|--add] <emails>...',
		'[-r|--remove] <emails>...'
	],

	detail: [
		"If you want to access files from some other account, you need to add that account's email address to your contacts list using the `--add` option. Shared folders will become accessible under `/Contacts/[email]`.",
		"If you no longer wish to access those files, you can remove account from the contacts list using the `--remove` option. You can reverse your decision later by re-adding the contact.",
		"If the user is not registered mega.co.nz will send him an invitation email."
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
			help: 'Add contacts to the contacts list.'
		}, {
			longName: 'remove',
			shortName: 'r',
			help: 'Remove existing contacts from the contacts list.'
		}, {
			argHelp: '<emails>',
			help: [
				'One or more email addresses of contacts to add, remove.'
			]
		}].concat(this.loginOpts);
	},

	run: function() {
		var opts = this.opts;
		var args = this.args;

		if (opts.add || opts.remove) {
			if (args.length == 0) {
				return Defer.rejected('args', "You must specify contacts <emails>.");
			}
		} else {
			if (args.length > 0) {
				return Defer.rejected('args', "You must not specify <emails>.");
			}
		}
		
		if (opts.add && opts.remove) {
			return Defer.rejected('args', "You can't combine --add and --remove options.");
		}

		return this.getSession().done(function(session) {
			var fs = session.getFilesystem();

			function isSelf(email) {
				return session.data.user.email == email;
			}

			var contactsMap = {};

			args = _(args).filter(function(email) {
				if (!C.email_valid(email)) {
					Log.warning("Not a valid email address " + email + ", skipping");
					return false;
				}

				if (isSelf(email)) {
					Log.warning("Can't add self " + email + ', skipping');
					return false;
				}

				var c = fs.getContactByEmail(email);
				if (opts.add && c) {
					Log.warning("Contact is already in the list " + email + ", skipping");
					return false;
				}

				if (opts.remove && !c) {
					Log.warning("Contact is not in the list " + email + ", skipping");
					return false;
				}

				contactsMap[email] = c;

				return true;
			});

			var batch = session.api.createBatch();

			if (opts.add) {
				if (args.length == 0) {
					return Defer.rejected('nop', "Nothing left to do!");
				}

				_(args).each(function(email) {
					batch.addContact(email).then(function() {
						Log.verbose('Contact added: ' + email);
					}, function(code, message) {
						Log.error("Can't add contact " + email + ": " + message);
					});
				});
			} else if (opts.remove) {
				if (args.length == 0) {
					return Defer.rejected('nop', "Nothing left to do!");
				}

				_(args).each(function(email) {
					batch.removeContact(contactsMap[email].handle).then(function() {
						Log.verbose('Contact removed: ' + email);
					}, function(code, message) {
						Log.error("Can't remove contact " + email + ": " + message);
					});
				});
			} else {
				_(fs.getContacts()).each(function(c) {
					Log.msg(c.email);
				});
			}

			return batch.send();
		});
	}
});

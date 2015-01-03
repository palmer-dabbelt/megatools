GW.define('Tool.PASSWD', 'tool', {
	order: 110,
	name: 'passwd',
	description: 'Change password for a mega.co.nz account',
	usages: [
		'[--new-password <password> | --new-password-file <path>]'
	],

	detail: [
		'This tool is very DANGEROUS. Don\'t use it unless you know what you\'re doing and how to recover your account!'
	],

	getOptsSpecCustom: function() {
		return [{
			longName: "new-password",
			arg: 'string',
			help: "New password. This option is less secure than the --password-file option.",
			argHelp: "PASSWORD" 
		}, {
			longName: "new-password-file",
			arg: 'string',
			help: "Path to a file containing the new password. All characters including leading and trailing spaces up to the first new line are used.",
			argHelp: "PATH"
		}, {
			longName: 'save-config',
			shortName: 's',
			help: 'Save login credentials to a configuration file specified by --config.'
		}, {
			longName: 'config',
			arg: 'string',
			argHelp: 'PATH',
			help: 'Configuration file path. Default is ' + MEGA_RC_FILENAME + ' in the current directory.'
		}].concat(this.loginOpts);
	},

	run: function(defer) {
		var opts = this.opts;
		var me = this;
		var password;

		function saveConfig(username, password) {
			if (opts['save-config']) {
				var path = opts.config || MEGA_RC_FILENAME;

				if (!C.file_write(path, Duktape.Buffer(Duktape.enc('jx', {username: username, password: password}, null, '  ')))) {
					Log.warning('Failed to save config file at ' + path);
				}
			}
		}

		function doAction() {
			var data = {};
			Defer.chain([
				function() {
					return me.getSession();
				},

				function(session) {
                                        data.session = session;

					var newPk = C.aes_key_from_password(password);
					var email = session.data.user.email;

					if (session.password == password) {
						return Defer.rejected('same_pass', 'This password is already set!');
					}

					return session.api.updateUser({
						currk: session.data.user.k,
						k: C.ub64enc(C.aes_enc(newPk, session.data.mk)),
						uh: email ? C.make_username_hash(newPk, email) : undefined
					});
				},

				function() {
					return Defer.defer(function(defer) {
						data.session.api.getUser().done(function(res) {
							var pk = C.aes_key_from_password(password);
							var nk = C.aes_enc(pk, data.session.data.mk);
							if (res.user.k != C.ub64enc(nk)) {
								defer.reject('change_failed', 'Password change failed.');
							} else {
								defer.resolve();
							}
						}, defer.reject);
					});
				}
			]).then(function() {
				data.session.close();
				saveConfig(data.session.username, password);
				defer.resolve();
			}, function(code, msg) {
				Log.error(msg);
				defer.reject(1);
			});
		}

		function askPassword(cb) {
			C.prompt('Enter new password: ', function(password1) {
				C.prompt('Repeat password: ', function(password2) {
					if (password1 != password2) {
						Log.error('Passwords don\'t match');
						defer.reject(10);
					} else {
						password = password1;
						cb();
					}
				}, true);
			}, true);
		}

		if (opts['new-password'] && opts['new-password-file']) {
			Log.error('Conflicting options --new-password and --new-password-file');
			defer.reject(10);
			return;
		}

		if (opts['new-password']) {
			password = opts['new-password'];
		} else if (opts['new-password-file']) {
			var data = C.file_read(opts['new-password-file']);
			if (data) {
				password = data.toString().split(/\r?\n/)[0];
			} else {
				Log.error('Can\'t read password file at ' + opts['new-password-file']);
				defer.reject(10);
				return;
			}
		}

		if (_.isUndefined(password)) {
			if (opts.batch) {
				Log.error('Please specify --new-password or --new-password-file');
				defer.reject(10);
				return;
			} else {
				askPassword(function() {
					doAction();
				});
			}
		} else {
			doAction();
		}
	}
});

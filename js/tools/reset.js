GW.define('Tool.RESET', 'tool', {
	order: 120,
	name: 'reset',
	description: 'Reset existing Mega.co.nz user account.',
	usages: [
               '--email <email> [--save-config] [--config <path>]'
	],

	detail: [
		'You can reset existing user account to initial state if you forgot your password. This is interactive process.'
	],

	getOptsSpecCustom: function() {
		return [{
			longName: "email",
			arg: 'string',
			help: "Email serves as your new account username, that you'll be using to sign in.",
			argHelp: "EMAIL" 
		}, {
			longName: 'save-config',
			shortName: 's',
			help: 'Save login credentials to a configuration file specified by --config.'
		}, {
			longName: 'config',
			arg: 'string',
			argHelp: 'PATH',
			help: 'Configuration file path. Default is ' + MEGA_RC_FILENAME + ' in the current directory.'
		}];
	},

	examples: [{
		title: 'Reset user account',
		commands: [
			'$ megatools reset --save-config --email your@email.com',
			'$ megatools info'
		]
	}],

	run: function(defer) {
		// check options
		var opts = this.opts;
		var password;
		var api = new MegaAPI();

		if (!opts.email) {
			Log.error('You must provide account email!');
			defer.reject(10);
			return;
		}

		if (opts.batch) {
			Log.error('Batch mode is not supported by reset!');
			defer.reject(10);
			return;
		}

		function saveConfig() {
			if (opts['save-config']) {
				var path = opts.config || MEGA_RC_FILENAME;

				if (!C.file_write(path, Duktape.Buffer(Duktape.enc('jx', {username: opts.email, password: password}, null, '  ')))) {
					Log.warning('Failed to save config file at ' + path);
				}
			}
		}

		function askPassword(cb) {
			C.prompt('Enter password: ', function(password1) {
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

		askPassword(function() {
			Defer.chain([
				function() {
					return api.requestUserReset(opts.email);
				},

				function(res) {
					return Defer.defer(function(defer) {
						promptResetLink('Check email account ' + opts.email + ' and enter the reset link (or type abort): ', function(code) {
							if (code) {
								api.completeUserReset(code, opts.email, password).then(defer.resolve, defer.reject);
							} else {
								defer.reject('no_code', 'Aborted by the user!');
							}
						});
					});
				}
			]).then(function() {
				Log.verbose('Reset was successful!');
				saveConfig();
				defer.resolve();
			}, function(code, msg) {
				Log.error(msg);
				defer.reject(1);
			});
		});

		function extractResteCode(v) {
			var m = String(v).match(/https:\/\/mega\.co\.nz\/#recover([A-Za-z0-9_-]{20,150})/);
			if (m) {
				return m[1];
			}
		}

		function promptResetLink(msg, done) {
			C.prompt(msg, function(v) {
				var code = extractResteCode(v);
				if (code) {
					done(code);
				} else if (String(v).match(/abort/)) {
					done();
				} else {
					promptResetLink(msg, done);
				}
			});
		}
	}
});


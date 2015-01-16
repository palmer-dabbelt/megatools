GW.define('Tool.RESET', 'tool', {
	order: 120,
	name: 'reset',
	description: 'Reset existing mega.co.nz user account',
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

	run: function() {
		// check options
		var opts = this.opts;
		var password;
		var api = new MegaAPI();

		if (!opts.email) {
			return Defer.rejected('args', 'You must provide account email!');
		}

		if (opts.batch) {
			return Defer.rejected('args', 'Batch mode is not supported by reset!');
		}

		function extractResteCode(v) {
			var m = String(v).match(/https:\/\/mega\.co\.nz\/#recover([A-Za-z0-9_-]{20,150})/);
			if (m) {
				return m[1];
			}
		}

		return this.promptPassword(true).then(function(pass) {
			password = pass;

			return api.requestUserReset(opts.email);
		}).done(function(res) {
			return this.promptCode('Check email account ' + opts.email + ' and enter the reset link (or type abort): ', extractResteCode);
		}, this).done(function(code) {
			return api.completeUserReset(code, opts.email, password);
		}).done(function() {
			Log.verbose('Reset was successful!');

			this.saveCredentials(opts.email, password);
		}, this);
	}
});

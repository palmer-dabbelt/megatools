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

	run: function() {
		var opts = this.opts;
		var session, password;

		return this.acquirePasswordFromOptFileOrUser('new-password', true).done(function(pw) {
			password = pw;

			return this.getSession({
				loadFilesystem: false
			});
		}, this).done(function(s) {
			session = s;

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
		}).done(function() {
			return session.api.getUser();
		}).done(function(res) {
			var pk = C.aes_key_from_password(password);
			var nk = C.aes_enc(pk, session.data.mk);

			if (res.user.k != C.ub64enc(nk)) {
				return Defer.rejected('change_failed', 'Password change failed.');
			}

			session.close();
			this.saveCredentials(session.username, password);
		}, this);
	}
});

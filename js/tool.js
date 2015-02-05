/**
 * Megatools 2.0
 */

MEGA_RC_FILENAME = C.os == 'windows' ? 'mega.ini' : '.megarc';

GW.define('Tool', 'object', {
	name: null,
	description: null,
	usages: null,
	detail: null,
	examples: null,

	toolOpts: [],
	allowArgs: false,

	// parsed args and opts
	args: null,
	opts: null,

	basicOpts: [{
		longName: "batch",
		shortName: 'b',
		help: "Disable interactive input and output information in a format suitable for batch processing/scripting."
	}, {
		longName: "verbose",
		shortName: 'v',
		help: "Make output more verbose. Be aware that this option may output your secret keys to the terminal."
	}, { 
		longName: "debug",
		help: "Enable debugging output."
	}, {
		longName: "version",
		help: "Show version information and exit."
	}, { 
		longName: "help",
		help: "Display help message and exit."
	}],

	exportedFolderOpts: [{
		longName: "folder-link",
		arg: 'string',
		help: "If exported folder link is provided, megatools will operate on the contents of an exported folder instead of the regular user account filesystem.",
		argHelp: "URL" 
	}],

	loginOpts: [{
		longName: "username",
		shortName:  'u',
		arg: 'string',
		help: "Either e-mail address if logging in to a full user account or user handle of an ephemeral account.",
		argHelp: "USERNAME" 
	}, {
		longName: "password",
		shortName:  'p',
		arg: 'string',
		help: "Password for login. This option is less secure than the --password-file option.",
		argHelp: "PASSWORD" 
	}, {
		longName: "password-file",
		arg: 'string',
		help: "Path to a file containing the password for login. All characters including leading and trailing spaces up to the first new line are used.",
		argHelp: "PATH"
	}, {
		longName: "config",
		arg: 'filename',
		help: "Load credentials from a specified file.",
		argHelp: "PATH"     
	}, {
		longName: "ignore-config",
		help: "Disable loading credentials from " + MEGA_RC_FILENAME + " file from the current working or user's home directories."
	}],

	fsOpts: [{
		longName: "reload",
		help: "Reload filesystem cache"
	}, {
		longName: "disable-previews",
		help: "Never generate previews when uploading file"
	}],

	getOptsSpec: function() {
		return this.getOptsSpecCustom().concat(this.basicOpts);
	},

	getOptsSpecCustom: function() {
		return [];
	},

	parseCommandLine: function(args) {
		this.opts = {};
		this.args = [];

		var shortMap = {};
		var longMap = {};

		_(this.getOptsSpec()).each(function(opt) {
			if (opt.shortName) {
				shortMap['-' + opt.shortName] = opt;
			}

			if (opt.longName) {
				longMap['--' + opt.longName] = opt;
			}
		});

		var i, arg, spec;
		for (i = 0; i < args.length; i++) {
			arg = args[i];
			if (arg == '--') {
				this.args = this.args.concat(args.slice(i + 1));
				return this.checkCommandLine();
			}

			if (_.has(longMap, arg) || _.has(shortMap, arg)) {
				spec = longMap[arg] || shortMap[arg];

				this.opts[spec.longName] = true;

				if (spec.arg) {
					if (!_.isString(args[i + 1])) {
						Log.error('Option ' + arg + ' requires argument ' + spec.argHelp);
						return false;
					}

					this.opts[spec.longName] = args[++i];
				}
			} else if (arg.match(/^-{1,2}[a-z0-9]/)) {
				Log.error('Unknown option ' + arg);
				return false;
			} else {
				this.args.push(arg);
			}
		}

		return this.checkCommandLine();
	},

	checkCommandLine: function() {
		if (this.args.length != 0 && !this.allowArgs) {
			Log.error('Arguments given, but command does not expect any arguments: ', this.args);
			return false;
		}

		return true;
	},

	getHelp: function() {
		var doc = new Document({
			name: 'megatools-' + this.name,
			description: this.description
		});

		if (this.description) {
			doc.paragraphs([this.description]);
		}

		var usages = _(this.usages).map(function(usage) {
			return {
				name: this.name,
				usage: usage
			};
		}, this);

		doc.usage(usages);

		if (this.detail) {
			doc.paragraphs(this.detail);
		}

		doc.options(this.getOptsSpec());

		doc.examples(this.examples);

		doc.footer();

		return doc;
	},

	version: function() {
		var doc = new Document();
		doc.footer();
		doc.toScreen();
	},

	loadConfig: function() {
		var sep = C.os == 'windows' ? '\\' : '/';
		var tryPaths = [C.get_current_dir() + sep + MEGA_RC_FILENAME, C.get_home_dir() + sep + MEGA_RC_FILENAME, C.get_config_dir() + sep + MEGA_RC_FILENAME];
		var i, path;

		if (this.opts.config) {
			tryPaths = [this.opts.config];
		} else if (this.opts['ignore-config']) {
			tryPaths = [];
		}

		if (tryPaths.length > 0) {
			Log.debug('Trying config files', tryPaths);
		}

		for (i = 0; i < tryPaths.length; i++) {
			path = tryPaths[i];

			if (C.file_exists(path)) {
				Log.debug('Found config file', path);

				var data = C.file_read(path);
				if (data) {
					Log.debug('Loaded config:\n' + data.toString());
					try {
						return Duktape.dec('jx', data.toString());
					} catch (ex) {
						throw new Error('Can\'t parse config file at ' + path);
					}
				}
			}
		}
	},

	getCredentials: function() {
		return Defer.defer(function(defer) {
			var creds = {};

			if (this.opts['folder-link']) {
				var m = this.opts['folder-link'].match(/https:\/\/mega\.co\.nz\/#F!([a-zA-Z0-9]{8})!([a-zA-Z0-9_-]{22})/);
				if (!m) {
					defer.reject('bad_opts', 'Invalid folder link. Use https://mega.co.nz/#F![handle]![sharekey]');
					return;
				}

				creds.folderHandle = m[1];
				creds.folderKey = C.ub64dec(m[2]);
			}

			if (this.opts.password && this.opts['password-file']) {
				defer.reject('bad_opts', 'Conflicting options --password and --password-file');
				return;
			}

			if (this.opts.password) {
				creds.password = this.opts.password;
			}

			if (this.opts['password-file']) {
				var data = C.file_read(this.opts['password-file']);
				if (data) {
					creds.password = data.toString().split(/\r?\n/)[0];
				} else {
					defer.reject('no_password', 'Can\'t read password file at ' + this.opts['password-file']);
					return;
				}
			}

			if (this.opts.username) {
				creds.username = this.opts.username;
			}

			if (!creds.username) {
				var config;
				try {
					config = this.loadConfig();
				} catch (ex) {
					defer.reject('bad_config', ex.message);
					return;
				}

				if (config && config.username && config.password) {
					creds.username = config.username;
					creds.password = config.password;
				} else {
					defer.reject('no_username', 'Please specify --username or configure it in the ' + MEGA_RC_FILENAME);
					return;
				}
			}

			if (_.isUndefined(creds.password)) {
				if (this.opts.batch) {
					defer.reject('no_password', 'Please specify --password or --password-file or configure it in the ' + MEGA_RC_FILENAME);
				} else {
					C.prompt('Enter password: ', function(password) {
						creds.password = password;

						defer.resolve(creds);
					}, true);
				}
			} else {
				defer.resolve(creds);
			}
		}, this).done(function(creds) {
			Log.debug('Using credentials', creds);
		});
	},

	getSession: function(config) {
		config = _.defaults(config || {}, {
			loadFilesystem: true,
			clear: false,
			refresh: true
		});

		return Defer.defer(function(defer) {
			var session = new Session();

			function loadFilesystemIfNecessary() {
				if (config.loadFilesystem) {
					return session.getFilesystem().load();
				}

				return Defer.resolved();
			}

			this.getCredentials().then(function(creds) {
				session.setCredentials(creds.username, creds.password);

				if (creds.folderHandle && creds.folderKey) {
					session.openExportedFolder(creds.folderHandle, creds.folderKey);

					loadFilesystemIfNecessary().then(function() {
						defer.resolve(session);
					}, defer.reject);

					return;
				}

				if (config.clear) {
					session.close();
				}

				session.open(config.refresh).then(function() {
					loadFilesystemIfNecessary().then(function() {
						defer.resolve(session);
					}, defer.reject);
				}, defer.reject);
			}, defer.reject);
		}, this);
	},

	promptCode: function(msg, codeChecker) {
		return Defer.defer(function(defer) {
			function ask() {
				C.prompt(msg, function(v) {
					var code = codeChecker(v);
					if (code) {
						defer.resolve(code);
					} else if (String(v).match(/abort/)) {
						defer.reject('no_code', 'Aborted by the user!');
					} else {
						ask();
					}
				});
			}

			ask();
		});
	},

	promptPassword: function(twice) {
		return Defer.defer(function(defer) {
			C.prompt('Enter password: ', function(password1) {
				if (!twice) {
					defer.resolve(password1);
					return;
				}

				C.prompt('Repeat password: ', function(password2) {
					if (password1 != password2) {
						defer.reject('pass', 'Passwords don\'t match');
					} else {
						defer.resolve(password1);
					}
				}, true);
			}, true);
		});
	},

	acquirePasswordFromOptFileOrUser: function(optName, verify) {
		var passwordOption = this.opts[optName];
		var passwordFileOption = this.opts[optName + '-file'];

		if (passwordOption && passwordFileOption) {
			return Defer.rejected('args', 'Conflicting options --' + optName + ' and --' + optName + '-file');
		}

		if (passwordOption) {
			return Defer.resolved(passwordOption);
		} else if (passwordFileOption) {
			var data = C.file_read(passwordFileOption);
			if (data) {
				return Defer.resolved(data.toString().split(/\r?\n/)[0]);
			} else {
				return Defer.rejected('args', 'Can\'t read password file at ' + passwordFileOption);
			}
		}

		if (this.opts.batch) {
			return Defer.rejected('args', 'Please specify --' + optName + ' or --' + optName + '-file');
		} else {
			return this.promptPassword(verify);
		}
	},

	saveCredentials: function(username, password) {
		if (this.opts['save-config']) {
			var path = this.opts.config || MEGA_RC_FILENAME;

			if (!C.file_write(path, Duktape.Buffer(Duktape.enc('jx', {username: username, password: password}, null, '  ')))) {
				Log.warning('Failed to save config file at ' + path);
			}
		}
	},

	run: function() {
		return Defer.rejected('not_impl', 'Tool ' + this.name + ' is not implemented, yet!');
	},

	_run: function(args) {
		if (!this.parseCommandLine(args)) {
			return Defer.rejected(10);
		}

		if (this.opts.debug) {
			Log.setLevel(Log.DEBUG);
		}

		if (this.opts.verbose) {
			Log.setVerbose(true);
		}

		if (this.opts.help) {
			this.getHelp().toScreen();

			return Defer.rejected(1);
		}

		if (this.opts.version) {
			this.version();

			return Defer.rejected(1);
		}

		return this.run().fail(function(code, msg, ex) {
			Log.error(msg);

			if (ex) {
				Log.msg(ex.stack);
			}

			return Defer.rejected(1);
		});
	}
});

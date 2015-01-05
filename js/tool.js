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

	help: function() {
		if (this.description) {
			print(Utils.breakLine(this.description));
			print('');
		}

		print('Usage:');
		app.helpUsage(this.name, this.usages);
		print('');

		if (this.detail) {
			print(_.map(this.detail, function(ln) {
				return Utils.breakLine(ln);
			}).join('\n'));
			print('');
		}

		function optLeftSide(opt) {
			return _.compact([_.compact([opt.shortName ? '-' + opt.shortName : null, opt.longName ? '--' + opt.longName : null]).join(', '), (opt.argHelp ? opt.argHelp : '')]).join(' ');
		}

		var leftColumnWidth = 2 + 1 + _(this.getOptsSpec()).reduce(function(res, opt) {
			return Math.max(res, optLeftSide(opt).length);
		}, 0);

		var space = Utils.getSpace(leftColumnWidth);

		print('Application Options:');
		_(this.getOptsSpec()).each(function(opt) {
			var left = optLeftSide(opt);
			var lns = _.isArray(opt.help) ? opt.help : opt.help.split('\n');

			print(Utils.breakLine('  ' + left + space.substr(left.length + 2) + ' ' + lns.shift(), leftColumnWidth + 1));
			_.each(lns, function(ln) {
				print(Utils.breakLine(space + ' ' + ln, leftColumnWidth + 1));
			});
		});
		print('');

		_(this.examples || []).each(function(ex, idx) {
			print(Utils.breakLine('Example ' + (idx + 1) + ': ' + ex.title));
			print('');

			if (ex.commands) {
				_(ex.commands).each(function(c) {
					print(Utils.breakLine('  ' + c, 4));
				});

				print('');
			} else if (ex.steps) {
				_(ex.steps).each(function(s) {
					if (s.description) {
						print(Utils.breakLine('  ' + s.description, 2));
					}

					_(s.commands).each(function(c) {
						print(Utils.breakLine('    ' + c, 6));
					});

					print('');
				});
			}
		}, this);

		app.helpFooter();
	},

	version: function() {
		app.helpFooter();
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

	run: function(defer) {
		Log.error('Tool ' + this.name + ' is not implemented, yet!');

		defer.reject();
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
			this.help();

			return Defer.rejected(1);
		}

		if (this.opts.version) {
			this.version();

			return Defer.rejected(1);
		}

		return Defer.defer(this.run, this);
	}
});

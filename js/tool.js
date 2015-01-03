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
		longName: "debug",
		help: "Enable debugging output"
	}, {
		longName: "version",
		help: "Show version information and exit"
	}, { 
		longName: "help",
		help: "Display help message and exit"
	}],

	configOpts: [{
		longName: "config",
		arg: 'filename',
		help: "Load configuration from a file",
		argHelp: "PATH"     
	}, {
		longName: "ignore-config-file",
		help: "Disable loading " + MEGA_RC_FILENAME
	}],

	loginOpts: [{
		longName: "username",
		shortName:  'u',
		arg: 'string',
		help: "Account username (email)",
		argHelp: "USERNAME" 
	}, {
		longName: "password",
		shortName:  'p',
		arg: 'string',
		help: "Account password",
		argHelp: "PASSWORD" 
	}, {
		longName: "no-ask-password",
		help: "Never ask interactively for a password"
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

		if (this.detail) {
			print(_.map(this.detail, function(ln) {
				return Utils.breakLine(ln);
			}).join('\n'));
			print('');
		}

		print('Usage:');
		app.helpUsage(this.name, this.usages);
		print('');

		function optLeftSide(opt) {
			return _.compact([opt.shortName ? '-' + opt.shortName : null, opt.longName ? '--' + opt.longName + (opt.argHelp ? ' ' + opt.argHelp : '') : null]).join(', ');
		}

		var leftColumnWidth = 2 + 1 + _(this.getOptsSpec()).reduce(function(res, opt) {
			return Math.max(res, optLeftSide(opt).length);
		}, 0);

		var space = Utils.getSpace(leftColumnWidth);

		print('Application Options:');
		_(this.getOptsSpec()).each(function(opt) {
			var left = optLeftSide(opt);

			print(Utils.breakLine('  ' + left + space.substr(left.length + 2) + ' ' + opt.help, leftColumnWidth + 1));
		});
		print('');

		_(this.examples || []).each(function(ex, idx) {
			print('Example ' + (idx + 1) + ': ' + ex.title);
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

	run: function(defer) {
		Log.error('Tool ' + this.name + ' is not implemented, yet!');

		defer.reject();
	},

	_run: function(args) {
		if (!this.parseCommandLine(args)) {
			return Defer.rejected(10);
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

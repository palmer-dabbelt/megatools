GW.define('Application', 'object', {
	getCommand: function() {
		var m = C.args[0].match(/(mega([a-z0-9]+))$/), cmd = {};
		if (m) {
			if (m[1] == 'megatools') {
				if (!C.args[1]) {
					return null;
				}

				cmd.name = C.args[1];
				cmd.args = C.args.slice(2);
			} else {
				cmd.name = m[2];
				cmd.args = C.args.slice(1);
			}

			return cmd;
		}

		return null;
	},

	getTools: function() {
		return _(GW.Class.__classXTypeIndex__).chain().filter(function(cls, xtype) {
			return xtype.match(/^tool\./);
		}).map(function(cls) {
			return {
				cls: cls,
				name: cls.prototype.name,
				order: cls.prototype.order || 10000
			};
		}).sortBy(function(tool) {
			return tool.order;
		}).value();
	},

	getTool: function(name) {
		return _(this.getTools()).find(function(tool) {
			return tool.name == name;
		});
	},

	getTestSuites: function(name) {
		return _(GW.Class.__classXTypeIndex__).filter(function(cls, xtype) {
			return xtype.match(/^testsuite\./) && (!name || name == cls.prototype.name);
		});
	},

	help: function() {
		this.helpLines([
			'Megatools is a collection of programs for accessing Mega service from a command line of your desktop or server.',
			'',
			'Usage:'
		]);
		_(this.getTools()).each(function(tool) {
			this.helpUsage(tool.name, tool.cls.prototype.usages);
		}, this);
		this.helpLines([
			'',
			'Megatools allow you to copy individual files as well as entire directory trees to and from the cloud. You can also perform streaming downloads for example to preview videos and audio files, without needing to download the entire file.',
			'',
			'Megatools are robust and optimized for fast operation - as fast as Mega servers allow. Memory requirements and CPU utilization are kept at minimum.',
			'',
			'You can register account using a man:megareg[1] tool, with the benefit of having true control of your encryption keys.',
			'',
			'Mega website can be found at http://mega.co.nz.',
			'',
			'Megatools can be downloaded at http://megatools.megous.com',
			'',
			'',
			'Commands overview',
			'=================',
			''
		]);
		this.helpToolsOverview();
		this.helpLines([
			'',
			'Get individual command help:',
			'  $ megatools <command> --help',
			'',
			'',
			'Configuration file',
			'==================',
			'',
			'Megatools use configuration file to store commonly used login credentials. This makes it less bothersome and safer to use the tools, as you can simply write:',
			'',
			'  $ megadf',
			'',
			'instead of:',
			'',
			'  $ megadf --username my@email.com --password mypass',
			'',
			'when using the tools.',
			'',
			'Configuration file is read either from the current directory or user\'s home directory unless `--ignore-config` was passed to the tool, or when explicit path to the config file was given via `--config <path>`.',
			'',
			'Create .megarc (on linux) or mega.ini (on windows) file containing this 1 line:',
			'',
			'  { username: "your@email", password: "yourpassword" }',
			'',
			'You can let megatools create this configuration file for you automatically by specifying `--save-config` during registration, or other operations that change passwords.',
			'',
			'',
			'Remote filesystem',
			'=================',
			'',
			'Mega.co.nz filesystem is represented as a tree of nodes of various types. Nodes are identified by a 8 character node handles (eg. `7Fdi3ZjC`). Structure of the filesystem is not encrypted.',
			'',
			'Megatools maps node tree structure to a traditional filesystem paths (eg. `/Root/SomeFile.DAT`).',
			'',
			'*NOTE*: By the nature of Mega.co.nz storage, several files in the directory can have the same name. To allow access to such files, the names of conflicting files are extended by appending dot and their node handle like this:',
			'',
			'---------',
			'/Root/conflictingfile',
			'/Root/conflictingfile.7Fdi3ZjC',
			'/Root/conflictingfile.mEU23aSD',
			'---------',
			'',
			'You need to be aware of several special folders:',
			''
		]);
		this.helpDescriptionList([
			['/Root', 'Writable directory representing the root of the filesystem.'],
			['/Rubbish', 'Trash directory where Mega.co.nz web client moves deleted files. This directory is not used by megatools when removing files.'],
			['/Inbox', 'Not sure.'],
			['/Contacts', 'Directory containing subdirectories representing your contacts list. If you want to add contacts to the list, simply create subdirectory named after the contact you want to add.'],
			['/Contacts/<email>', 'Directories representing individual contacts in your contacts list. These directories contain folders that others shared with you. All shared files are read-only, at the moment.']
		]);
		this.helpLines([
			''
		]);
		this.helpFooter();
	},

	helpUsage: function(name, usages) {
		_(usages || []).each(function(usage) {
			print(Utils.breakLine('  megatools ' + name + ' ' + usage, 4));
		});
	},
	
	helpLines: function(lines) {
		_(lines).each(function(ln) {
			print(Utils.breakLine(ln));
		});
	},

	helpDescriptionList: function(items) {
		_(items).each(function(item) {
			print(Utils.breakLine(item[0]));
			print('');
			print(Utils.breakLine('  ' + item[1], 2));
			print('');
		});
	},
	
	helpToolsOverview: function() {
		var leftCol = 11;
		var space = Utils.getSpace(leftCol);
		_(this.getTools()).each(function(tool) {
			print(Utils.breakLine('  ' + tool.name + space.substr(tool.name.length) + tool.cls.prototype.description, leftCol + 2));
		}, this);
	},

	helpFooter: function() {
		print('Megatools ' + C.version + ' - command line tools for Mega.co.nz');
		print('Written by Ondřej Jirman <megous@megous.com>, 2014');
		print('Go to http://megatools.megous.com for more information');
		print('Report bugs at https://github.com/megous/megatools/issues');
		print('');
	},

	runTool: function(tool, cmd) {
		tool._run(cmd.args).then(function() {
			C.exit(0);
		}, function(code) {
			C.exit(code || 1);
		});
	},

	runTests: function(cmd) {
		// run tests
		var tests = _(this.getTestSuites(cmd.args[0])).map(function(cls) {
			var test = new cls();

			return function() {
				return test.run(cmd.args[1]);
			};
		});

		print('Running tests:\n');

		Defer.chain(tests).then(function() {
			print('\nAll OK!\n');
			C.exit(0);
		}, function() {
			print('\nTest FAILED!\n');
			C.exit(1);
		});
	},

	run: function() {
		var cmd = this.getCommand();
		if (!cmd) {
			this.help();
			C.exit(1);
		} else if (cmd.name == 'test') {
			this.runTests(cmd);
		} else {
			var tool = this.getTool(cmd.name);
			if (tool) {
				this.runTool(new tool.cls, cmd);
			} else {
				this.help();
				C.exit(1);
			}
		}
	}
});

var app = new Application();
app.run();

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

	getHelp: function() {
		var doc = new Document({
			name: 'megatools',
			description: 'Mega.co.nz command line tools'
		});

		doc.paragraphs([
			'Megatools is a collection of programs for accessing Mega service from a command line of your desktop or server.'
		]);

		var usages = _(this.getTools()).chain().map(function(tool) {
			return _(tool.cls.prototype.usages).map(function(usage) {
				return {
					name: tool.name,
                                        usage: usage
				};
			});
		}, this).flatten().value();

		doc.usage(usages);

		doc.paragraphs([
			'Megatools allow you to copy individual files as well as entire directory trees to and from the cloud. You can also perform streaming downloads for example to preview videos and audio files, without needing to download the entire file.',
			'Megatools are robust and optimized for fast operation - as fast as Mega servers allow. Memory requirements and CPU utilization are kept at minimum.',
			'You can register account using a `register` command, with the benefit of having true control of your encryption keys.',
			'Mega website can be found at http://mega.co.nz.',
			'Megatools can be downloaded at http://megatools.megous.com'
		]);

		doc.heading('Commands overview');

		var toolsOverview = _(this.getTools()).map(function(tool) {
			return [tool.name, tool.cls.prototype.description];
		});

		doc.table(toolsOverview);

		doc.paragraphs([
			'Get individual command help:'
		]);

		doc.commands([
			'$ megatools <command> --help'
		]);

		doc.heading('Configuration file');

		doc.paragraphs([
			'Megatools use configuration file to store commonly used login credentials. This makes it less bothersome and safer to use the tools, as you can simply write:'
		]);

		doc.commands([
			'$ megadf'
		]);

		doc.paragraphs([
			'instead of:'
		]);

		doc.commands([
			'$ megadf --username my@email.com --password mypass'
		]);

		doc.paragraphs([
			'when using the tools.',
			'Configuration file is read either from the current directory or user\'s home directory unless `--ignore-config` was passed to the tool, or when explicit path to the config file was given via `--config <path>`.',
			'Create .megarc (on linux) or mega.ini (on windows) file containing this 1 line:'
		]);

		doc.commands([
			'{ username: "your@email", password: "yourpassword" }'
		]);

		doc.paragraphs([
			'You can let megatools create this configuration file for you automatically by specifying `--save-config` during registration, or other operations that change passwords.'
		]);

		doc.heading('Remote filesystem');

		doc.paragraphs([
			'Mega.co.nz filesystem is represented as a tree of nodes of various types. Nodes are identified by a 8 character node handles (eg. `7Fdi3ZjC`). Structure of the filesystem is not encrypted.',
			'Megatools maps node tree structure to a traditional filesystem paths (eg. `/Root/SomeFile.DAT`).',
			'*NOTE*: By the nature of Mega.co.nz storage, several files in the directory can have the same name. To allow access to such files, the names of conflicting files are extended by appending dot and their node handle like this:'
		]);

		doc.commands([
			'/Root/conflictingfile',
			'/Root/conflictingfile.7Fdi3ZjC',
			'/Root/conflictingfile.mEU23aSD'
		]);

		doc.paragraphs([
			'You need to be aware of several special folders:'
		]);

		doc.definitions([
			['/Root', 'Writable directory representing the root of the filesystem.'],
			['/Rubbish', 'Trash directory where Mega.co.nz web client moves deleted files. This directory is not used by megatools when removing files.'],
			['/Inbox', 'Not sure.'],
			['/Contacts', 'Directory containing subdirectories representing your contacts list. If you want to add contacts to the list, simply create subdirectory named after the contact you want to add.'],
			['/Contacts/<email>', 'Directories representing individual contacts in your contacts list. These directories contain folders that others shared with you. All shared files are read-only, at the moment.']
		]);

		doc.footer();

		return doc;
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
			this.getHelp().toScreen();
			C.exit(1);
		} else if (cmd.name == 'test') {
			this.runTests(cmd);
		} else {
			var tool = this.getTool(cmd.name);
			if (tool) {
				this.runTool(new tool.cls, cmd);
			} else {
				Log.error('Unknown command', cmd.name);
				C.exit(10);
			}
		}
	}
});

var app = new Application();
app.run();

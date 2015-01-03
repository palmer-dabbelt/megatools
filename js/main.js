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
		print('Usage:');
		_(this.getTools()).each(function(tool) {
			this.helpUsage(tool.name, tool.cls.prototype.usages);
		}, this);
		print('');
		print('Get individual command help:');
		print('  megatools <command> --help');
		print('');

		this.helpFooter();
	},

	helpUsage: function(name, usages) {
		_(usages || []).each(function(usage) {
			print(Utils.breakLine('  megatools ' + name + ' ' + usage, 4));
		});
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

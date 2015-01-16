/**
 * Tests
 *
 * Following objects are used to run tests on the megatools' internal code and
 * commands.
 *
 * Objects overview
 * ----------------
 *
 * TestManager:
 *   - Collects test suites and individual tests from the class system
 *     registry and runs them. 
 *   - Returns TestReport.
 *
 * TestReport:
 *   - Stores results of individual tests.
 *   - Generates HTML report.
 *   - Can calculate total result and stats.
 *
 * TestSuite:
 *   - Collection of individual tests.
 *   - TestSuite can provide common setup/teardown functions for individual
 *     test.
 *
 * Test:
 *   - Individual test unit.
 */
GW.define('Test', 'object', {
	fail: function(msg) {
		var error = new Error(msg);
		error.assert = true;
		throw error;
	},

	assert: function(expr, failMsg) {
		if (!expr) {
			this.fail(failMsg);
		}
	},

	assertEq: function(a, b, failMsg) {
		this.assert(a == b, failMsg + ': ' + Duktape.enc('jx', a) + ' != ' + Duktape.enc('jx', b));
	},

	assertEqApprox: function(a, b, room, failMsg) {
		this.assertRange(Math.abs(a - b), 0, room / 2, failMsg);
	},

	assertRange: function(a, min, max, failMsg) {
		this.assert(a >= min && a <= max, failMsg + ': ' + Duktape.enc('jx', a) + ' not between ' + min + ' and ' + max);
	},

	assertNeq: function(a, b, failMsg) {
		this.assert(a != b, failMsg + ': ' + Duktape.enc('jx', a) + ' == ' + Duktape.enc('jx', b));
	},

	log: function(v) {
		var args = Array.prototype.slice.call(arguments);
		var out = [], i, a;

		for (i = 0; i < args.length; i++) {
			a = args[i];

			if (typeof a == 'string') {
				out.push(a);
			} else {
				out.push(Duktape.enc('jx', a, null, '    '));
			}
		}

		this.report.testLog(this, out.join(''));
	},

	run: function(test) {
	},

	_run: function(report) {
		var test = this;

		test.report = report;

		report.testRun(test);

		return Defer.defer(function(defer) {
			var testDefer = test.run(test);
			if (testDefer) {
				testDefer.then(defer.resolve, defer.reject);
			} else {
				defer.resolve();
			}
		}).then(function() {
			report.testOk(test);

			return Defer.resolved();
		}, function(code, msg, e) {
			report.testFail(test, code, msg, e);

			return Defer.resolved();
		});
	}
});

GW.define('TestSuite', 'object', {
	name: '',

	getTests: function() {
		return [];
	}
});

GW.define('TestReport', 'object', {
	initObject: function() {
		this.results = [];
	},

	testLog: function(test, text) {
		this.log.push(text);
	},

	testRun: function(test) {
		this.log = [];
	},

	testOk: function(test) {
		Log.msg(Utils.pad(test.suite.name + '.' + test.name, 40) + '[~b~gOK~n~B]');

		this.results.push({
			suite: test.suite.name,
			test: test.name,
			success: true,
			log: this.log
		});
	},

	testFail: function(test, code, msg, e) {
		Log.msg(Utils.pad(test.suite.name + '.' + test.name, 40) + '[~b~rFAIL~n~B] ' + msg);

		this.results.push({
			suite: test.suite.name,
			test: test.name,
			success: false,
			code: code,
			message: msg,
			stack: e ? e.stack : null,
			log: this.log
		});
	},

	saveHtml: function(path) {
		C.file_write(path, Duktape.Buffer(this.generateHtml()));
	},

	saveJson: function(path) {
		C.file_write(path, Duktape.Buffer(JSON.stringify(this.results, null, '    ')));
	},

	isSuccess: function() {
		return !_(this.results).find(function(r) {
			return !r.success;
		});
	},

	// HTML generator

	generateHtml: function() {
		var out = [];

		function ln(ln) {
			out.push(ln, '\n');
		}

		function e(value) {
			return !value ? '' : String(value).replace(/&/g, "&amp;").replace(/>/g, "&gt;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
		}

		ln('<!DOCTYPE html>');
		ln('<html>');
		ln('<head>');
		ln('<meta charset="utf-8">');
		ln('<meta name="description" content="' + e('Test report for megatools ' + C.version) + '">');
		ln('<style>');
		ln(e([
			'body { background: white; font-family: sans-serif; font-size: 14px; }',
			'body, h1, h2, pre { margin: 0; padding: 0px; }',
			'pre { margin-bottom: 20px; white-space: pre; word-wrap: break-word; }',
			'h1 { font-size: 24px; padding: 10px 40px; background: #444; color: white; }',
			'h2 { font-size: 22px; padding: 40px 40px; color: brown; }',
			'.test { padding: 10px 40px; background: #f3f3f3; }',
			'.test:nth-child(2n) { background: white; }',
			'.status { font-size: 16px; }',
			'.fail .result { color: red; font-weight: bold; }',
			'.ok .result { color: green; font-weight: bold; }',
			'.name { font-weight: bold; }',
			'.info .error { color: red; font-weight: bold; margin-top: 10px; }'
		].join('\n')));
		ln('</style>');
		ln('<title>' + e('Megatools test report - ' + C.date('%F')) + '</title>');
		ln('</head>');
		ln('<body>');
		ln('<div class=wrap>');
		ln('<h1>' + e('Megatools test report - ' + C.date('%F')) + '</h1>');

		_(this.results).chain().groupBy(function(r) {
			return r.suite;
		}).each(function(results, suite) {
			ln('<h2>' + e(suite) + '</h2>');

			_(results).each(function(r) {
				ln('<div class="test">');
					ln('<div class="status ' + (r.success ? 'ok' : 'fail') + '">[<span class=result>' + (r.success ? 'OK' : 'FAIL') + '</span>] <span class="name">' + e(r.test) + '</span></div>');
					ln('<div class="info">');

					if (r.message) {
						ln('<pre class="error">' + e(r.message) + '</pre>');
					}

					if (r.log && r.log.length > 0) {
						ln('<pre class="log">' + e(r.log.join('\n')) + '</pre>');
					}

					ln('</div>');
				ln('</div>');
			});
		});

		ln('</div>');
		ln('</body>');
		ln('</html>');

		return out.join('');
	}

});

GW.define('TestManager', 'object', {
	getTests: function() {
		var manager = this;

		return _(GW.Class.__classXTypeIndex__).chain().filter(function(cls, xtype) {
			return xtype.match(/^testsuite\./);
		}).sortBy(function(cls) {
			return cls.prototype.order || 1000000;
		}).map(function(cls) {
			var suite = new cls({
				manager: manager
			});

			return _(suite.getTests()).map(function(testConfig) {
				testConfig.suite = suite;
				testConfig.manager = manager;

				return new Test(testConfig);
			});
		}).flatten().value();
	},

	run: function(testSuiteName, testName) {
                var report = new TestReport();
		var testRunners = _(this.getTests()).chain().filter(function(test) {
			return !test.disabled && (!testSuiteName || testSuiteName == test.suite.name) && (!testName || testName == test.name);
		}).map(function(test) {
			return function() {
				return test._run(report).fail(function(code, msg, e) {
					if (code == 'exception') {
						print('ERROR: ' + e.stack);
					}
				});
			};
		}).value();

		return Defer.chain(testRunners).complete(function() {
			return Defer.resolved(report);
		});
	}
});

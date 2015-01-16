GW.define('TestSuite.TOOLS', 'TestSuite', {
	name: 'tools',

	getTests: function() {
		var test;
		var cwd = C.get_current_dir();

		function formatCmd(cmd) {
			return _.isArray(cmd) ? cmd.join(' ') : cmd;
		}

		function formatOutErr(stdout, stderr) {
			test && test.log('---------- STDOUT ----------\n', stdout.toString(), '---------- STDERR ----------\n', stderr.toString(), '----------------------------\n');
		}

		function exec(cmd, stdin) {
			test && test.log('\n\n' + formatCmd(cmd) + '\n');

			if (stdin) {
				test && test.log('---------- STDIN -----------\n', stdin.toString(), '----------------------------\n');
			}

			return Utils.exec(cmd, stdin).then(function(stdout, stderr) {
				formatOutErr(stdout, stderr);
			}, function(code, msg, stdout, stderr, status) {
				if (code == 'exec-fail-status') {
					test && test.log('RETURN: ' + status);
				} else {
					test && test.log('ERROR: ' + msg);
				}

				formatOutErr(stdout, stderr);
			});
		}

		function execMegatools(cmd, stdin) {
			if (_.isArray(cmd)) {
				return exec([cwd + '/megatools'].concat(cmd), stdin);
			} else {
				return exec(C.shell_quote(cwd + '/megatools') + ' ' + cmd, stdin);
			}
		}

		function megatools(cmd, stdin) {
			return execMegatools(cmd, stdin).fail(function() {
				return Defer.rejected('expect_success', '"megatools ' + formatCmd(cmd) + '" failed, expected success');
			});
		}

		function megatoolsFail(cmd, stdin) {
			return execMegatools(cmd, stdin).then(function() {
				return Defer.rejected('expect_fail', '"megatools ' + formatCmd(cmd) + '" succeeded, expected failure');
			}, function(code, msg, stdout, stderr, status) {
				return Defer.resolved(stdout, stderr, status);
			});
		}

		return _.map([{
			name: 'register',
			run: function(test) {
				//'--email <email> --name <realname> [--password <password> | --password-file <path>]',
				//'--confirm --signup-link <signuplink> [--password <password> | --password-file <path>]'

				// nothing to do
			        return megatoolsFail('register').done(function() {
					// missing password file
					return megatoolsFail('register --batch --ephemeral --password-file non-existent');
			        }).done(function() {
					// missing password in batch mode
			                return megatoolsFail('register --batch --ephemeral');
			        }).done(function() {
					// conflicting options
			                return megatoolsFail('register --batch --ephemeral --password-file path --password pw');
			        }).done(function() {
					// conflicting options
			                return megatoolsFail('register --batch --ephemeral --email megous@megous.com --password qwe');
			        }).done(function() {
					// invalid email
			                return megatoolsFail('register --email invalid --name bob --password qwe');
			        }).done(function() {
					// invalid signup link
			                return megatoolsFail('register --confirm --signup-link sfasdfasdfasdf --password qwe');
			        }).done(function() {
					// create ephemeral
			                return megatools('register --ephemeral', 'qwe\nqwe\n');
			        }).done(function() {
					// create ephemeral
			                return megatools('register --batch --ephemeral --password qwe');
			        }).done(function() {
					// create ephemeral
					C.file_write('pw', Duktape.Buffer('qwe'));

			                return megatools('register --batch --ephemeral --password-file pw --save-config');
			        });
			}
		}, {
			name: 'passwd',
			run: function(test) {
				return megatoolsFail('passwd', 'qwe\nqwe\n');
			}
		}, {
			name: 'reset',
			run: function(test) {
				return megatoolsFail('reset');
			}
		}, {
			name: 'fixup',
			run: function(test) {
				return megatools('fixup --dry-run');
			}
		}, {
			name: 'info',
			run: function(test) {
				return megatools('info').then(function() {
					return megatools('info -s');
				}).then(function() {
					return megatools('info -s --binary');
				}).then(function() {
					return megatools('info -f');
				}).then(function() {
					return megatools('info -f -s --binary --batch');
				});
			}
		}, {
			name: 'df',
			run: function(test) {
				return megatools('df').then(function() {
					return megatools('df --used');
				}).then(function() {
					return megatools('df --free');
				}).then(function() {
					return megatools('df --total');
				}).then(function() {
					return megatools('df --gb');
				}).then(function() {
					return megatools('df --total --gb');
				}).then(function() {
					return megatools('df --mb');
				}).then(function() {
					return megatools('df --total --mb');
				}).then(function() {
					return megatools('df --total --kb');
				}).then(function() {
					return megatools('df --batch');
				}).then(function() {
					return megatools('df --batch --total');
				});
			}
		}, {
			name: 'ls',
			run: function(test) {
				return megatools('ls');
			}
		}, {
			name: 'doc',
			run: function(test) {
				return megatools('doc --output . --format man').done(function() {
					return megatools('doc --output . --format txt');
				}).done(function() {
					return megatools('doc --output . --format html');
				});
			}
		}, {
			name: 'contacts',
			run: function(test) {
				return megatools('contacts').done(function() {
					return megatoolsFail('contacts --add --remove megous@megous.com');
				}).done(function() {
					return megatools('contacts -v --add megous@megous.com');
				}).done(function() {
					return megatools('contacts');
				}).done(function() {
					return megatools('contacts -v --remove megous@megous.com');
				});
			}
		}, {
			name: 'export',
			run: function(test) {
				return megatoolsFail('export');
			}
		}, {
			name: 'share',
			run: function(test) {
				return megatools('share');
			}
		}, {
			name: 'import',
			run: function(test) {
				return megatoolsFail('import');
			}
		}, {
			name: 'mkdir',
			run: function(test) {
				return megatoolsFail('mkdir');
			}
		}, {
			name: 'cp',
			run: function(test) {
				return megatoolsFail('cp');
			}
		}, {
			name: 'mv',
			run: function(test) {
				return megatoolsFail('mv');
			}
		}, {
			name: 'rmdir',
			run: function(test) {
				return megatoolsFail('rmdir');
			}
		}, {
			name: 'rm',
			run: function(test) {
				return megatoolsFail('rm');
			}
		}], function(t) {
			return {
				name: t.name,
				run: function(_test) {
					test = _test;

					return Utils.exec('mktemp -d /tmp/megatools-test-' + t.name + '-XXXXXXXXX').then(function(stdout, stderr) {
						C.set_current_dir(stdout.toString().split(/\r?\n/)[0]);
						C.file_write('.megarc', C.file_read(cwd + '/.megarc'));
					}).done(t.run).complete(function() {
						C.set_current_dir(cwd);
					});
				}
			};
		});
	}
});

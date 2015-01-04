GW.define('TestSuite.API', 'TestSuite', {
	name: 'api',

	tests: [{
		name: 'buffer join',
		run: function() {
			var a = Duktape.dec('hex', '001122FF');
			var b1 = Duktape.dec('hex', '0011');
			var b2 = Duktape.dec('hex', '22FF');
			var b3 = Duktape.dec('hex', '');
			var b = C.joinbuf(b1, b2, b3);
			var bempty = C.joinbuf();

			this.assertEq(a, b, 'a != b');
			this.assertEq(bempty, b3, 'bempty != b3');
			this.done();
		}
	}, {
		name: 'buffer slice',
		run: function() {
			var a = Duktape.dec('hex', '001122FF');
			var b1 = Duktape.dec('hex', '0011');
			var b2 = Duktape.dec('hex', '22FF');
			var b3 = Duktape.dec('hex', '');
			var ra = C.slicebuf(a, 0);
			var rb1 = C.slicebuf(a, 0, 2);
			var rb2a = C.slicebuf(a, 2, 2);
			var rb2b = C.slicebuf(a, 2);
			var rb3a = C.slicebuf(a, 4);
			var rb3b = C.slicebuf(a, 10);

			this.assertEq(a, ra, 'a != ra');
			this.assertEq(b1, rb1, 'b1 != rb1');
			this.assertEq(b2, rb2a, 'b2 != rb2a');
			this.assertEq(b2, rb2b, 'b2 != rb2b');
			this.assertEq(b3, rb3a, 'b3 != rb3a');
			this.assertEq(b3, rb3b, 'b3 != rb3b');
			this.done();
		}
	}, {
		name: 'ephemeral',
		run: function() {
			var test = this;
			var api = new MegaAPI();

			Defer.chain([

				function() {
					return api.registerEphemeral('qwe').done(function(res) {
						Log.debug('registerEphemeral.done:', res);
					});
				},

				function(res) {
					return api.loginEphemeral(res.uh, res.password).done(function(res) {
						Log.debug('loginEphemeral.done:', res);
					});
				},

				function(res) {
					return api.getUser().done(function(res) {
						Log.debug('getUser.done:', res);
					});
				}

			]).then(function() {
				test.done();
			}, function(code, message) {
				test.fail(code + ': ' + message);
			});
		}
	}, {
		name: 'prompt',
		run: function() {
			var test = this;

			C.prompt('Enter qwe: ', function(v) {
				test.assertEq(v, 'qwe', 'v != "qwe"');
				test.done();
			});
		}
	}, {
		name: 'register',
		run: function() {
			var test = this;
			var api = new MegaAPI();

			Defer.chain([

				function() {
					return api.registerUser('Bob', 'mt5@megous.com', 'qwe').done(function(res) {
						Log.debug('registerUser.done:', res);
					});
				},

				function(res) {
					function promptCode(done) {
						C.prompt('Enter registration link (or type abort): ', function(v) {
							var m = String(v).match(/https:\/\/mega\.co\.nz\/#confirm([A-Za-z0-9_-]{80,150})/);
							if (m) {
								done(m[1]);
							} else if (String(v).match(/abort/)) {
								done();
							} else {
								promptCode(done);
							}
						});
					}

					return Defer.defer(function(defer) {
						promptCode(function(code) {
							if (code) {
								api.confirmUserFast(code, res.mk, res.pk, res.email).then(defer.resolve, defer.reject);
							} else {
								defer.reject('no_code', 'Missing verification code');
							}
						});
					});
				},

				function(res) {
					return api.getUser().done(function(res) {
						Log.debug('getUser.done:', res);
					});
				}

			]).then(function() {
				test.done();
			}, function(code, message) {
				test.fail(code + ': ' + message);
			});
		}
	}, {
		name: 'login',
		run: function() {
			var test = this;
			var api = new MegaAPI();

			Defer.chain([

				function() {
					return api.login('mt5@megous.com', 'qwe').done(function(res) {
						Log.debug('login.done:', res);
					});
				},

				function(res) {
					return api.getUser().done(function(res) {
						Log.debug('getUser.done:', res);
					});
				}

			]).then(function() {
				test.done();
			}, function(code, message) {
				test.fail(code + ': ' + message);
			});
		}
	}, {
		name: 'tsok',
		run: function() {
			var test = this;
			var api = new MegaAPI();

			var mt6ts = "g3GY0JTZkYHSpAGJ-NlJff5kDSpkTzj5Eihn7we88y0";
			var mt4ts = "4TVLouaTpqANO_LPnHm5kpCd1Tjgdr6GgTxlCyIIfbQ";

			function test_ts(ts, emk, p, expectGood) {
				var pk = C.aes_key_from_password(p);
				var mk = C.aes_dec(pk, C.ub64dec(emk));

				if (!!expectGood != !!api.tsOk(ts, mk)) {
					test.fail('Expectation for tsOk for ' + ts + ' ' + p + ' ' + emk + ' failed');
				}
			}

			test_ts(mt6ts, 'tqhWYTX7YSZbDkhUsDhJ1w', 'qwe', true);
			test_ts(mt6ts, 'tqhWYTX7YSZbDkhUsDhJ1w', 'asdf', false);
			test_ts(mt4ts, 'rioXFMfNlWQbK2TTTn26mg', 'qwe', true);
			test_ts(mt4ts, 'rioXFMfNlWQbK2TTTn26mg', 'qwer', false);
			test.done();
		}
	}]
});

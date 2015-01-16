GW.define('TestSuite.API', 'TestSuite', {
	name: 'api',

	getTests: function() {
		return [{
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
			}
		}, {
			name: 'buffer align',
			run: function() {
				function buf(v) {
					return Duktape.dec('hex', v);
				}

				var a = buf('001122');
				var b = buf('00112233');
				var a_4a = C.alignbuf(a, 4, false);
				var a_4za = C.alignbuf(a, 4, true);
				var b_4a = C.alignbuf(b, 4, false);
				var b_4za = C.alignbuf(b, 4, true);

				this.assertEq(a_4a, buf('00112200'), 'a_4a');
				this.assertEq(a_4za, buf('00112200'), 'a_4za');
				this.assertEq(b_4a, buf('00112233'), 'b_4a');
				this.assertEq(b_4za, buf('0011223300000000'), 'b_4za');
			}
		}, {
			name: 'buffer zero',
			run: function() {
				function buf(v) {
					return Duktape.dec('hex', v);
				}

				this.assertEq(C.zerobuf(4), buf('00000000'), 'zb4');
				this.assertEq(C.zerobuf(1), buf('00'), 'zb1');
				this.assertEq(C.zerobuf(0), buf(''), 'zb0');
			}
		}, {
			name: 'ephemeral',
			run: function() {
				var api = new MegaAPI();

				return api.registerEphemeral('qwe').then(function(res) {
					Log.debug('registerEphemeral.done:', res);

					return api.loginEphemeral(res.uh, res.password);
				}).then(function(res) {
					Log.debug('loginEphemeral.done:', res);

					return api.getUser();
				}).then(function(res) {
					Log.debug('getUser.done:', res);
				});
			}
		}, {
			name: 'prompt',
			run: function(test) {
				return Defer.defer(function(defer) {
					C.prompt('Enter qwe: ', function(v) {
						test.assertEq(v, 'qwe', 'v != "qwe"');
						defer.resolve();
					});
				});
			}
		}, {
			name: 'register',
			run: function() {
				var api = new MegaAPI();

				function promptCode() {
					var defer = Defer.defer();

					function ask() {
						C.prompt('Enter registration link (or type abort): ', function(v) {
							var m = String(v).match(/https:\/\/mega\.co\.nz\/#confirm([A-Za-z0-9_-]{80,150})/);
							if (m) {
								defer.resolve(m[1]);
							} else if (String(v).match(/abort/)) {
								defer.reject('no_code', 'Missing verification code');
							} else {
								ask();
							}
						});
					}

					ask();

					return defer;
				}

				return api.registerUser('Bob', 'mt5@megous.com', 'qwe').then(function(res) {
					Log.debug('registerUser.done:', res);

					return promptCode();
				}).then(function(code) {
					return api.confirmUserFast(code, res.mk, res.pk, res.email);
				}).then(function(res) {
					return api.getUser();
				}).then(function(res) {
					Log.debug('getUser.done:', res);
				});
			}
		}, {
			name: 'login',
			run: function() {
				var api = new MegaAPI();

				return api.login('mt5@megous.com', 'qwe').done(function(res) {
					Log.debug('login.done:', res);

					return api.getUser();
				}).then(function(res) {
					Log.debug('getUser.done:', res);
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
			}
		}];
	}
});

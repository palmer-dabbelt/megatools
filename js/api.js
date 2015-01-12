/**
 * MegaAPI
 *
 * This object consist mostly of remote API call helpers that can be
 * used to perform various operations on user session:
 *
 * - create ephemeral account
 * - upgrade it to full user account
 * - confirm user account from email activation link
 * - get user account information
 * - update user account information
 *
 * API is asynchronous and uses Defer object to provide easy way to work
 * with asynchronous API calls.
 *
 * MegaAPI is not state-less. It's state is stored in sid and callId
 * properties.
 *
 * You can use arbitrary number of independent MegaAPI instances. (if
 * you want to work with two sessions at once for example)
 *
 * API Calls
 * ---------
 *
 * API calls use naming convention for parameters and return values:
 *
 *   mk           - plain master key buffer
 *   emk          - encrypted master key buffer
 *   pk           - password key buffer
 *   password     - plain password string
 *   uh           - user handle
 *   sid          - session id
 *   user         - raw user object returned by the server (a:ug)
 *   email        - user's email address string
 *   name         - real user name string
 *   rsa          - rsa key pair {privk, pubk}
 *   privk        - rsa encrypted private key
 *   pubk         - rsa public key
 *   code         - signup code from the signup email
 *
 * API call methods may receive multiple parameters and always return
 * one object with properties named as show above.
 *
 * Fail callbacks get passed error code and error message parameters.
 * Error code string is meant for machine processing, message is to be
 * understood by humans.
 *
 * List of error codes used by MegaAPI:
 *
 *   EINTERNAL EARGS EAGAIN ERATELIMIT EFAILED ETOOMANY ERANGE EEXPIRED
 *   ENOENT ECIRCULAR EACCESS EEXIST EINCOMPLETE EKEY ESID EBLOCKED
 *   EOVERQUOTA ETEMPUNAVAIL ETOOMANYCONNECTIONS EWRITE EREAD EAPPKEY 
 *
 * API Call Methods Summary
 * ------------------------
 *
 * Raw API calls:
 *
 *   call(request[])       done(result[])
 *   callSingle(request)   done(result) 
 *
 * Note that call() may return error codes in the results array instead
 * of the true return value (meaning you have to handle those on your
 * own). callSingle() handles these per-request errors behind the scenes
 * and calls the fail() callback with appropriate error code and message.
 *
 * You can implement any mega.co.nz API call with these, but MegaAPI
 * also provides convenience methods to do more complicated things:
 *
 * User account management:
 *
 *   registerEphemeral(password)            done({uh, password, ts, mk, pk}) 
 *   loginEphemeral(uh, password)           done({user, uh, sid, pk, password, mk})
 *   registerUser(name, email, password)    done({uh, password, ts, mk, pk, sid, user, c_data, name, email})
 *   confirmUser(code, password)            done({uh, email, name, pk, mk, password, challenge, rsa})
 *   confirmUserFast(code, mk, pk, email)   done({rsa, mk, pk, email, uh})
 *   login(email, password)                 done({user, uh, sid, pk, password, mk, email})
 *   updateUser(user)                       done({uh})
 *   getUser()                              done({user})
 *   changePassword(mk, pk, email, newPassword) done({uh})
 *
 * Methods you'll probably never need:
 *
 *   requestConfirmation(password, mk, name, email)     done({data, password, mk, name, email, c_data})
 *   getConfirmationData(code, password)                done({uh, email, name, pk, mk, password, challenge})
 */
GW.define('MegaAPI', 'object', {

	//host: 'eu.api.mega.co.nz',
	host: 'g.api.mega.co.nz',

	// {{{ errorMessages, errorCodes

	errorMessages: {
		EINTERNAL           : "Internal error",
		EARGS               : "Invalid argument",
		EAGAIN              : "Request failed, retrying",
		ERATELIMIT          : "Rate limit exceeded",
		EFAILED             : "Transfer failed",
		ETOOMANY            : "Too many concurrent connections or transfers",
		ERANGE              : "Out of range",
		EEXPIRED            : "Expired",
		ENOENT              : "Not found",
		ECIRCULAR           : "Circular linkage detected",
		EACCESS             : "Access denied",
		EEXIST              : "Already exists",
		EINCOMPLETE         : "Incomplete",
		EKEY                : "Invalid key/integrity check failed",
		ESID                : "Bad session ID",
		EBLOCKED            : "Blocked",
		EOVERQUOTA          : "Over quota",
		ETEMPUNAVAIL        : "Temporarily not available",
		ETOOMANYCONNECTIONS : "Connection overflow",
		EWRITE              : "Write error",
		EREAD               : "Read error",
		EAPPKEY             : "Invalid application key"
	},

	errorCodes: {
		EINTERNAL           : -1,
		EARGS               : -2,
		EAGAIN              : -3,
		ERATELIMIT          : -4,
		EFAILED             : -5,
		ETOOMANY            : -6,
		ERANGE              : -7,
		EEXPIRED            : -8,
		ENOENT              : -9,
		ECIRCULAR           : -10,
		EACCESS             : -11,
		EEXIST              : -12,
		EINCOMPLETE         : -13,
		EKEY                : -14,
		ESID                : -15,
		EBLOCKED            : -16,
		EOVERQUOTA          : -17,
		ETEMPUNAVAIL        : -18,
		ETOOMANYCONNECTIONS : -19,
		EWRITE              : -20,
		EREAD               : -21,
		EAPPKEY             : -22
	},

	getErrorName: function(num) {
		var key;
		for (key in this.errorCodes) {
			if (this.errorCodes[key] == num) {
				return key;
			}
		}

		return 'EUNKNOWN';
	},

	getErrorMessage: function(name) {
		return this.errorMessages[name] || 'Unknown error';
	},

	// }}}
	// {{{ state

	sid: null,
	sidParamName: null,
	callId: 0,

	setSessionId: function(sid, paramName) {
		this.sid = sid;
		this.sidParamName = paramName;
	},

	// }}}
        // {{{ call

	call: function(requests) {
		var me = this;

		return Defer.defer(function(defer) {
			me.callId++;

			var url = ['https://', me.host, '/cs?id=', me.callId, (me.sid ? ['&', me.sidParamName ? me.sidParamName : 'sid', '=', me.sid].join('') : '')].join('');
			var jsonReq = JSON.stringify(requests);
			var nextTimeout = 10000;

			Log.debug('API CALL', me.callId, 'POST ' + url);
			Log.debug('API CALL', me.callId, '<- ' + Duktape.enc('jx', requests, null, '    '));

			function doRequest() {
				C.http({
					method: 'POST',
					url: url,
					data: jsonReq,
					headers: {
						'Content-Type': 'application/json',
						'User-Agent': 'Megatools 2.0',
						'Referer': 'https://mega.co.nz/'
					},
					onload: function(data) {
						var response = JSON.parse(data);

						Log.debug('API CALL', me.callId, '-> ' + Duktape.enc('jx', response, null, '    '));

						if (_.isNumber(response)) {
							var code = me.getErrorName(response);

							defer.reject(code, me.getErrorMessage(code));
						} else if (_.isArray(response)) {
							defer.resolve(response);
						} else {
							defer.reject('empty');
						}
					},
					onerror: function(code, msg) {
						if (code == 'busy' || code == 'no_response') {
							Log.debug('API CALL RETRY', me.callId);

							if (nextTimeout < 120 * 1000 * 1000) {
								// repeat our request
								C.timeout(function() {
									doRequest();
								}, nextTimeout);

								nextTimeout *= 2;
							}
						} else {
							defer.reject(code, msg);
						}
					}
				});
			}

			doRequest();
		});
	},

	// }}}
	// {{{ callSingle

	callSingle: function(request) {
		if (this.batch) {
			var defer = Defer.defer();
			defer.request = request;
			this.batch.push(defer);
			return defer;
		}

		return Defer.defer(function(defer) {
			this.call([request]).then(function(responses) {
				if (_.isNumber(responses[0]) && responses[0] < 0) {
					var code = this.getErrorName(responses[0]);

					defer.reject(code, this.getErrorMessage(code));
				} else {
					defer.resolve(responses[0]);
				}
			}, defer.reject, this);
		}, this);
	},

	// }}}
	// {{{ startBatch

	startBatch: function() {
		this.batch = [];
	},

	// }}}
	// {{{ sendBatch

	sendBatch: function() {
		var batch = this.batch;
		delete this.batch;

		if (batch && batch.length > 0) {
			return this.call(_.pluck(batch, 'request')).then(function(responses) {
				_.each(responses, function(response, idx) {
					var defer = batch[idx];

					if (_.isNumber(response) && response < 0) {
						var code = this.getErrorName(response);

						defer.reject(code, this.getErrorMessage(code));
					} else {
						defer.resolve(response);
					}
				}, this);
			}, function(code, msg) {
				_.invoke(batch, 'reject', code, msg);
			}, this);
		}

		return Defer.resolved();
	},

	// }}}
	// {{{ cancelBatch

	cancelBatch: function() {
		delete this.batch;
	},

	// }}}
	// {{{ registerEphemeral

	/**
	 * Create ephemeral account
	 *
	 * Returns user handle string.
	 */
	registerEphemeral: function(password) {
		var pk = C.aes_key_from_password(password);
		var mk = C.aes_key_random();
		var emk = C.aes_enc(pk, mk);
		var ts1 = C.random(16);
		var ts2 = C.aes_enc(mk, ts1);
		var ts = C.joinbuf(ts1, ts2);

		return this.callSingle({
			a: 'up',
			k: C.ub64enc(emk),
			ts: C.ub64enc(ts)
		}).done(function(uh) {
			this.setArgs({
				uh: uh,
				password: password,
				ts: ts,
				mk: mk,
				pk: pk
			});
		});
	},

	// }}}
	// {{{ loginEphemeral
	
	tsOk: function(ts, mk) {
		var tsbuf = C.ub64dec(ts);

		if (tsbuf.length < 32) {
			return false;
		}

		var ts1 = C.slicebuf(tsbuf, 0, 16);
		var ts2a = C.slicebuf(tsbuf, tsbuf.length - 16, 16);
		var ts2b = C.aes_enc(mk, ts1);

		return ts2a == ts2b;
	},

	/**
	 * Login to ephemeral account
	 *
	 * Returns user object from mega and master key.
	 */
	loginEphemeral: function(uh, password) {
		this.setSessionId();

		return Defer.defer(function(defer) {
			this.callSingle({
				a: 'us',
				user: uh
			}).then(function(res) {
				var pk = C.aes_key_from_password(password);
				var emk = C.ub64dec(res.k);
				var mk = C.aes_dec(pk, emk);

				if (!this.tsOk(res.tsid, mk)) {
					defer.reject('invalid_tsid', 'Invalid password (TSID verification failed)');
					return;
				}

				this.setSessionId(res.tsid);

				defer.resolve({
					uh: uh,
					sid: res.tsid,
					password: password,
					pk: pk,
					mk: mk
				});
			}, defer.reject, this);
		}, this);
	},

	// }}}
	// {{{ login

	/**
	 * Login to normal account.
	 */
	login: function(email, password) {
		this.setSessionId();

		return Defer.defer(function(defer) {
			var pk = C.aes_key_from_password(password);

			this.callSingle({
				a: 'us',
				uh: C.make_username_hash(pk, email),
				user: email.toLowerCase()
			}).then(function(res) {
                                // decrypt mk
				var emk = C.ub64dec(res.k);
				var mk = C.aes_dec(pk, emk);
				var sid;

				if (res.csid) {
					sid = C.rsa_decrypt_sid(res.privk, mk, res.csid);
					if (!sid) {
						defer.reject('sid_decrypt_fail', 'Invalid password (CSID decryption failed)');
						return;
					}
				} else if (res.tsid) {
					if (!this.tsOk(res.tsid, mk)) {
						defer.reject('invalid_tsid', 'Invalid password (TSID verification failed)');
						return;
					}

					sid = res.tsid;
				}

				this.setSessionId(sid);

				defer.resolve({
					uh: res.u,
					sid: sid,
					email: email,
					password: password,
					pk: pk,
					mk: mk
				});
			}, defer.reject, this);
		}, this);
	},

	// }}}
	// {{{ getUser

	getUser: function() {
		return this.callSingle({
			a: 'ug'
		}).done(function(user) {
			this.setArgs({
				user: user
			});
		});
	},

	// }}}
	// {{{ updateUser

	/**
	 * Update user name
	 *
	 * Returns user handle
	 */
	updateUser: function(data) {
		return this.callSingle(_.extend({
			a: 'up'
		}, data)).done(function(uh) {
			this.setArgs({
				uh: uh
			});
		});
	},

	// }}}

	/**
	 * Request confirmation email to be sent by the server to specified email address.
	 */
	requestConfirmation: function(password, mk, name, email) {
		var pk = C.aes_key_from_password(password);
		var c_data = C.aes_enc(pk, C.joinbuf(mk, C.random(4), C.zerobuf(8), C.random(4)));

		return this.callSingle({
			a: 'uc',
			c: C.ub64enc(c_data),
			n: C.ub64enc(Duktape.Buffer(name)),
			m: C.ub64enc(Duktape.Buffer(email))
		}).done(function(data) {
			this.setArgs({
				data: data,
				password: password,
				mk: mk,
				name: name,
				email: email,
				c_data: c_data
			});
		});
	},

	/**
	 * Register user (full registration)
	 */
	registerUser: function(name, email, password) {
		var me = this;
		var data = {};

		data.email = email;
		data.name = name;

		return Defer.chain([
			function() {
				return me.registerEphemeral(password);
			}, 

			function(res) {
				_.extend(data, res);

				return me.loginEphemeral(data.uh, password);
			}, 

			function(res) {
				_.extend(data, res);

				return me.updateUser({name: name});
			}, 

			function(res) {
				_.extend(data, res);

				return me.requestConfirmation(password, data.mk, name, email);
			}
		]).done(function(res) {
			_.extend(data, res);

			this.setArgs(data);
		});
	},

	confirmUserFast: function(code, mk, pk, email) {
		var data = {};

		data.rsa = C.rsa_generate(mk);
		data.mk = mk;
		data.pk = pk;
		data.email = email;
		data.code = code;

		return this.updateUser({
			c: code,
			uh: C.make_username_hash(pk, email),
			pubk: data.rsa.pubk,
			privk: data.rsa.privk
		}).done(function(res) {
			_.extend(data, res);

			this.setArgs(data);
		});
	},

	/**
	 * Get data that were stored to the server for later retrival during account confirmation.
	 *
	 * Confirmation link: https://mega.co.nz/#confirmZOB7VJrNXFvCzyZBIcdWhr5l4dJatrWpEjEpAmH17ieRRWFjWAUAtSqaVQ_TQKltZWdvdXNAZW1haWwuY3oJQm9iIEJyb3duMhVh8n67rBg
	 * Code: ZOB7VJrNXFvCzyZBIcdWhr5l4dJatrWpEjEpAmH17ieRRWFjWAUAtSqaVQ_TQKltZWdvdXNAZW1haWwuY3oJQm9iIEJyb3duMhVh8n67rBg
	 */
	getConfirmationData: function(code, password) {
		var me = this;
		var data = {};

		return Defer.defer(function(defer) {
			return me.callSingle({
				a: 'ud',
				c: code
			}).then(function(res) {
				data.email = C.ub64dec(res[0]).toString();
				data.name = C.ub64dec(res[1]).toString();
				data.uh = res[2];
				data.pk = C.aes_key_from_password(password);
				data.emk = C.ub64dec(res[3]);
				data.challenge = C.aes_dec(data.pk, C.ub64dec(res[4]));
				data.mk = C.aes_dec(data.pk, data.emk);
				data.password = password;

				// check challenge
				if (C.slicebuf(data.challenge, 4, 8) == C.zerobuf(8)) {
					defer.resolve(data);
				} else {
					defer.reject('bad_password', 'Invalid password');
				}
			}, defer.reject);
		});
	},

	confirmUser: function(code, password) {
		var me = this;
		var data = {};

		return Defer.chain([
			function() {
				return me.getConfirmationData(code, password);
			}, 

			function(res) {
				_.extend(data, res);

				return me.loginEphemeral(data.uh, password);
			}, 

			function(res) {
				_.extend(data, res);

				return me.confirmUserFast(code, data.mk, data.pk, data.email);
			}
		]).done(function(res) {
			_.extend(data, res);

			this.setArgs(data);
		});
	},

	completeUserReset: function(code, email, password) {
		var me = this;
		var data = {};
		var mk = C.aes_key_random();
		var pk = C.aes_key_from_password(password);
		var emk = C.aes_enc(pk, mk);
		var ts1 = C.random(16);
		var ts2 = C.aes_enc(mk, ts1);

		return Defer.chain([
			function() {
				return me.callSingle({
					a: "erx",
					c: code,
					x: C.ub64enc(emk),
					y: C.make_username_hash(pk, email),
					z: C.ub64enc(C.joinbuf(ts1, ts2))
				});
			},

			function() {
				return me.login(email, password);
			},

			function(res) {
				_.extend(data, res);

				data.rsa = C.rsa_generate(data.mk);

				return me.updateUser({
					pubk: data.rsa.pubk,
					privk: data.rsa.privk
				});
			}
		]).done(function() {
			this.setArgs(data);
		});
	},

	requestUserReset: function(email) {
		return this.callSingle({
			a: "erm",
			m: email,
			t: 10
		});
	}
});

_.extend(MegaAPI, {
	makeNodeAttrs: function(nk, attrs) {
		return C.ub64enc(C.aes_enc_cbc(nk, C.alignbuf(Duktape.Buffer('MEGA' + JSON.stringify(attrs)), 16, true)));
	}
});
